#!/usr/bin/env bash
# PostToolUse: nudge the agent when an edit adds a disabled or low-signal test. It never
# blocks: the edit has already happened, and the only effect is a short note next to the tool
# result.
#   Claude Code: Write|Edit|MultiEdit. Prints {"decision":"block","reason":...}, which adds the
#                reason next to the tool result and leaves the edit in place.
#   Codex:       apply_patch. Prints hookSpecificOutput.additionalContext, because a Codex
#                PostToolUse "block" replaces the tool result with an error.
# Only the lines this call adds are checked (_added-lines.sh), in JS and TS test files:
# *.test.*, *.spec.* and files under __tests__/. A test counts as new only when its opening
# line and its closing line are both added. The message texts below are the same text as the
# "Forbidden patterns" table of the testing-policy skill (a test checks it), so hook and skill
# never disagree.
# Not inspected: other languages, patterns split across lines or built by helpers, assertions
# inside helpers not named expect* or assert*, and test files written through the shell. The
# backstop is a CI lint (forbidOnly, eslint-plugin-jest or eslint-plugin-vitest), a follow-up.
# Anything unexpected (bad JSON, no jq, no diff) exits 0 with no output.
set -u

MAX_LOCATIONS=5
MSG_ONLY='`.only`, `fit` or `fdescribe` left in a test (rule no-only)'
MSG_SKIP='`.skip`, `xit` or `xdescribe` without a reason comment (rule no-skip)'
MSG_TRUE='`expect(true).toBe(true)` or another assertion that cannot fail (rule real-assertion)'
MSG_NOASSERT='a new test with no assertion (rule real-assertion)'
MSG_SNAPSHOT='a new test whose only assertions are snapshots (rule no-snapshot-only)'
MSG_SELFMOCK='mocking the module under test (rule no-self-mock)'
MSG_CALLED='a new test whose only assertions are bare `toHaveBeenCalled()`; `toHaveBeenCalledWith` is fine (rule assert-arguments)'
FOOTER='Fix it, or say in your reply why it stays. Full rules: the testing-policy skill, where installed.'

command -v jq >/dev/null 2>&1 || exit 0
command -v diff >/dev/null 2>&1 || exit 0
input=$(cat) || exit 0

WORK=$(mktemp -d 2>/dev/null) || exit 0
trap 'rm -rf "$WORK"' EXIT
. "$(dirname "$0")/_added-lines.sh" 2>/dev/null || exit 0
read_event "$WORK" || exit 0
added_lines_stream "$WORK" > "$WORK/stream" || exit 0

