#!/usr/bin/env bash
# PreToolUse(Write|Edit|MultiEdit): refuse a write that contains a hardcoded credential.
# Exit 2 = blocked; stderr is fed back to Claude so it self-corrects.
# Defense in depth: catches common credential shapes before they reach a commit.
set -uo pipefail
input=$(cat)
content=$(printf '%s' "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)
file=$(printf '%s'  "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# .env files are where secrets belong — never block those
case "$file" in *.env|*.env.*) exit 0 ;; esac

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
