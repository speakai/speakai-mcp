#!/usr/bin/env bash
# PreToolUse: refuse a write that contains a hardcoded credential.
#   Claude Code: Write|Edit|MultiEdit, reading tool_input.content or tool_input.new_string.
#   Codex:       apply_patch (tool_name "apply_patch"; tool_input.command holds the patch text).
#                Only the lines the patch adds are checked, file by file.
# Exit 2 = blocked; stderr is fed back to the agent so it self-corrects.
# Defense in depth: catches common credential shapes before they reach a commit.
set -uo pipefail
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)

if [ "$tool" = apply_patch ]; then
  # The added lines of every file in the patch that is not a .env file (see _added-lines.sh).
  . "$(dirname "$0")/_added-lines.sh" || { echo "BLOCKED (eng-safety/block-secrets): _added-lines.sh is missing next to this hook. Re-run the ai-skills install.sh to restore it." >&2; exit 2; }
  content=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null | patch_stream | awk '
    function envfile(p) { return p ~ /\.env$/ || p ~ /\.env\.[^\/]*$/ }
    /^F\t/ { skip = envfile(substr($0, 3)); next }
    /^A\t/ && !skip { print substr($0, 3) }
  ')
else
  content=$(printf '%s' "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)
  file=$(printf '%s'  "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
  # .env files are where secrets belong — never block those
  case "$file" in *.env|*.env.*) exit 0 ;; esac
fi

if printf '%s' "$content" | grep -nEi \
  -e 'mongodb(\+srv)?://[^ ]*:[^ ]*@' \
  -e 'AKIA[0-9A-Z]{16}' \
  -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' \
  -e 'sk_(live|test)_[0-9A-Za-z]{24,}' \
  -e '(secret|token|api[_-]?key|password)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9/_+\-]{24,}' \
  >/dev/null 2>&1; then
  echo "BLOCKED (eng-safety/block-secrets): this write looks like a hardcoded secret. Read it from process.env / os.getenv and keep the value in .env — never inline." >&2
  exit 2
fi
exit 0
