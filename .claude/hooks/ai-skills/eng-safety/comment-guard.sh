#!/usr/bin/env bash
# PostToolUse: nudge the agent when an edit adds a multi-line comment, a decorative banner or
# a comment that only repeats the name or type below it. It never blocks: the edit has already
# happened, and the only effect is a short note the agent sees next to the tool result.
#   Claude Code: Write|Edit|MultiEdit. Prints {"decision":"block","reason":...}, which adds the
#                reason next to the tool result and leaves the edit and the result in place.
#   Codex:       apply_patch. Prints hookSpecificOutput.additionalContext, because a Codex
#                PostToolUse "block" replaces the tool result with an error and the agent
#                would think the patch failed.
# Only the lines this call adds are checked: Edit and MultiEdit diff old_string against
# new_string, Write diffs against HEAD when the file is tracked, apply_patch reads its "+"
# lines. Flagged, in code files only:
#   M: 2+ consecutive comment-only lines, or a block comment (/* */, /** */, {/* */}, a Python
#      docstring) spanning 2+ lines.
#   D: a banner, i.e. a comment line mostly made of rule characters (- = * # ~ _ ─ ═) or a
#      title between or after runs of them ("// ── Title ──"). And, in C-family files, a lone
#      one-line comment right above an added field, property, parameter or typed variable line
#      ("name: string;") that has 1-4 words, or that holds 60%+ of the name's words with at
#      most 2 other distinct content words. Never D: a comment with a @tag, a URL, a TODO or
#      FIXME with an issue id, or a reason word (because, so that, otherwise, must, never,
#      only, unless, e.g., i.e., note, default, example, format). The 1-4 word check also
#      skips a digit, a unit or bound (ms, bytes, max ...) or format punctuation (# ; = < > (
#      and quotes); the name check still applies to those.
# Skipped: license headers, shebangs, lint and type directives, generated or vendored paths and
# files marked @generated. Not inspected: comments above functions, classes or Go and Java
# style fields, trailing comments, and banners inside Python docstrings; the backstop is review
# (the speak-gap-check skill lists the comments a branch adds). Anything unexpected (bad JSON,
# no jq, no diff) exits 0 with no output.
set -u

RULE="Team rule: comments are one line and explain why, not what. Trim this to one line unless the logic is genuinely complex; if you keep it, say why in your reply."
RULE_RESTATE="Team rule: comments explain why in one line. This comment looks like it repeats the name or type, or is decorative; remove it unless it adds a reason."
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

