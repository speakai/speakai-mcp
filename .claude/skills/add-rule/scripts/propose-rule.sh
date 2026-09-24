#!/usr/bin/env bash
# Propose a team rule, a repo fact or a personal rule. The add-rule skill runs this script, so
# Claude Code and Codex follow the same steps. Run with --help for the modes and options.
# Runs under macOS /bin/bash 3.2: no associative arrays, no mapfile, no ${var,,}.
set -uo pipefail

AI_SKILLS_SLUG="speakai/ai-skills"
AI_SKILLS_BASE="main"
POLICY_DIR="policy"
SECTIONS="Working style|Code|Tests|Pull requests|Safety|Definition of done"
MAX_BODY_CHARS=300
SIMILAR_MIN_SHARED_WORDS=3
SIMILAR_MIN_OVERLAP_PCT=60
BLOCK_BEGIN="<!-- BEGIN ai-skills rules"
BLOCK_END="<!-- END ai-skills rules"
OWNER_PLACEHOLDER="your-github-handle"
STOPWORDS=" the and for with that this from into when what then than them they are was were been have has had not but any all each every its it's our your you use using one two per via only also just before after instead there their which who whom about over under out off can may must should would could will shall does did done make makes made get gets got "

EXIT_OK=0
EXIT_USAGE=2
EXIT_DUPLICATE=3
EXIT_SIMILAR=4
EXIT_FALLBACK=5
EXIT_INVALID=6

usage() {
  cat <<'EOF'
Usage: propose-rule.sh <mode> --text "<rule>" [options]

Modes
  shared     Add a team rule as policy/<id>.md in speakai/ai-skills and open a draft PR.
  repo-fact  Add one line to this repo's AGENTS.md on a new branch and open a draft PR.
  personal   Print the rule and the files to paste it into. Writes nothing.
  check      Only look for duplicates and similar rules. Writes nothing.

Options
  --text "<rule>"          The rule, one line (required).
  --id <id>                shared: file name and rule id, lowercase words joined by hyphens (required).
                           repo-fact: used for the branch name (default: made from the text).
  --section "<label>"      shared: Working style, Code, Tests, Pull requests, Safety or Definition of done.
  --reason "<why>"         shared: one short sentence (required).
  --applies-to <ids>       shared: comma-separated repo ids, or all (default all).
  --except <ids>           shared: comma-separated repo ids that skip the rule.
  --enforced-by <names>    shared: comma-separated hook or workflow names that already check it.
  --owner <handle>         shared: GitHub handle of the rule owner (default: the gh login).
  --hook-candidate         shared: say in the PR body that a hook could check this rule.
  --heading "<heading>"    repo-fact: exact AGENTS.md heading line to add the line under
                           (default: the end of the file).
  --base <branch>          repo-fact: base branch (default: dev, main or master, the first on origin).
  --allow-similar          Go ahead although similar rules exist (after a person confirmed).
  --dry-run                Do every step except push and PR, and print the result.
  --source <path|slug>     Where to clone ai-skills from (default speakai/ai-skills through gh).

Exit codes: 0 done, 2 usage error, 3 duplicate, 4 similar rules need a yes,
5 no access (the finished rule and a manual route were printed), 6 checks failed.
EOF
}

die() { echo "✗ $1" >&2; exit "${2:-$EXIT_USAGE}"; }

# ---- arguments ----
MODE="${1:-}"
case "$MODE" in
  shared|repo-fact|personal|check) shift ;;
  -h|--help) usage; exit "$EXIT_OK" ;;
  *) usage >&2; exit "$EXIT_USAGE" ;;
esac