# One finding per line: "KEY<TAB>path<TAB>added line".
awk '
  function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t\r]+$/, "", s); return s }
  function flag(key, line) { print key "\t" path "\t" line }
  # count takes the regex as a string: a /regex/ argument is matched against $0 instead.
  function count(s, re,   n) { n = 0; while (match(s, re)) { n++; s = substr(s, RSTART + RLENGTH) } return n }
  function bare_called(s,   n) {
    n = 0
    while (match(s, /\.(toHaveBeenCalled|toBeCalled)\(\)/)) {
      if (RSTART < 4 || substr(s, RSTART - 3, 3) != "not") n++
      s = substr(s, RSTART + RLENGTH)
    }
    return n
  }
  function close_test(   asserts, other, total) {
    if (!tskip) {
      asserts = count(body, "(^|[^A-Za-z0-9_$])(expect|assert)[A-Za-z0-9_]*[.(]") + count(body, "\\.should[.(]")
      other = count(body, "(^|[^A-Za-z0-9_$])assert[A-Za-z0-9_]*[.(]") + count(body, "\\.should[.(]")
      total = count(body, "\\.to[A-Z][A-Za-z]*\\(")
      if (asserts == 0) flag("NOASSERT", tstart)
      else if (other == 0 && total > 0 && count(body, "\\.toMatch(Inline|File)?Snapshot\\(") == total) flag("SNAPSHOT", tstart)
      else if (other == 0 && total > 0 && bare_called(body) == total) flag("CALLED", tstart)
    }
    intest = 0
  }
  function end_run() { intest = 0; prevcomment = 0 }
  /^F\t/ {
    end_run(); path = substr($0, 3); lp = tolower(path)
    istest = (lp ~ /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/ || lp ~ /(^|\/)__tests__\/[^\/]*\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/) && lp !~ /(^|\/)(node_modules|dist|build|coverage|vendor)\//
    subject = path; sub(/^.*\//, "", subject); sub(/\.(test|spec)?\.?(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/, "", subject)
    next
  }
  /^B$/ { end_run(); next }
  /^A\t/ {
    if (!istest) next
    raw = substr($0, 3); t = trim(raw)
    if (t ~ /^(\/\/|\/\*|\*)/) { prevcomment = 1; next }
    if (t ~ /(^|[^A-Za-z0-9_$])(it|test|describe|context|suite)\.only\(/ || t ~ /(^|[^A-Za-z0-9_$.])(fit|fdescribe|ftest)\(/) flag("ONLY", raw)
    titled_skip = t ~ /(^|[^A-Za-z0-9_$])(it|test|describe|context|suite)\.skip\([ \t]*["\047`]/ || t ~ /(^|[^A-Za-z0-9_$.])(xit|xdescribe|xtest)\(/
    if (titled_skip && !prevcomment && t !~ /\/\/|\/\*/) flag("SKIP", raw)
    if (t ~ /expect\([ ]*(true|false|1|0)[ ]*\)\.(toBe|toEqual|toStrictEqual)\([ ]*(true|false|1|0)[ ]*\)/ || t ~ /expect\(true\)\.toBeTruthy\(\)|expect\(false\)\.toBeFalsy\(\)/) flag("TRUE", raw)
    if (match(t, /(vi|jest)\.(mock|doMock|unstable_mockModule)\([ ]*["\047`][^"\047`]*\//)) {
      rest = substr(t, RSTART + RLENGTH)
      if (match(rest, /^[^"\047`]*/)) { last = substr(rest, 1, RLENGTH); sub(/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/, "", last); if (last == subject) flag("SELFMOCK", raw) }
    }
    prevcomment = 0
    isstart = t ~ /^(it|test|fit|xit|xtest)(\.(only|skip|concurrent|failing|fails|sequential|todo))*[ \t]*\([ \t]*["\047`]/ || t ~ /^(it|test)\.each/
    match(raw, /^[ \t]*/); indent = substr(raw, 1, RLENGTH)
    if (intest && isstart && indent == tindent) intest = 0
    if (intest) {
      body = body "\n" t
      if (indent == tindent && t ~ /^[})]/) close_test()
      next
    }
    if (isstart) {
      tstart = raw; body = t; tskip = (t ~ /^(xit|xtest)|\.(skip|todo)/); intest = 1; tindent = indent
      if (t ~ /\)[ \t]*;?$/ && t ~ /=>|function/) close_test()
    }
  }
' "$WORK/stream" > "$WORK/flags" 2>/dev/null || exit 0
[ -s "$WORK/flags" ] || exit 0

# Group the findings by message, each with up to MAX_LOCATIONS "path:line" locations found by
# matching the added line in the file on disk (the edit has already been applied).
TAB=$(printf '\t')
msg=""
for key in ONLY SKIP TRUE NOASSERT SNAPSHOT SELFMOCK CALLED; do
  locations=""; count=0
  while IFS="$TAB" read -r k path raw; do
    [ "$k" = "$key" ] || continue
    count=$((count + 1)); [ "$count" -le "$MAX_LOCATIONS" ] || continue
    abs=$(abs_path "$path"); shown=$path
    case "$shown" in "$cwd"/*) shown=${shown#"$cwd"/} ;; esac
    line=""; [ -f "$abs" ] && line=$(grep -nxF -- "$raw" "$abs" 2>/dev/null | head -n 1 | cut -d: -f1)
    loc=$shown; [ -n "$line" ] && loc="$shown:$line"
    if [ -z "$locations" ]; then locations=$loc; else locations="$locations, $loc"; fi
  done < "$WORK/flags"
  [ "$count" -gt 0 ] || continue
  [ "$count" -gt "$MAX_LOCATIONS" ] && locations="$locations and $((count - MAX_LOCATIONS)) more"
  case "$key" in
    ONLY) text=$MSG_ONLY ;; SKIP) text=$MSG_SKIP ;; TRUE) text=$MSG_TRUE ;; NOASSERT) text=$MSG_NOASSERT ;;
    SNAPSHOT) text=$MSG_SNAPSHOT ;; SELFMOCK) text=$MSG_SELFMOCK ;; CALLED) text=$MSG_CALLED ;;
  esac
  msg="$msg${msg:+ }Test guard: $text at $locations."
done
[ -n "$msg" ] || exit 0
msg="$msg $FOOTER"

if [ "$tool" = apply_patch ]; then
  jq -nc --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}' 2>/dev/null
else
  jq -nc --arg m "$msg" '{decision: "block", reason: $m}' 2>/dev/null
fi
exit 0
