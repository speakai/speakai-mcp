#!/usr/bin/env bash
# CI step, not a hook: the test-shape-guard checks over a whole PR, so every editor and agent is
# covered, not only Claude Code. Run from the repo root after a full-depth checkout:
#   bash .claude/hooks/ai-skills/eng-safety/test-guard-ci.sh origin/<base branch>
# A person overrides it with the test-budget-ok label or a line starting "Test budget:" in the PR
# body. Both are read live through gh (needs GH_TOKEN, PR_NUMBER and GITHUB_REPOSITORY), so
# re-running the job after adding the label is enough. A PR whose head is a long-lived branch
# (dev, main, master or a version branch) is skipped: its changes were checked on their own PRs.
# Exit 0 passes, 1 fails.
set -u

case "${GITHUB_HEAD_REF:-}" in
  dev|main|master|v[0-9]*) echo "Test guard: skipped for a PR from ${GITHUB_HEAD_REF}."; exit 0 ;;
esac

base=${1:-}
[ -n "$base" ] || { echo "usage: test-guard-ci.sh <base-ref>" >&2; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/_test-shape.sh"
mb=$(git merge-base HEAD "$base" 2>/dev/null) || {
  echo "::error::Test guard: no merge base with $base. Check out with fetch-depth: 0."
  exit 1
}

findings=$(mktemp) || exit 1
trap 'rm -f "$findings"' EXIT

added=0
while IFS= read -r p; do
  ts_is_test "$p" || continue
  added=$((added + 1))
  if home=$(ts_aspect_home "$PWD/$p"); then
    printf "$TS_MSG_ASPECT\n" "$p" "$home" >> "$findings"
  fi
done < <(git diff --name-only --diff-filter=A "$mb" HEAD)
[ "$added" -le "$TS_BUDGET" ] || printf "$TS_MSG_BUDGET_PR\n" "$added" "$TS_BUDGET" >> "$findings"

TAB=$(printf '\t')
git diff -U0 --diff-filter=AM "$mb" HEAD | awk '
  /^\+\+\+ / { p = substr($0, 5); sub(/^b\//, "", p); print "B"; print "F\t" p; next }
  /^--- / { next }
  /^@@/ { print "B"; next }
  /^\+/ { print "A\t" substr($0, 2); next }
  { print "B" }
' | ts_content_findings | while IFS="$TAB" read -r key p; do
  case "$key" in
    SOURCE) printf "$TS_MSG_SOURCE\n" "$p" ;;
    TIMING) printf "$TS_MSG_TIMING\n" "$p" ;;
  esac
done >> "$findings"

[ -s "$findings" ] || { echo "Test guard: passed ($added new test files, budget $TS_BUDGET)."; exit 0; }

overridden() {
  [ -n "${PR_NUMBER:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] && command -v gh >/dev/null 2>&1 || return 1
  gh api "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER" \
    --jq '([.labels[].name] | index("test-budget-ok") != null) or ((.body // "") | test("(^|\\n)Test budget:"))' \
    2>/dev/null | grep -qx true
}

if overridden; then
  while IFS= read -r line; do echo "::warning::Test guard: $line"; done < "$findings"
  echo "Test guard: overridden by the test-budget-ok label or a \"Test budget:\" line."
  exit 0
fi
while IFS= read -r line; do echo "::error::Test guard: $line"; done < "$findings"
echo "$TS_FOOTER"
exit 1