TEXT=""; ID=""; SECTION=""; REASON=""; APPLIES_TO="all"; EXCEPT=""; ENFORCED_BY=""; OWNER=""
HOOK_CANDIDATE=0; HEADING=""; BASE=""; ALLOW_SIMILAR=0; DRY_RUN=0; SOURCE="$AI_SKILLS_SLUG"
while [ $# -gt 0 ]; do
  case "$1" in
    --text) TEXT="${2:-}"; shift 2 ;;
    --id) ID="${2:-}"; shift 2 ;;
    --section) SECTION="${2:-}"; shift 2 ;;
    --reason) REASON="${2:-}"; shift 2 ;;
    --applies-to) APPLIES_TO="${2:-}"; shift 2 ;;
    --except) EXCEPT="${2:-}"; shift 2 ;;
    --enforced-by) ENFORCED_BY="${2:-}"; shift 2 ;;
    --owner) OWNER="${2:-}"; shift 2 ;;
    --hook-candidate) HOOK_CANDIDATE=1; shift ;;
    --heading) HEADING="${2:-}"; shift 2 ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --allow-similar) ALLOW_SIMILAR=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --source) SOURCE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit "$EXIT_OK" ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

# ---- input checks ----
one_line() { case "$1" in *$'\n'*|*$'\r'*) return 1 ;; esac; return 0; }
trim() { printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }

TEXT="$(trim "$TEXT")"; REASON="$(trim "$REASON")"
[ -n "$TEXT" ] || die "--text is required"
one_line "$TEXT" || die "--text must be one line"
[ "${#TEXT}" -le "$MAX_BODY_CHARS" ] || die "--text is ${#TEXT} characters; keep it under $MAX_BODY_CHARS"

if [ "$MODE" = shared ]; then
  [ -n "$ID" ] || die "--id is required for a shared rule"
  printf '%s' "$ID" | grep -qE '^[a-z0-9]+(-[a-z0-9]+)*$' || die "--id must be lowercase words joined by hyphens"
  [ "${#ID}" -le 64 ] || die "--id must be 64 characters or fewer"
  printf '%s' "|$SECTIONS|" | grep -qF "|$SECTION|" || die "--section must be one of: ${SECTIONS//|/, }"
  [ -n "$REASON" ] || die "--reason is required for a shared rule"
  one_line "$REASON" || die "--reason must be one line"
  for v in "$APPLIES_TO" "$EXCEPT" "$ENFORCED_BY" "$OWNER"; do one_line "$v" || die "option values must be one line"; done
fi
if [ "$MODE" = repo-fact ] && [ -n "$ID" ]; then
  printf '%s' "$ID" | grep -qE '^[a-z0-9]+(-[a-z0-9]+)*$' || die "--id must be lowercase words joined by hyphens"
fi

# ---- similarity ----
# words: lowercase, letters and digits only, 3+ letters, stopwords dropped, one per line, unique.
words() {
  printf '%s\n' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' ' ' | tr ' ' '\n' \
    | awk -v stop="$STOPWORDS" 'length($0) >= 3 && index(stop, " " $0 " ") == 0' | sort -u
}
normalized() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' ' ' | tr -s ' ' | sed -e 's/^ //' -e 's/ $//'; }

# compare "<candidate line>" -> prints "duplicate", "similar" or nothing
compare() {
  local cand="$1" a b shared na nb smaller nt nc
  nt="$(normalized "$TEXT")"; nc="$(normalized "$cand")"
  [ -n "$nc" ] || return 0
  case "$nc" in "$nt"|"$nt "*) echo duplicate; return 0 ;; esac
  a="$(words "$TEXT")"; b="$(words "$cand")"
  [ -n "$a" ] && [ -n "$b" ] || return 0
  shared="$(comm -12 <(printf '%s\n' "$a") <(printf '%s\n' "$b") | grep -c .)"
  na="$(printf '%s\n' "$a" | grep -c .)"; nb="$(printf '%s\n' "$b" | grep -c .)"
  smaller="$na"; [ "$nb" -lt "$smaller" ] && smaller="$nb"
  if [ "$shared" -eq "$smaller" ] && [ "$na" -eq "$nb" ]; then echo duplicate
  elif [ "$shared" -ge "$SIMILAR_MIN_SHARED_WORDS" ] && [ $((shared * 100)) -ge $((smaller * SIMILAR_MIN_OVERLAP_PCT)) ]; then echo similar
  fi
}

