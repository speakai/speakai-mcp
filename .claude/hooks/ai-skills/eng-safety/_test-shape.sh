# Sourced by test-shape-guard.sh (PreToolUse) and test-guard-ci.sh (a PR's CI job), so a local
# block and a CI failure name the same rule with the same words. Not a hook itself.
#
# ts_is_test PATH            true for a JS or TS test file outside node_modules, dist and build.
# ts_aspect_home ABS_PATH    for x.<aspect>.test.ts, prints the module's existing test file (the
#                            place the cases belong) and returns 0; returns 1 otherwise. A file
#                            whose source x.<aspect>.ts exists is that module's own test, and
#                            integration, e2e and contract files are separate kinds by policy.
# ts_content_findings        reads added-line records (see _added-lines.sh) on stdin and prints
#                            "SOURCE<TAB>path" or "TIMING<TAB>path", once per finding and file.
# ts_base_ref                the branch work merges into: of origin/dev and the remote default
#                            branch, the one with the fewest commits between it and HEAD, so a
#                            stale origin/dev does not count years of history as this branch's.
# ts_added_tests BASE        test files this branch adds over BASE, committed or not.

TS_BUDGET=3
TS_TEST_RE='(\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$)|((^|/)__tests__/[^/]*\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$)'
TS_SKIP_RE='(^|/)(node_modules|dist|build|coverage)/'
TS_MSG_ASPECT='%s would be a second test file for the same module. Add these cases to %s instead (rule test-budget).'
TS_MSG_SOURCE='%s reads a source file as text and checks its contents. Import the code, call it and assert on what it returns, stores or renders (rule test-value).'
TS_MSG_TIMING='%s asserts on elapsed time, which flakes on shared CI runners. Assert on the result, or count calls with a fake clock (rule test-value).'
TS_MSG_BUDGET='this branch already adds %s test files and the budget is %s. Add the cases to an existing test file. If a new file is really needed, finish without it and tell the user why, so a person can approve it (rule test-budget).'
TS_MSG_BUDGET_PR='this PR adds %s test files and the budget is %s. Fold the cases into existing test files, or a person adds the test-budget-ok label or a "Test budget:" line to the PR body saying why (rule test-budget).'
TS_FOOTER='Full rules: the testing-policy skill, where installed.'

ts_is_test() {
  local lp
  lp=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  printf '%s' "$lp" | grep -qE "$TS_TEST_RE" && ! printf '%s' "$lp" | grep -qE "$TS_SKIP_RE"
}

ts_aspect_home() {
  local abs=$1 dir base parts mod rest aspect e f
  dir=$(dirname "$abs"); base=$(basename "$abs")
  parts=$(printf '%s' "$base" | sed -nE 's/^(.+)\.([A-Za-z][A-Za-z0-9_-]*)\.(test|spec)\.([A-Za-z]+)$/\1|\2/p')
  [ -n "$parts" ] || return 1
  mod=${parts%%|*}; aspect=${parts#*|}
  case "$aspect" in integration|e2e|contract) return 1 ;; esac
  for e in ts tsx js jsx mjs cjs mts cts; do [ -f "$dir/$mod.$aspect.$e" ] && return 1; done
  for f in "$dir/$mod".test.* "$dir/$mod".spec.* "$dir/$mod".*.test.* "$dir/$mod".*.spec.*; do
    [ -f "$f" ] && [ "$f" != "$abs" ] || continue
    rest=$(basename "$f")
    case "$rest" in "$mod".integration.*|"$mod".e2e.*|"$mod".contract.*) continue ;; esac
    printf '%s' "$rest"
    return 0
  done
  return 1
}

ts_content_findings() {
  TS_TEST_RE=$TS_TEST_RE TS_SKIP_RE=$TS_SKIP_RE awk '
    function found(k,   key) { key = k "\t" path; if (!(key in seen)) { seen[key] = 1; print key } }
    function flush() {
      if (istest && reads && srcpath) found("SOURCE")
      if (istest && clock && below) found("TIMING")
      reads = srcpath = clock = below = 0
    }
    /^F\t/ {
      flush(); path = substr($0, 3); lp = tolower(path)
      istest = lp ~ ENVIRON["TS_TEST_RE"] && lp !~ ENVIRON["TS_SKIP_RE"]
      next
    }
    /^B$/ { flush(); next }
    /^A\t/ {
      if (!istest) next
      t = substr($0, 3)
      if (t ~ /^[ \t]*(\/\/|\/\*|\*)/) next
      if (t ~ /readFile(Sync)?\(/) reads = 1
      if (t !~ /^[ \t]*(import|export)[ \t{*]|[ \t]from[ \t]*["\047`]|require\(|mock\(|import\(/ && t !~ /(dist|build)\// && t ~ /\.(m|c)?[jt]sx?["\047`]/) srcpath = 1
      if (t ~ /performance\.now\(\)|process\.hrtime|Date\.now\(\)[ \t]*-/) clock = 1
      if (t ~ /\.toBeLessThan(OrEqual)?\(/) below = 1
    }
    END { flush() }
  '
}

ts_base_ref() {
  local ref best="" best_n="" mb n
  for ref in origin/dev "$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null)"; do
    [ -n "$ref" ] && git rev-parse -q --verify "refs/remotes/$ref" >/dev/null 2>&1 || continue
    mb=$(git merge-base HEAD "$ref" 2>/dev/null) || continue
    n=$(git rev-list --count "$mb..HEAD" 2>/dev/null) || continue
    if [ -z "$best_n" ] || [ "$n" -lt "$best_n" ]; then best=$ref; best_n=$n; fi
  done
  printf '%s' "$best"
}

ts_added_tests() {
  local mb p
  mb=$(git merge-base HEAD "$1" 2>/dev/null) || return 0
  { git diff --name-only --diff-filter=A "$mb" HEAD
    git diff --name-only --cached --diff-filter=A
    git ls-files --others --exclude-standard
  } 2>/dev/null | sort -u | while IFS= read -r p; do
    ts_is_test "$p" && printf '%s\n' "$p"
  done
}
