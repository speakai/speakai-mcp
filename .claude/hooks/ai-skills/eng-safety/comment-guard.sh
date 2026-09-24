#!/usr/bin/env bash
# PostToolUse: nudge the agent when an edit adds a multi-line comment. It never blocks: the
# edit has already happened, and the only effect is a short note the agent sees next to the
# tool result.
#   Claude Code: Write|Edit|MultiEdit. Prints {"decision":"block","reason":...}, which adds the
#                reason next to the tool result and leaves the edit and the result in place.
#   Codex:       apply_patch. Prints hookSpecificOutput.additionalContext, because a Codex
#                PostToolUse "block" replaces the tool result with an error and the agent
#                would think the patch failed.
# Only the lines this call adds are checked: Edit and MultiEdit diff old_string against
# new_string, Write diffs against HEAD when the file is tracked, apply_patch reads its "+"
# lines. Flagged: 2+ consecutive comment-only lines, or a block comment (/* */, /** */,
# {/* */}, a Python docstring) spanning 2+ lines, in code files only. Skipped: license
# headers, shebangs, lint and type directives, generated or vendored paths and files marked
# @generated. Anything unexpected (bad JSON, no jq, no diff) exits 0 with no output.
set -u

RULE="Team rule: comments are one line and explain why, not what. Trim this to one line unless the logic is genuinely complex; if you keep it, say why in your reply."
MAX_LOCATIONS=5

command -v jq >/dev/null 2>&1 || exit 0
command -v diff >/dev/null 2>&1 || exit 0
input=$(cat) || exit 0

WORK=$(mktemp -d 2>/dev/null) || exit 0
trap 'rm -rf "$WORK"' EXIT
STREAM="$WORK/stream"

# One record per line: "F<TAB>path" starts a file, "A<TAB>text" is an added line and "B" ends
# a run of consecutive added lines (see _added-lines.sh).
. "$(dirname "$0")/_added-lines.sh" 2>/dev/null || exit 0
read_event "$WORK" || exit 0
added_lines_stream "$WORK" > "$STREAM" || exit 0

