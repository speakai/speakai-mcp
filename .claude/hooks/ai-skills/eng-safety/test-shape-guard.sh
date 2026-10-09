#!/usr/bin/env bash
# PreToolUse gate: stops a test change that breaks the test-budget or test-value team rule before
# it is written. It exits 2 with the reason on stderr, which blocks the call and tells the agent
# what to do instead.
#   Claude Code: Write|Edit|MultiEdit.   Codex: apply_patch.
# Blocks:
#   1. a new per-aspect test file (x.<aspect>.test.ts) when the module already has a test file;
#   2. added test lines that read a source file as text (readFile plus a quoted source path);
#   3. a timing assertion (performance.now, hrtime or a Date.now() difference, with toBeLessThan);
#   4. a new test file when the branch already adds TS_BUDGET test files over its base. A person
#      can turn this check off for a session with AI_SKILLS_TEST_BUDGET=off before starting it.
#      Only this check scans untracked files (about 0.5 s in a large monorepo), and only when the
#      call creates a test file, so the hook stays near 30 ms on every other edit.
# Not inspected: test files written through the shell, assertions on constants or copy (the
# team rule and review cover those) and other languages. Backstop: test-guard-ci.sh in each
# repo's CI job. Unreadable input lets the call through, because this guards test quality, not
# safety, and CI repeats every check.
set -u

command -v jq >/dev/null 2>&1 || exit 0
input=$(cat) || exit 0
WORK=$(mktemp -d 2>/dev/null) || exit 0
trap 'rm -rf "$WORK"' EXIT
HERE=$(dirname "$0")
. "$HERE/_added-lines.sh" 2>/dev/null || exit 0
. "$HERE/_test-shape.sh" 2>/dev/null || exit 0
read_event "$WORK" || exit 0
added_lines_stream "$WORK" > "$WORK/stream" 2>/dev/null || exit 0

rel() { case "$1" in "$cwd"/*) printf '%s' "${1#"$cwd"/}" ;; *) printf '%s' "$1" ;; esac; }
reasons=""
add() { reasons="$reasons${reasons:+ }Test guard: $1"; }

case "$tool" in
  Write) [ -e "$(abs_path "$file")" ] || printf '%s\n' "$file" > "$WORK/new" ;;
  apply_patch) [ "$FIELDS" -gt 0 ] && sed -nE 's/^[[:space:]]*\*\*\* Add File: //p' "$WORK/field.0" > "$WORK/new" ;;
esac
new_tests=0
if [ -s "$WORK/new" ]; then
  while IFS= read -r p; do
    [ -n "$p" ] && ts_is_test "$p" || continue
    new_tests=$((new_tests + 1))
    if home=$(ts_aspect_home "$(abs_path "$p")"); then
      add "$(printf "$TS_MSG_ASPECT" "$(rel "$p")" "$home")"
    fi
  done < "$WORK/new"
fi

TAB=$(printf '\t')
ts_content_findings < "$WORK/stream" > "$WORK/found" 2>/dev/null
while IFS="$TAB" read -r key p; do
  case "$key" in
    SOURCE) add "$(printf "$TS_MSG_SOURCE" "$(rel "$p")")" ;;
    TIMING) add "$(printf "$TS_MSG_TIMING" "$(rel "$p")")" ;;
  esac
done < "$WORK/found"

if [ "$new_tests" -gt 0 ] && [ "${AI_SKILLS_TEST_BUDGET:-}" != off ]; then
  base=$(cd "$cwd" 2>/dev/null && ts_base_ref)
  if [ -n "$base" ]; then
    have=$(cd "$cwd" && ts_added_tests "$base" | wc -l | tr -d ' ')
    if [ $((have + new_tests)) -gt "$TS_BUDGET" ]; then
      add "$(printf "$TS_MSG_BUDGET" "$have" "$TS_BUDGET")"
    fi
  fi
fi

[ -n "$reasons" ] || exit 0
printf '%s %s\n' "$reasons" "$TS_FOOTER" >&2
exit 2