# Find the flagged comment blocks. Output per block: "P<TAB>kind<TAB>path" (kind M or D, see
# the header), one "X<TAB>line" per line of the block, then "E".
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
  # words: lowercase words of s, with camelCase and snake_case split.
  function words(s,   i, c, p, o) {
    for (i = 1; i <= length(s); i++) { c = substr(s, i, 1); if (c ~ /[A-Z]/ && p ~ /[a-z0-9]/) o = o " "; o = o c; p = c }
    o = tolower(o); gsub(/[^a-z0-9]+/, " ", o); return trim(o)
  }
  function stem(w) { if (length(w) > 3 && w ~ /s$/ && w !~ /ss$/) w = substr(w, 1, length(w) - 1); return w }
  function text_of(t) { t = trim(t); sub(/^(\{\/\*+|\/\/+|\/\*+|#|\*+)/, "", t); sub(/\*+\/\}?$/, "", t); return trim(t) }
  function banner(t,   c, s, n) {
    c = trim(t); sub(/^(\{\/\*|\/\/|\/\*|#|\*)/, "", c); sub(/\*\/\}?$/, "", c); c = trim(c); gsub(/─|━|═/, "=", c)
    s = c; gsub(/[ \t]/, "", s)
    if (length(s) < 3 || index(c, "|")) return 0
    n = gsub(/[-=*#~_]/, "&", s)
    if (s ~ /[-=*#~_][-=*#~_][-=*#~_]/ && n * 10 >= length(s) * 6) return 1
    return c ~ /^[-=*#~_][-=*#~_]+ .* [-=*#~_][-=*#~_]+$/ || c ~ /^[-=*#~_][-=*#~_][-=*#~_]/ || c ~ /[-=*#~_][-=*#~_][-=*#~_]$/
  }
  # restates: true when the lone comment line t only repeats the name or type on line code.
  function restates(t, code,   c, lc, d, id, nw, tok, cw, iw, ni, nc, i, j, hit, extra, w, mine, seen) {
    c = text_of(t); lc = " " tolower(c) " "
    if (c == "" || banner(t) || c ~ /@[A-Za-z]/ || lc ~ /:\/\/|www\./ || index(lc, "e.g.") || index(lc, "i.e.")) return 0
    if (lc ~ /[^a-z](because|so that|otherwise|must|never|only|unless|note|defaults?|example|format)[^a-z]/) return 0
    if (c ~ /(TODO|FIXME)[(: ]*([A-Z][A-Z0-9]*-[0-9]+|#[0-9]+)/) return 0
    d = code
    while (sub(/^(export|public|private|protected|readonly|static|declare|abstract|override|val|var|let|const)[ \t]+/, "", d)) ;
    if (!match(d, /^[A-Za-z_$][A-Za-z0-9_$]*[?!]?[ \t]*:/) || substr(d, RLENGTH + 1, 1) == ":") return 0
    id = d; sub(/[?!]?[ \t]*:.*$/, "", id)
    if (id == "default" || id == "case") return 0
    nw = split(c, tok, /[ \t]+/)
    if (nw <= 4 && c !~ /[#;=<>("\047`]/ && lc !~ /[0-9]/ && lc !~ /[^a-z](ms|millis|milliseconds?|secs?|seconds?|mins?|minutes?|hours?|hrs?|days?|weeks?|months?|years?|bytes?|kb|mb|gb|px|rem|percent|pct|utc|iso|epoch|inclusive|exclusive|max|maximum|min|minimum|cents?|ratio|range)[^a-z]/) return 1
    ni = split(words(id), iw, " "); nc = split(words(c), cw, " ")
    hit = 0; extra = 0
    for (i = 1; i <= ni; i++) for (j = 1; j <= nc; j++) if (stem(iw[i]) == stem(cw[j])) { hit++; break }
    for (j = 1; j <= nc; j++) {
      w = cw[j]; mine = 0
      for (i = 1; i <= ni; i++) if (stem(iw[i]) == stem(w)) mine = 1
      if (!mine && !(w in seen) && w !~ /^(a|an|the|this|that|these|those|of|to|in|into|on|at|by|for|from|with|and|or|is|are|was|were|be|been|it|its|as|which|who|whose|whoever|when|where|what)$/) { extra++; seen[w] = 1 }
    }
    return ni > 0 && hit * 10 >= ni * 6 && extra <= 2
  }
  function flag1(kind, raw) { nf++; out[nf] = "P\t" kind "\t" path "\nX\t" raw }
  function reset_group() { gn = 0; glic = 0 }
  function flush_group(   i) {
    if (gn >= 2 && !glic) {
      nf++; out[nf] = "P\tM\t" path
      for (i = 1; i <= gn; i++) out[nf] = out[nf] "\nX\t" g[i]
    }
    reset_group()
  }
  function add_group(raw, t) {
    g[++gn] = raw; if (is_license(t)) glic = 1
    if (!is_license(t) && banner(t)) flag1("D", raw)
  }
  function end_block(   i) {
    if (bn >= 2 && !blic && !bdir) {
      nf++; out[nf] = "P\tM\t" path
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
      if (closer == "*/" && !blic && !bdir && banner(t)) flag1("D", raw)
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
        if (!blic && !bdir && banner(t)) flag1("D", raw)
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
    } else {
      if (L == "c" && gn == 1 && !glic && restates(g[1], t)) flag1("D", g[1])
      flush_group()
    }
    prev = t
  }
  END { end_file() }
' "$STREAM" > "$WORK/flags" 2>/dev/null || exit 0
[ -s "$WORK/flags" ] || exit 0

# locations KIND prints the blocks of that kind as "path:line, path:line", up to MAX_LOCATIONS
# then "and N more", reading the file on disk (the edit has already been applied) to find where
# each block starts. A file marked @generated on disk is skipped.
TAB=$(printf '\t')
locations() {
  local want=$1 rec kind="" path="" abs shown line loc list="" count=0
  : > "$WORK/block"
  while IFS= read -r rec; do
    case "$rec" in
      "P${TAB}"*) rec=${rec#P"$TAB"}; kind=${rec%%"$TAB"*}; path=${rec#*"$TAB"}; : > "$WORK/block" ;;
      "X${TAB}"*) printf '%s\n' "${rec#X"$TAB"}" >> "$WORK/block" ;;
      E)
        [ "$kind" = "$want" ] || continue
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
          if [ -z "$list" ]; then list=$loc; else list="$list, $loc"; fi
        fi
        ;;
    esac
  done < "$WORK/flags"
  [ "$count" -gt "$MAX_LOCATIONS" ] && list="$list and $((count - MAX_LOCATIONS)) more"
  printf '%s' "$list"
}

msg=""
where=$(locations M); [ -n "$where" ] && msg="Multi-line comment added at $where. $RULE"
where=$(locations D); [ -n "$where" ] && msg="$msg${msg:+ }Restating or decorative comment added at $where. $RULE_RESTATE"
[ -n "$msg" ] || exit 0
if [ "$tool" = apply_patch ]; then
  jq -nc --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}' 2>/dev/null
else
  jq -nc --arg m "$msg" '{decision: "block", reason: $m}' 2>/dev/null
fi
exit 0
