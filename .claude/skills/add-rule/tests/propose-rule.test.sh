#!/usr/bin/env bash
# Tests for scripts/propose-rule.sh. Run: bash plugins/eng-safety/skills/add-rule/tests/propose-rule.test.sh
# Everything runs offline: a local bare repo stands in for ai-skills and for a consumer's origin,
# and a fake gh on PATH logs its calls instead of reaching GitHub.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../scripts/propose-rule.sh"
BASH_BIN=/bin/bash; [ -x "$BASH_BIN" ] || BASH_BIN="$(command -v bash)"
command -v jq >/dev/null 2>&1 || { echo "✗ jq is required to run these tests"; exit 1; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
pass=0; fail=0
record() {  # $1 expected, $2 got, $3 label
  if [ "$1" = "$2" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "✗ expected $1, got $2: $3"; fi
}
has() {  # $1 label, $2 file, $3 fixed text that must appear
  if grep -qF -- "$3" "$2"; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "✗ $1: '$3' not in output"; sed 's/^/    /' "$2"; fi
}
lacks() {  # $1 label, $2 file, $3 fixed text that must not appear
  if grep -qF -- "$3" "$2"; then fail=$((fail + 1)); echo "✗ $1: '$3' should not be in output"; else pass=$((pass + 1)); fi
}

# Isolated git and a fake gh.
export HOME="$WORK/home"; mkdir -p "$HOME"
export GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=tester GIT_AUTHOR_EMAIL=tester@example.com GIT_COMMITTER_NAME=tester GIT_COMMITTER_EMAIL=tester@example.com
git config --global init.defaultBranch main
mkdir -p "$WORK/bin"
cat > "$WORK/bin/gh" <<'EOF'
#!/usr/bin/env bash
echo "gh $*" >> "$GH_LOG"
case "$1 $2" in
  "api user") [ -n "${GH_FAIL_API:-}" ] && exit 1; echo tester ;;
  "repo clone") echo "error connecting to api.github.com" >&2; exit 1 ;;
  "pr create") [ -n "${GH_FAIL_PR:-}" ] && { echo "no permission" >&2; exit 1; }; echo "https://github.com/example/repo/pull/7" ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$WORK/bin/gh"
export PATH="$WORK/bin:$PATH" GH_LOG="$WORK/gh.log" RENDER_LOG="$WORK/render.log"