DUPLICATES=""; SIMILAR=""
# scan "<label>" < lines -> appends to DUPLICATES / SIMILAR
scan() {
  local label="$1" line verdict
  while IFS= read -r line; do
    line="$(trim "$line")"; line="${line#- }"
    [ -n "$line" ] || continue
    verdict="$(compare "$line")"
    case "$verdict" in
      duplicate) DUPLICATES="$DUPLICATES  $label: $line"$'\n' ;;
      similar) SIMILAR="$SIMILAR  $label: $line"$'\n' ;;
    esac
  done
}

# rule_body <policy file> -> the body line after the frontmatter
rule_body() { awk 'NR==1 && $0=="---"{fm=1; next} fm && $0=="---"{fm=0; next} !fm && NF{print; exit}' "$1"; }

# block_lines <AGENTS.md> -> the rule lines inside the rendered rules block
block_lines() { awk -v b="$BLOCK_BEGIN" -v e="$BLOCK_END" 'index($0,b)==1{inb=1; next} index($0,e)==1{inb=0} inb && /^- /' "$1"; }

# report_matches -> exits when a duplicate, or a similar rule without --allow-similar, was found
report_matches() {
  if [ -n "$DUPLICATES" ]; then
    printf '✗ This rule already exists:\n%s' "$DUPLICATES" >&2
    exit "$EXIT_DUPLICATE"
  fi
  if [ -n "$SIMILAR" ] && [ "$ALLOW_SIMILAR" = 0 ]; then
    printf '! Similar rules exist. Check that the new rule neither repeats nor contradicts them, then rerun with --allow-similar:\n%s' "$SIMILAR" >&2
    exit "$EXIT_SIMILAR"
  fi
  [ -n "$SIMILAR" ] && printf 'note: similar rules exist and were confirmed as different:\n%s' "$SIMILAR"
  return 0
}

GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
LOCAL_AGENTS=""; [ -n "$GIT_ROOT" ] && [ -f "$GIT_ROOT/AGENTS.md" ] && LOCAL_AGENTS="$GIT_ROOT/AGENTS.md"
# The repo id (repo= in .claude/ai-skills.config) picks which repo's block the render preview shows.
PREVIEW_REPO=""
[ -n "$GIT_ROOT" ] && [ -f "$GIT_ROOT/.claude/ai-skills.config" ] \
  && PREVIEW_REPO="$(sed -n 's/^repo=//p' "$GIT_ROOT/.claude/ai-skills.config" | head -n 1 | tr -d '[:space:]')"

# ---- personal ----
if [ "$MODE" = personal ]; then
  cat <<EOF
This is a personal rule, so nothing was written and no PR was opened.
Paste this line into your own instructions file:

  $TEXT

  Claude Code: ~/.claude/CLAUDE.md
  Codex:       ~/.codex/AGENTS.md
EOF
  exit "$EXIT_OK"
fi

# ---- check ----
if [ "$MODE" = check ]; then
  if [ -n "$LOCAL_AGENTS" ]; then scan "AGENTS.md" < "$LOCAL_AGENTS"; fi
  report_matches
  echo "No duplicate found in ${LOCAL_AGENTS:-this folder (no AGENTS.md)}. shared mode also checks ai-skills policy/."
  exit "$EXIT_OK"
fi

# ---- shared ----
urlencode() { printf '%s' "$1" | jq -sRr @uri 2>/dev/null; }

rule_file_text() {
  cat <<EOF
---
id: $ID
owner: $OWNER
section: $SECTION
applies-to: $APPLIES_TO
except:${EXCEPT:+ $EXCEPT}
enforced-by:${ENFORCED_BY:+ $ENFORCED_BY}
reason: $REASON
---
$TEXT
EOF
}

preview_line() {
  printf '**%s**\n- %s %s\n' "$SECTION" "$TEXT" "$REASON"
}

shared_fallback() {  # $1 why
  local content enc url
  content="$(rule_file_text)"
  enc="$(urlencode "$content")"
  url="https://github.com/$AI_SKILLS_SLUG/new/$AI_SKILLS_BASE/$POLICY_DIR?filename=$ID.md"
  [ -n "$enc" ] && url="$url&value=$enc"
  cat <<EOF
! $1
The rule is ready but could not be proposed from here. Open the link below in a browser to
create the file and a draft PR yourself, or send the file to an ai-skills owner.

File: $POLICY_DIR/$ID.md
$content

New-file link: $url
EOF
  [ "$OWNER" = "$OWNER_PLACEHOLDER" ] && echo "Replace '$OWNER_PLACEHOLDER' in the owner line with your GitHub handle."
  exit "$EXIT_FALLBACK"
}