# Find the flagged comment blocks. Output per block: "P<TAB>path", one "X<TAB>line" per line
# of the block, then "E".
awk '
  function lang(p,   lp) {
    lp = tolower(p)
    if (lp ~ /(^|\/)(dist|build|node_modules|coverage|vendor)\//) return ""
    if (lp ~ /\.min\.[^\/]*$/ || lp ~ /\.generated\.[^\/]*$/) return ""
    if (lp ~ /\.(ts|tsx|js|jsx|mjs|cjs|go|rs|java|kt|swift|css|scss)$/) return "c"
    if (lp ~ /\.py$/) return "py"
    if (lp ~ /\.(sh|bash)$/) return "sh"
    return ""
  }
  function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t\r]+$/, "", s); return s }
  function is_directive(t,   lt) {
    lt = tolower(t)
    return lt ~ /eslint|@ts-(ignore|expect-error|nocheck|check)|prettier-ignore|biome-ignore|istanbul ignore|c8 ignore|noqa|type: *ignore|pylint: *(disable|enable)|pragma: *no *cover|shellcheck (disable|source|shell)|fmt: *(off|on|skip)|isort: *|mypy: *|nolint|^\/\/ *go:|^\/\/go:|\+build|\/\/\/ *<reference|@jsx|webpackchunkname|@vite-ignore|-\*- *coding/
  }
  function is_license(t,   lt) {
    lt = tolower(t)
    return lt ~ /copyright|spdx-license-identifier|@license|licensed under|all rights reserved|permission is hereby granted/
  }
  function reset_group() { gn = 0; glic = 0 }
  function flush_group(   i) {
    if (gn >= 2 && !glic) {
      nf++; out[nf] = "P\t" path
      for (i = 1; i <= gn; i++) out[nf] = out[nf] "\nX\t" g[i]
    }
    reset_group()
  }
  function add_group(raw, t) { g[++gn] = raw; if (is_license(t)) glic = 1 }
  function end_block(   i) {
    if (bn >= 2 && !blic && !bdir) {
      nf++; out[nf] = "P\t" path
      for (i = 1; i <= bn; i++) out[nf] = out[nf] "\nX\t" b[i]
    }
    inblock = 0; bn = 0; blic = 0; bdir = 0
  }
  function end_run() {
    if (inblock) end_block()
    flush_group(); prev = ""
  }
  function end_file(   i) {
    end_run()
    if (!generated) for (i = 1; i <= nf; i++) print out[i] "\nE"
    nf = 0; generated = 0
  }
  BEGIN { FS = "\n"; reset_group() }
  /^F\t/ { end_file(); path = substr($0, 3); L = lang(path); next }
  /^B$/  { end_run(); next }
  /^A\t/ {
    if (L == "") next
    raw = substr($0, 3); t = trim(raw)
    if (index(raw, "@generated")) generated = 1
    if (inblock) {
      b[++bn] = raw
      if (is_license(t)) blic = 1
      if (is_directive(t)) bdir = 1
      if (index(t, closer)) end_block()
      if (t != "") prev = t
      next
    }
    if (t == "") { flush_group(); next }
    if (L == "c" && (substr(t, 1, 2) == "/*" || substr(t, 1, 3) == "{/*")) {
      rest = substr(t, index(t, "/*") + 2)
      if (index(rest, "*/")) {
        # A one-line /* */ comment is comment-only when nothing but "}" follows it.
        after = substr(rest, index(rest, "*/") + 2)
        if (after == "" || after == "}") {
          if (is_directive(t)) flush_group(); else add_group(raw, t)
        } else flush_group()
      } else {
        flush_group(); inblock = 1; closer = "*/"; bn = 0; b[++bn] = raw
        blic = is_license(t); bdir = is_directive(t)
      }
      prev = t; next
    }
    if (L == "py" && t ~ /^[rRuUbBfF]?("""|\047\047\047)/ && (prev == "" || prev ~ /:$/)) {
      s = t; sub(/^[rRuUbBfF]/, "", s)
      q = substr(s, 1, 3); rest = substr(s, 4)
      if (index(rest, q)) add_group(raw, t)
      else {
        flush_group(); inblock = 1; closer = q; bn = 0; b[++bn] = raw
        blic = is_license(t); bdir = 0
      }
      prev = t; next
    }
    line_comment = (L == "c" && substr(t, 1, 2) == "//") || ((L == "py" || L == "sh") && substr(t, 1, 1) == "#" && substr(t, 1, 2) != "#!")
    if (line_comment) {
      if (is_directive(t)) flush_group(); else add_group(raw, t)
    } else flush_group()
    prev = t
  }
  END { end_file() }
' "$STREAM" > "$WORK/flags" 2>/dev/null || exit 0
[ -s "$WORK/flags" ] || exit 0

# Turn each block into "path:line", reading the file on disk (the edit has already been
# applied) to find where the block starts. A file marked @generated on disk is skipped.
TAB=$(printf '\t')
locations=""; count=0
path=""
: > "$WORK/block"
while IFS= read -r rec; do
  case "$rec" in
    "P${TAB}"*) path=${rec#P"$TAB"}; : > "$WORK/block" ;;
    "X${TAB}"*) printf '%s\n' "${rec#X"$TAB"}" >> "$WORK/block" ;;
    E)
      abs=$(abs_path "$path")
      if [ -f "$abs" ] && head -n 40 "$abs" 2>/dev/null | grep -q '@generated'; then continue; fi
      shown=$path
      case "$shown" in "$cwd"/*) shown=${shown#"$cwd"/} ;; esac
      line=""
      if [ -f "$abs" ]; then
        line=$(awk 'NR == FNR { want[++n] = $0; next }
                    { have[++m] = $0 }
                    END { for (i = 1; i + n - 1 <= m; i++) {
                            ok = 1
                            for (j = 1; j <= n; j++) if (have[i + j - 1] != want[j]) { ok = 0; break }
                            if (ok) { print i; exit }
                          } }' "$WORK/block" "$abs" 2>/dev/null)
      fi
      count=$((count + 1))
      if [ "$count" -le "$MAX_LOCATIONS" ]; then
        loc=$shown; [ -n "$line" ] && loc="$shown:$line"
        if [ -z "$locations" ]; then locations=$loc; else locations="$locations, $loc"; fi
      fi
      ;;
  esac
done < "$WORK/flags"
[ "$count" -gt 0 ] || exit 0
[ "$count" -gt "$MAX_LOCATIONS" ] && locations="$locations and $((count - MAX_LOCATIONS)) more"

msg="Multi-line comment added at $locations. $RULE"
if [ "$tool" = apply_patch ]; then
  jq -nc --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}' 2>/dev/null
else
  jq -nc --arg m "$msg" '{decision: "block", reason: $m}' 2>/dev/null
fi
exit 0