# A stand-in ai-skills: one rule and a validate.sh that fails on a rule containing FAILME.
seed="$WORK/seed"; mkdir -p "$seed/policy" "$seed/scripts"
cat > "$seed/policy/draft-prs.md" <<'EOF'
---
id: draft-prs
owner: tester
section: Pull requests
applies-to: all
except:
enforced-by: pr-gate
reason: A human previews every change before it merges.
---
Open every PR as a draft; the developer marks it Ready and a human merges.
EOF
cat > "$seed/scripts/validate.sh" <<'EOF'
#!/usr/bin/env bash
if grep -l FAILME policy/*.md >/dev/null 2>&1; then echo "✗ policy: FAILME found"; exit 1; fi
echo "✓ all skills valid"
EOF
printf '#!/usr/bin/env bash\necho "$*" >> "$RENDER_LOG"\necho "RENDERED $*"\n' > "$seed/scripts/render-rules.sh"
git -C "$seed" init --quiet && git -C "$seed" add -A && git -C "$seed" commit --quiet -m seed
git clone --quiet --bare "$seed" "$WORK/ai-skills.git"
AI="$WORK/ai-skills.git"

# A consumer repo with a rendered rules block and a dev base branch on its origin.
cons="$WORK/consumer"; mkdir -p "$cons"
cat > "$cons/AGENTS.md" <<'EOF'
# Consumer

## Testing
- Tests sit next to the code they test.

## Commands
- npm test

<!-- BEGIN ai-skills rules: generated from speakai/ai-skills policy/; change with /add-rule or $add-rule, not here -->
## Team rules
**Code**
- Match and join records by ID, never by name or label. Names change and repeat.
<!-- END ai-skills rules -->
EOF
mkdir -p "$cons/.claude"; printf 'plugins=eng-safety\nrepo=consumer-x\n' > "$cons/.claude/ai-skills.config"
git -C "$cons" init --quiet && git -C "$cons" add -A && git -C "$cons" commit --quiet -m "chore: start"
git -C "$cons" branch -m dev
git clone --quiet --bare "$cons" "$WORK/consumer.git"
git -C "$cons" remote add origin "$WORK/consumer.git" && git -C "$cons" fetch --quiet origin

run() {  # $1 dir, rest: args -> $WORK/out, $WORK/rc
  local dir="$1"; shift
  (cd "$dir" && "$BASH_BIN" "$SCRIPT" "$@" >"$WORK/out" 2>&1); echo $? > "$WORK/rc"
}
rc() { cat "$WORK/rc"; }

[ -x "$SCRIPT" ] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "✗ $SCRIPT is not executable"; }

# ---- usage errors ----
run "$WORK" ; record 2 "$(rc)" "no mode"
run "$WORK" shared --text "x"; record 2 "$(rc)" "shared without --id"
run "$WORK" shared --text "Do a thing" --id ok --section Nope --reason r; record 2 "$(rc)" "unknown section"
run "$WORK" shared --text "Do a thing" --id Bad_Id --section Code --reason r; record 2 "$(rc)" "bad id"
run "$WORK" shared --text "line one
line two" --id two-lines --section Code --reason r; record 2 "$(rc)" "multi-line text"
run "$WORK" shared --text "Do a thing" --id no-reason --section Code; record 2 "$(rc)" "missing reason"

# ---- personal: printed, nothing written ----
: > "$GH_LOG"
run "$cons" personal --text "Reply in short bullet lists."
record 0 "$(rc)" "personal"
has "personal" "$WORK/out" "Reply in short bullet lists."
has "personal" "$WORK/out" "~/.claude/CLAUDE.md"
has "personal" "$WORK/out" "~/.codex/AGENTS.md"
record "" "$(git -C "$cons" status --porcelain)" "personal leaves the repo clean"
record 0 "$(grep -c . "$GH_LOG")" "personal makes no gh calls"

# ---- check: offline duplicate against the rendered block ----
run "$cons" check --text "Match and join records by ID, never by name or label."
record 3 "$(rc)" "check finds a rendered duplicate"
run "$cons" check --text "Write release notes for every package publish."
record 0 "$(rc)" "check passes a new rule"

# ---- shared: duplicates and similar rules ----
run "$cons" shared --source "$AI" --text "Open every PR as a draft; the developer marks it Ready and a human merges." --id drafts-again --section "Pull requests" --reason "Review first."
record 3 "$(rc)" "shared duplicate of a policy body"
has "shared duplicate" "$WORK/out" "draft-prs.md"

run "$cons" shared --source "$AI" --text "Something new entirely here." --id draft-prs --section Code --reason "Why."
record 3 "$(rc)" "shared id already taken"

run "$cons" shared --source "$AI" --text "Open every PR as a draft so a human merges it after review." --id draft-review --section "Pull requests" --reason "Review first."
record 4 "$(rc)" "shared similar rule needs a yes"
has "shared similar" "$WORK/out" "--allow-similar"

run "$cons" shared --source "$AI" --owner tester --allow-similar --dry-run --text "Open every PR as a draft so a human merges it after review." --id draft-review --section "Pull requests" --reason "Review first."
record 0 "$(rc)" "shared similar with --allow-similar, dry run"
has "dry run" "$WORK/out" "Dry run"
has "dry run preview" "$WORK/out" "- Open every PR as a draft so a human merges it after review. Review first."
record 1 "$(git -C "$AI" show-ref --quiet refs/heads/add-rule/draft-review; echo $?)" "dry run pushes nothing"

# Offline: the clone fails, but a duplicate in the local rendered block is still caught.
run "$cons" shared --text "Match and join records by ID, never by name or label." --id ids --section Code --reason "Names repeat."
record 3 "$(rc)" "duplicate caught before the clone fallback"

# ---- shared: fallback when the clone fails ----
: > "$GH_LOG"
run "$cons" shared --owner tester --text "Name every feature flag after the feature it guards." --id flag-names --section Code --reason "Flags outlive the people who made them."
record 5 "$(rc)" "clone fails -> fallback"
has "fallback file" "$WORK/out" "id: flag-names"
has "fallback file" "$WORK/out" "reason: Flags outlive the people who made them."
has "fallback url" "$WORK/out" "https://github.com/speakai/ai-skills/new/main/policy?filename=flag-names.md&value="
has "fallback used gh clone" "$GH_LOG" "gh repo clone speakai/ai-skills"

GH_FAIL_API=1 run "$cons" shared --source "$AI" --text "Name every feature flag after the feature it guards." --id flag-names --section Code --reason "Flags outlive the people who made them."
record 5 "$(rc)" "no gh login -> fallback with placeholder owner"
has "placeholder owner" "$WORK/out" "owner: your-github-handle"

# ---- shared: validate.sh failure stops before any push ----
run "$cons" shared --source "$AI" --owner tester --text "FAILME is a rule body the stub rejects." --id stub-fails --section Code --reason "Test."
record 6 "$(rc)" "validate.sh failure"
record 1 "$(git -C "$AI" show-ref --quiet refs/heads/add-rule/stub-fails; echo $?)" "nothing pushed after a failed check"

# ---- shared: full run pushes a branch and opens one draft PR ----
: > "$GH_LOG"
run "$cons" shared --source "$AI" --owner tester --hook-candidate --text "Name every feature flag after the feature it guards." --id flag-names --section Code --reason "Flags outlive the people who made them."
record 0 "$(rc)" "shared full run"
has "shared full run" "$WORK/out" "Draft PR opened: https://github.com/example/repo/pull/7"
has "render preview for this repo" "$WORK/out" "RENDERED --repo consumer-x --print"
has "ai-skills AGENTS.md re-rendered" "$RENDER_LOG" "--target . --repo ai-skills"
record 0 "$(git -C "$AI" show-ref --quiet refs/heads/add-rule/flag-names; echo $?)" "branch pushed"
git -C "$AI" show add-rule/flag-names:policy/flag-names.md > "$WORK/pushed.md"
has "pushed rule file" "$WORK/pushed.md" "section: Code"
has "pushed rule file" "$WORK/pushed.md" "Name every feature flag after the feature it guards."
record "chore: add team rule flag-names" "$(git -C "$AI" log -1 --format=%s add-rule/flag-names)" "commit subject"
has "pr is a draft" "$GH_LOG" "gh pr create --draft --base main --head add-rule/flag-names"
record 1 "$(grep -c '^gh pr create' "$GH_LOG")" "exactly one PR"

run "$cons" shared --source "$AI" --owner tester --text "Keep feature flag names tied to one feature only." --id flag-names-2 --section Code --reason "x." --allow-similar
record 0 "$(rc)" "second rule on its own branch"

# Branch already on the remote: stop instead of opening a second PR.
run "$cons" shared --source "$AI" --owner tester --text "A different rule about retries on flaky calls." --id flag-names --section Code --reason "x."
record 3 "$(rc)" "rule branch already on the remote (id not yet on main)"

# PR creation fails after the push: compare link printed.
GH_FAIL_PR=1 run "$cons" shared --source "$AI" --owner tester --text "Log the request id with every server error." --id request-ids --section Code --reason "It links a report to its trace."
record 5 "$(rc)" "pr create fails -> compare link"
has "compare link" "$WORK/out" "https://github.com/speakai/ai-skills/compare/main...add-rule/request-ids?expand=1"

# Push rejected (no write access): fallback printed.
reject="$WORK/ai-skills-ro.git"; git clone --quiet --bare "$seed" "$reject"
printf '#!/bin/sh\necho "permission denied" >&2\nexit 1\n' > "$reject/hooks/pre-receive"; chmod +x "$reject/hooks/pre-receive"
run "$cons" shared --source "$reject" --owner tester --text "Log the request id with every server error." --id request-ids --section Code --reason "It links a report to its trace."
record 5 "$(rc)" "push rejected -> fallback"
has "push fallback" "$WORK/out" "new/main/policy?filename=request-ids.md"

# ---- repo-fact ----
before="$(git -C "$cons" rev-parse HEAD)"
run "$cons" repo-fact --dry-run --heading "## Testing" --text "- Integration tests live in tests/integration."
record 0 "$(rc)" "repo-fact dry run"
has "repo-fact diff" "$WORK/out" "+- Integration tests live in tests/integration."
record "" "$(git -C "$cons" branch --list 'add-rule/*')" "dry run removes its branch"
record "$before" "$(git -C "$cons" rev-parse HEAD)" "current checkout untouched"
record "" "$(git -C "$cons" status --porcelain)" "working tree clean"

: > "$GH_LOG"
run "$cons" repo-fact --heading "## Testing" --id integration-tests --text "- Integration tests live in tests/integration."
record 0 "$(rc)" "repo-fact full run"
git -C "$WORK/consumer.git" show add-rule/integration-tests:AGENTS.md > "$WORK/agents.md"
record "- Integration tests live in tests/integration." "$(sed -n '5p' "$WORK/agents.md")" "line placed at the end of its section"
record "## Commands" "$(sed -n '7p' "$WORK/agents.md")" "next section untouched"
record "docs: add a repo fact to AGENTS.md" "$(git -C "$WORK/consumer.git" log -1 --format=%s add-rule/integration-tests)" "commit style follows the repo"
has "repo-fact pr" "$GH_LOG" "gh pr create --draft --base dev --head add-rule/integration-tests"

run "$cons" repo-fact --text "- Tests sit next to the code they test."
record 3 "$(rc)" "repo-fact duplicate"
run "$cons" repo-fact --heading "## Team rules" --text "- Some new team-looking line."
record 2 "$(rc)" "heading inside the generated block refused"
run "$cons" repo-fact --heading "## Nope" --text "- A line."
record 2 "$(rc)" "missing heading refused"

run "$cons" repo-fact --dry-run --text "Deploys go through the release workflow only."
record 0 "$(rc)" "repo-fact without heading appends"
lacks "append outside the block" "$WORK/out" "+<!-- END"

echo "propose-rule: $pass passed, $fail failed"
[ "$fail" = 0 ]