pr_body() {
  local enforced="$ENFORCED_BY"
  [ -n "$enforced" ] || enforced="nothing yet"
  cat <<EOF
Adds the team rule \`$ID\` to \`$POLICY_DIR/\`.

- Section: $SECTION
- Applies to: $APPLIES_TO${EXCEPT:+ (except $EXCEPT)}
- Enforced by: $enforced
- Owner: @$OWNER
EOF
  [ "$HOOK_CANDIDATE" = 1 ] && printf -- '- Hook candidate: a machine could check this rule every time, so a follow-up could add a hook (see AUTHORING.md section 4).\n'
  [ -n "$SIMILAR" ] && printf '\nSimilar rules that were checked and kept separate:\n%s' "$SIMILAR"
  cat <<EOF

How it renders in each AGENTS.md (public repos get the rule without the reason):

$(preview_line)

The rule file:

\`\`\`md
$(rule_file_text)
\`\`\`

Checks: scripts/validate.sh passed on this branch. Proposed with the add-rule skill.
EOF
}

if [ "$MODE" = shared ]; then
  if [ -n "$LOCAL_AGENTS" ]; then scan "AGENTS.md" < <(block_lines "$LOCAL_AGENTS"); fi
  if [ -z "$OWNER" ]; then OWNER="$(gh api user --jq .login 2>/dev/null || true)"; fi
  [ -n "$OWNER" ] || OWNER="$OWNER_PLACEHOLDER"

  WORK="$(mktemp -d "${TMPDIR:-/tmp}/add-rule.XXXXXX")" || die "could not create a temp folder"
  trap 'rm -rf "$WORK"' EXIT
  CLONE="$WORK/ai-skills"
  if [ -d "$SOURCE" ]; then
    git clone --quiet "$SOURCE" "$CLONE" 2>"$WORK/clone.err"
  else
    gh repo clone "$SOURCE" "$CLONE" -- --quiet 2>"$WORK/clone.err"
  fi
  if [ $? -ne 0 ] || [ ! -d "$CLONE/.git" ]; then
    report_matches
    shared_fallback "Could not clone $SOURCE: $(tail -n 1 "$WORK/clone.err" 2>/dev/null)"
  fi

  cd "$CLONE" || die "could not enter the clone"
  git fetch --quiet origin "$AI_SKILLS_BASE" 2>/dev/null || true
  [ -f "$POLICY_DIR/$ID.md" ] && { echo "✗ $POLICY_DIR/$ID.md already exists:" >&2; cat "$POLICY_DIR/$ID.md" >&2; exit "$EXIT_DUPLICATE"; }
  for f in "$POLICY_DIR"/*.md; do
    [ -f "$f" ] || continue
    scan "$f" < <(rule_body "$f")
  done
  report_matches
  [ "$OWNER" = "$OWNER_PLACEHOLDER" ] && shared_fallback "Could not read your GitHub login (pass --owner <handle>)."

  BRANCH="add-rule/$ID"
  if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    die "branch $BRANCH already exists on $SOURCE; a PR for this rule may already be open" "$EXIT_DUPLICATE"
  fi
  git checkout --quiet -b "$BRANCH" "origin/$AI_SKILLS_BASE" || die "could not create branch $BRANCH from origin/$AI_SKILLS_BASE"
  mkdir -p "$POLICY_DIR"
  rule_file_text > "$POLICY_DIR/$ID.md"
  # ai-skills renders the rules into its own AGENTS.md too, and validate.sh checks that block.
  if [ -f scripts/render-rules.sh ]; then
    if ! bash scripts/render-rules.sh --target . --repo ai-skills > "$WORK/render.out" 2>&1; then
      cat "$WORK/render.out" >&2
      echo "✗ rendering the rules into ai-skills' own AGENTS.md failed" >&2
      exit "$EXIT_INVALID"
    fi
  fi

  if ! bash scripts/validate.sh > "$WORK/validate.out" 2>&1; then
    grep -E '✗|FAIL' "$WORK/validate.out" | tail -n 20 >&2
    echo "✗ scripts/validate.sh failed on the new rule; fix the rule and run again" >&2
    exit "$EXIT_INVALID"
  fi
  echo "✓ scripts/validate.sh passed"
  echo "Render preview:"; preview_line
  if [ -n "$PREVIEW_REPO" ] && [ -f scripts/render-rules.sh ]; then
    echo "The rules block for $PREVIEW_REPO with this rule:"
    bash scripts/render-rules.sh --repo "$PREVIEW_REPO" --print 2>&1 || echo "(render preview failed; validate.sh passed, so check the renderer output above)"
  fi

  git add -- "$POLICY_DIR/$ID.md"
  [ -f AGENTS.md ] && git add -- AGENTS.md
  git commit --quiet -m "chore: add team rule $ID" -m "$TEXT" || die "git commit failed (is user.name and user.email set?)" "$EXIT_INVALID"

  if [ "$DRY_RUN" = 1 ]; then
    echo "Dry run: committed on $BRANCH in a temp clone; nothing was pushed."
    echo "PR body that would be used:"; pr_body
    exit "$EXIT_OK"
  fi
  if ! git push --quiet -u origin "$BRANCH" 2>"$WORK/push.err"; then
    shared_fallback "Could not push to $SOURCE: $(tail -n 1 "$WORK/push.err")"
  fi
  pr_body > "$WORK/body.md"
  if url="$(gh pr create --draft --base "$AI_SKILLS_BASE" --head "$BRANCH" --title "Add team rule: $ID" --body-file "$WORK/body.md" 2>"$WORK/pr.err")"; then
    echo "✓ Draft PR opened: $url"
    exit "$EXIT_OK"
  fi
  echo "! The branch $BRANCH is pushed, but the PR could not be opened: $(tail -n 1 "$WORK/pr.err")"
  echo "Open it here as a draft: https://github.com/$AI_SKILLS_SLUG/compare/$AI_SKILLS_BASE...$BRANCH?expand=1"
  exit "$EXIT_FALLBACK"
fi

# ---- repo-fact ----
[ -n "$GIT_ROOT" ] || die "repo-fact runs inside a git repo"
[ -n "$LOCAL_AGENTS" ] || die "this repo has no AGENTS.md at its root"

repo_fact_fallback() {  # $1 why
  cat <<EOF
! $1
Add this line to AGENTS.md ${HEADING:+under "$HEADING" }by hand on a branch from the base branch, and open a draft PR:

  $TEXT
EOF
  exit "$EXIT_FALLBACK"
}

if [ -z "$BASE" ]; then
  for b in dev main master; do
    if git -C "$GIT_ROOT" ls-remote --exit-code --heads origin "$b" >/dev/null 2>&1; then BASE="$b"; break; fi
  done
  [ -n "$BASE" ] || repo_fact_fallback "Could not find a dev, main or master branch on origin (pass --base)."
fi
git -C "$GIT_ROOT" fetch --quiet origin "$BASE" 2>/dev/null || repo_fact_fallback "Could not fetch origin/$BASE."

[ -n "$ID" ] || ID="$(normalized "$TEXT" | tr ' ' '\n' | head -n 5 | paste -sd- -)"
[ -n "$ID" ] || die "pass --id; the text has no letters or digits to name the branch after"
BRANCH="add-rule/$ID"
git -C "$GIT_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH" && die "branch $BRANCH already exists here; pass another --id"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/add-rule.XXXXXX")" || die "could not create a temp folder"
TREE="$WORK/tree"
cleanup_tree() {
  git -C "$GIT_ROOT" worktree remove --force "$TREE" >/dev/null 2>&1
  [ "${KEEP_BRANCH:-0}" = 1 ] || git -C "$GIT_ROOT" branch -D "$BRANCH" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup_tree EXIT
git -C "$GIT_ROOT" worktree add --quiet -b "$BRANCH" "$TREE" "origin/$BASE" 2>"$WORK/wt.err" \
  || repo_fact_fallback "Could not create a worktree: $(tail -n 1 "$WORK/wt.err")"

scan "AGENTS.md" < "$TREE/AGENTS.md"
report_matches

# Insert after the last non-empty line of the heading's section, never inside the rules block.
if [ -n "$HEADING" ]; then
  hline="$(grep -nxF -- "$HEADING" "$TREE/AGENTS.md" | head -n 1 | cut -d: -f1)"
  [ -n "$hline" ] || die "heading not found in AGENTS.md on origin/$BASE: $HEADING"
  inblock="$(awk -v n="$hline" -v b="$BLOCK_BEGIN" -v e="$BLOCK_END" 'index($0,b)==1{inb=1} NR==n{print inb+0; exit} index($0,e)==1{inb=0}' "$TREE/AGENTS.md")"
  [ "$inblock" = 1 ] && die "that heading is inside the generated rules block; use shared mode for team rules"
  level="$(printf '%s' "$HEADING" | sed -E 's/^(#+).*/\1/' | awk '{print length($0)}')"
  awk -v n="$hline" -v lvl="$level" -v text="$TEXT" -v b="$BLOCK_BEGIN" '
    { line[NR]=$0 }
    END {
      stop=NR+1
      for (i=n+1; i<=NR; i++) {
        if (index(line[i], b)==1) { stop=i; break }
        if (match(line[i], /^#+ /) && RLENGTH-1 <= lvl) { stop=i; break }
      }
      last=n
      for (i=n+1; i<stop; i++) if (line[i] ~ /[^[:space:]]/) last=i
      for (i=1; i<=NR; i++) { print line[i]; if (i==last) print text }
    }' "$TREE/AGENTS.md" > "$WORK/agents.new"
else
  { cat "$TREE/AGENTS.md"; [ -n "$(tail -c 1 "$TREE/AGENTS.md")" ] && echo; echo; echo "$TEXT"; } > "$WORK/agents.new"
fi
cat "$WORK/agents.new" > "$TREE/AGENTS.md"

# Follow the repo's commit style: a type prefix only when recent subjects use one.
prefixed="$(git -C "$TREE" log --format=%s -20 2>/dev/null | grep -cE '^[a-z]+(\([^)]*\))?!?: ')"
total="$(git -C "$TREE" log --format=%s -20 2>/dev/null | grep -c .)"
SUBJECT="Add a repo fact to AGENTS.md"
[ "$total" -gt 0 ] && [ $((prefixed * 2)) -gt "$total" ] && SUBJECT="docs: add a repo fact to AGENTS.md"

git -C "$TREE" add -- AGENTS.md
git -C "$TREE" commit --quiet -m "$SUBJECT" -m "$TEXT" || die "git commit failed (is user.name and user.email set?)" "$EXIT_INVALID"
echo "Change on $BRANCH (from origin/$BASE):"
git -C "$TREE" show --format= -- AGENTS.md

if [ "$DRY_RUN" = 1 ]; then
  echo "Dry run: nothing was pushed, and the branch was removed."
  exit "$EXIT_OK"
fi
git -C "$TREE" push --quiet -u origin "$BRANCH" 2>"$WORK/push.err" \
  || repo_fact_fallback "Could not push $BRANCH: $(tail -n 1 "$WORK/push.err")"
KEEP_BRANCH=1
printf 'Adds one repo fact to AGENTS.md%s:\n\n> %s\n\nProposed with the add-rule skill.\n' "${HEADING:+ under \"$HEADING\"}" "$TEXT" > "$WORK/body.md"
if url="$(cd "$TREE" && gh pr create --draft --base "$BASE" --head "$BRANCH" --title "$SUBJECT" --body-file "$WORK/body.md" 2>"$WORK/pr.err")"; then
  echo "✓ Draft PR opened: $url"
  exit "$EXIT_OK"
fi
echo "! $BRANCH is pushed, but the PR could not be opened: $(tail -n 1 "$WORK/pr.err")"
echo "Open it as a draft against $BASE from the repo's GitHub page."
exit "$EXIT_FALLBACK"
