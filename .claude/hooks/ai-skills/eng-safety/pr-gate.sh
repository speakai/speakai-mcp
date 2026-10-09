#!/usr/bin/env bash
# eng-safety/pr-gate: PreToolUse hook for Bash and the GitHub MCP pull-request tools.
# One script serves Claude Code (.claude/settings.json) and Codex (.codex/hooks.json).
#
# Policy: every PR opens as a draft, a human previews it, and the developer marks it Ready.
#
#   create  gh pr create/new without --draft, gh api POST .../pulls without draft=true,
#           GraphQL createPullRequest without draft: true, MCP create_pull_request
#           without draft: true (a JSON boolean)                            -> deny
#   ready   gh pr ready (without --undo), GraphQL markPullRequestReadyForReview,
#           MCP update_pull_request with draft: false, gh pr create --web   -> Claude Code: ask
#           when a human can answer (permission_mode default, acceptEdits, plan, auto); deny in
#           every other mode (bypassPermissions, dontAsk, missing or unknown) because nobody can
#           confirm there. Codex: always deny, because Codex parses a hook's "ask" but does not
#           support it and lets the tool call run (see "Codex" below)
#   merge   gh pr merge (any flags), gh api .../pulls/N/merge, GraphQL mergePullRequest or
#           enablePullRequestAutoMerge, MCP merge_pull_request              -> deny in every mode
#   anything else                                                           -> allow silently
#
# Output: deny is exit 2 with the reason on stderr (exit 2 blocks before permission rules, and
# no other hook's allow can override it). ask is exit 0 with hookSpecificOutput JSON on stdout.
# allow is exit 0 with no output.
#
# Decisions use only the parsed tool_input, never raw stdin (stdin also carries the Bash
# description, which may mention --draft). Commands are split on && || ; | & newlines and
# subshells, quotes are removed the way the shell would, comments are ignored and heredoc
# bodies are treated as data, so a --draft inside a quoted --body does not count. Scripts run
# through bash -c, eval, a heredoc or here-string fed to a shell, or $(...) (quoted or not)
# are checked too, a gh word after a wrapper (timeout, watch, xargs) still counts,
# and option words such as -R/--repo/--hostname before or after "pr" are skipped. A gh api
# body is read from -f/-F fields, @file, --input FILE, a heredoc, a here-string or a < FILE
# redirect; when a graphql or /pulls body was requested but could not be read, it is denied.
# The api endpoint is compared after dropping #fragment and ?query, percent-decoding and
# lowercasing. If jq is missing or the input does not parse, a gh pr / gh api command or a
# *_pull_request tool is denied and everything else is allowed.
#
# Shell expansions are not expanded, so a decision word that is not literal fails closed:
# $VAR or $(...) in the gh subcommand (gh pr $M), a bare positional word in gh pr create,
# the last path segment of a non-GET gh api endpoint, a graphql query= value, or a whole
# bash -c / eval script that is a variable. Arguments such as gh pr merge "$N",
# --title "$T", repos/$REPO/pulls and GET gh api "$URL" are fine.
#
# Codex: the Codex hook command passes --codex, and any event carrying turn_id (a field only
# Codex sends) is treated as Codex too. Codex reports permission_mode "bypassPermissions" when
# its approval policy is never and "default" otherwise; neither changes the Codex decision.
# Codex runs hooks from the session cwd and does not set CLAUDE_PROJECT_DIR; this script needs
# no project root, and relative gh api file names resolve against the event's cwd (or the
# hook's working directory when cwd is missing). MCP tool names are matched by suffix
# (*_create_pull_request and so on), which covers mcp__<server>__create_pull_request and
# Codex app connector names such as mcp__codex_apps__github__create_pull_request.
#
# Not inspected (the draft-pr-guard workflow is the server-side backstop): text piped into a
# shell, curl to the GitHub API, and gh aliases.
#
# Tests: plugins/eng-safety/tests/pr-gate.test.sh. Keep this Bash 3.2 compatible (macOS
# /bin/bash) and do not add set -e: a crash exits 1, and exit 1 lets the tool call through.

input=$(cat)
HOST=claude
[ "${1:-}" = "--codex" ] && HOST=codex

TAG="eng-safety/pr-gate"
R_CREATE="Open the PR as a draft (gh pr create --draft, or draft: true for the GitHub MCP tool) because a human previews every PR before merge and the developer marks it Ready."
R_API_CREATE="Creating a PR through gh api must set draft=true (-F draft=true, or draft: true in a createPullRequest mutation) because a human previews every PR before merge; gh pr create --draft is simpler."
R_API_INPUT="A gh api --input body sent to /pulls must contain \"draft\": true, and this one could not be checked, so use gh pr create --draft instead; a human previews every PR before merge."
R_GQL_INPUT="A gh api graphql body sent through --input, query=@- or a file could not be read by this hook, so it cannot be checked against the draft-PR rule; pass the query inline with -f query='...' (a human previews every PR before merge)."
R_LITERAL="Write the gh subcommand, api endpoint and graphql query literally (no \$VAR or \$(...) in those words) so the draft-PR rule can check them; a human previews every PR before merge."
R_MERGE="Merging is left to a human on GitHub, so do not merge or enable auto-merge; tell the developer the PR is ready for them to preview and merge."
R_READY="This marks the PR Ready for review; confirm only if the developer asked for it, because Ready means a human can now preview and merge it."
R_WEB="gh pr create --web finishes in the browser, where the PR can be opened as ready; confirm only if the developer will pick Draft there, because a human previews every PR before merge."
R_CODEX_READY="This step marks a PR Ready for review (or finishes PR creation in the browser, where it can be opened as ready). Codex cannot show a confirmation prompt from a hook, so it was blocked: leave the PR as a draft and ask the developer to mark it Ready on GitHub or to run the command themselves."
R_HEADLESS="This step needs a human to confirm (it marks a PR Ready, or finishes PR creation in the browser), and this session cannot show a prompt, so leave the PR as a draft; the developer marks it Ready on GitHub or re-runs interactively."

HEREDOC_MARK=$'\036'   # prefix of a word that holds a heredoc body (see the tokenizer)
HEREDOC_NL=$'\035'     # stands in for newlines inside that word

DECISION="allow"
REASON=""

note_deny() {
  if [ "$DECISION" != "deny" ]; then DECISION="deny"; REASON=$1; fi
}
note_ask() {
  if [ "$DECISION" = "allow" ]; then DECISION="ask"; REASON=$1; fi
}
# Ask only when someone can answer the prompt; otherwise fail closed. Codex cannot ask.
ready_policy() {
  if [ "$HOST" = codex ]; then note_deny "$R_CODEX_READY"; return 0; fi
  case "$MODE" in
    default|acceptEdits|plan|auto) note_ask "$1" ;;
    *) note_deny "$R_HEADLESS (permission mode: ${MODE:-not set})" ;;
  esac
}
is_true() {
  case "$1" in 1|t|T|true|TRUE|True) return 0 ;; *) return 1 ;; esac
}
# True when a word holds an unexpanded $VAR, $(...) or backtick, or is the bare "$" the
# tokenizer leaves before an unquoted $(...).
not_literal() {
  case "$1" in *'$'*|*'`'*) return 0 ;; *) return 1 ;; esac
}
# True when a whole bash -c / eval script is a variable ($CMD, ${CMD}, "$@"), which hides the
# command. A $(...) script is not matched: its inner command is analysed on its own.
is_var_script() {
  case "$1" in '$'[A-Za-z_{@*0-9]*) return 0 ;; *) return 1 ;; esac
}
heredoc_text() {  # $1 = marker word -> the heredoc body with real newlines
  printf '%s' "${1#"$HEREDOC_MARK"}" | tr "$HEREDOC_NL" '\n'
}

# ---- Parse the event once: tool, permission mode, cwd, draft field, command ----
# One jq call (it is the slow part of this hook). DRAFT is "true" only for a JSON boolean
# true; "false" for false or the string "false"; empty otherwise. The command goes last
# because it may contain newlines.
why=""
parsed=""
if ! command -v jq >/dev/null 2>&1; then
  why="jq is not installed (brew install jq, or apt-get install jq)"
elif ! parsed=$(printf '%s' "$input" | jq -r '
    [ (.tool_name // ""), (.permission_mode // ""), (.cwd // ""),
      (if has("turn_id") then "codex" else "" end),
      (.tool_input.draft | if . == true then "true" elif . == false or . == "false" then "false" else "" end),
      (.tool_input.command // "") ] | map(tostring) | join("\u001f")' 2>/dev/null); then
  why="the hook input could not be parsed as JSON"
fi
# jq missing or unparseable input: fail closed for PR commands only.
if [ -n "$why" ]; then
  if printf '%s' "$input" | grep -Eq 'gh[[:space:]]+(pr|api)([[:space:]]|$)|(create|update|merge)_pull_request'; then
    printf 'BLOCKED (%s): %s, so this GitHub PR command cannot be checked against the draft-PR rule and was blocked rather than let through unchecked.\n' "$TAG" "$why" >&2
    exit 2
  fi
  exit 0
fi
SEP=$'\037'
TOOL=${parsed%%"$SEP"*};  parsed=${parsed#*"$SEP"}
MODE=${parsed%%"$SEP"*};  parsed=${parsed#*"$SEP"}
CWD=${parsed%%"$SEP"*};   parsed=${parsed#*"$SEP"}
[ "${parsed%%"$SEP"*}" = codex ] && HOST=codex; parsed=${parsed#*"$SEP"}
DRAFT=${parsed%%"$SEP"*}; COMMAND=${parsed#*"$SEP"}
[ -n "$CWD" ] || CWD=$PWD

# ---- Shell tokenizer ----
# Reads the command from ENVIRON["CMD"] and prints one line per simple command, words
# separated by \037, with quotes removed as the shell would. A heredoc body becomes one extra
# word on its command: \036 followed by the body with newlines written as \035. Command
# substitutions inside double quotes are queued and printed as commands of their own.
read -r -d '' TOKENIZER <<'AWK'
function flushword() { if (inword) { seg = seg word "\037"; nw++ } word = ""; inword = 0 }
function flushseg() { flushword(); if (nw > 0) print seg; seg = ""; nw = 0 }
function matchparen(s, p,    d, n, c) {
  d = 0; n = length(s)
  for (; p <= n; p++) {
    c = substr(s, p, 1)
    if (c == "(") d++
    else if (c == ")") { d--; if (d == 0) return p }
  }
  return n
}
function tokenize(s,    n, i, c, nx, q, j, k, d, line, cmp, body, nl) {
  n = length(s); i = 1; q = ""; nhd = 0
  while (i <= n) {
    c = substr(s, i, 1); nx = substr(s, i + 1, 1)
    if (q == "'") {
      if (c == "'") q = ""; else word = word (c == "\n" ? " " : c)
      i++; continue
    }
    if (q == "\"") {
      if (c == "\\" && nx == "\n") { i += 2; continue }
      if (c == "\\" && (nx == "\"" || nx == "\\" || nx == "$" || nx == "`")) { word = word nx; i += 2; continue }
      if (c == "\"") { q = ""; i++; continue }
      if (c == "$" && nx == "(") {
        j = matchparen(s, i + 1)
        subs[nsub++] = substr(s, i + 2, j - i - 2)
        word = word substr(s, i, j - i + 1); i = j + 1; continue
      }
      if (c == "`") {
        j = index(substr(s, i + 1), "`"); if (j == 0) j = n - i + 1
        subs[nsub++] = substr(s, i + 1, j - 1)
        word = word substr(s, i, j + 1); i = i + j + 1; continue
      }
      word = word (c == "\n" ? " " : c); i++; continue
    }
    if (c == "\\") {
      if (nx != "\n") { word = word nx; inword = 1 }
      i += 2; continue
    }
    if (c == "'" || c == "\"") { q = c; inword = 1; i++; continue }
    if (c == "$" && nx == "(") {
      # Unquoted $(...): keep it on the word (so gh pr $(cmd) is a non-literal word) and
      # queue the inner command, as inside double quotes.
      j = matchparen(s, i + 1)
      subs[nsub++] = substr(s, i + 2, j - i - 2)
      word = word substr(s, i, j - i + 1); inword = 1; i = j + 1; continue
    }
    if (c == "#" && !inword) { while (i <= n && substr(s, i, 1) != "\n") i++; continue }
    if (c == "<" && nx == "<" && substr(s, i + 2, 1) == "<") {
      # Here-string: keep "<<<" as its own word so a shell fed one can be checked.
      flushword(); word = "<<<"; inword = 1; flushword(); i += 3; continue
    }
    if (c == "<" && nx == "<") {
      # Heredoc: remember the delimiter; the body is read at the end of this line.
      flushword(); i += 2; hdtab[nhd] = 0
      if (substr(s, i, 1) == "-") { hdtab[nhd] = 1; i++ }
      while (i <= n && (substr(s, i, 1) == " " || substr(s, i, 1) == "\t")) i++
      d = ""
      while (i <= n) {
        c = substr(s, i, 1)
        if (c ~ /[ \t\n;&|()<>]/) break
        if (c != "'" && c != "\"" && c != "\\") d = d c
        i++
      }
      hd[nhd++] = d; continue
    }
    if (c == " " || c == "\t" || c == "\r") { flushword(); i++; continue }
    if (c == "\n" && nhd > 0) {
      flushword(); i++
      for (k = 0; k < nhd; k++) {
        body = ""
        while (i <= n) {
          nl = index(substr(s, i), "\n")
          line = nl ? substr(s, i, nl - 1) : substr(s, i)
          i = nl ? i + nl : n + 1
          cmp = line; if (hdtab[k]) sub(/^\t+/, "", cmp)
          if (cmp == hd[k]) break
          body = body line "\035"
        }
        word = "\036" body; inword = 1; flushword()
      }
      nhd = 0; flushseg(); continue
    }
    if (c == "`") {
      # Keep the backtick on the word it ends so gh pr `cmd` is seen as a non-literal word.
      word = word c; inword = 1; flushseg(); i++; continue
    }
    if (c == "\n" || c == ";" || c == "(" || c == ")") { flushseg(); i++; continue }
    if (c == "&") {
      if (nx == "&") { flushseg(); i += 2; continue }
      if (nx == ">" || word ~ /[<>]$/) { word = word c; inword = 1; i++; continue }
      flushseg(); i++; continue
    }
    if (c == "|") {
      if (word ~ />$/) { word = word c; i++; continue }
      flushseg(); i++; if (nx == "|" || nx == "&") i++
      continue
    }
    word = word c; inword = 1; i++
  }
  flushseg()
}
BEGIN {
  nsub = 0
  tokenize(ENVIRON["CMD"])
  for (k2 = 0; k2 < nsub && k2 < 20; k2++) tokenize(subs[k2])
}
AWK

analyze_command() {  # $1 = shell text, $2 = recursion depth
  local line
  [ "$2" -gt 3 ] && return 0
  while IFS= read -r line; do
    analyze_segment "$line" "$2"
  done < <(CMD="$1" awk "$TOKENIZER")
}

analyze_segment() {  # $1 = \037-separated words, $2 = depth
  local -a w
  IFS=$'\037' read -r -a w <<< "$1"
  local n=${#w[@]} i=0 j a prog script="" rest=""
  # Skip env assignments and wrappers so "FOO=1 sudo gh pr merge" is still seen as gh.
  while [ "$i" -lt "$n" ]; do
    case "${w[$i]}" in
      [A-Za-z_]*=*|-*) ;;
      '{'|'!'|then|do|else|elif|if|while|until|time|command|builtin|exec|nohup|env|sudo|xargs|nice) ;;
      *) break ;;
    esac
    i=$((i + 1))
  done
  [ "$i" -lt "$n" ] || return 0
  prog=${w[$i]##*/}
  case "$prog" in
    bash|sh|zsh|dash|ksh)
      # bash -c 'script', or a heredoc / here-string fed to the shell.
      j=$((i + 1))
      while [ "$j" -lt "$n" ]; do
        case "${w[$j]}" in
          "$HEREDOC_MARK"*) script=$(heredoc_text "${w[$j]}"); break ;;
          "<<<") j=$((j + 1)); [ "$j" -lt "$n" ] && script=${w[$j]}; break ;;
          --*) j=$((j + 1)) ;;   # --norc, --rcfile: not the -c flag
          -*c*) j=$((j + 1)); [ "$j" -lt "$n" ] && script=${w[$j]}; break ;;
          *) j=$((j + 1)) ;;
        esac
      done
      is_var_script "$script" && note_deny "$R_LITERAL"
      [ -n "$script" ] && analyze_command "$script" $(($2 + 1))
      return 0 ;;
    eval)
      for a in "${w[@]:$((i + 1))}"; do rest="$rest $a"; done
      is_var_script "${rest# }" && note_deny "$R_LITERAL"
      analyze_command "$rest" $(($2 + 1))
      return 0 ;;
  esac
  # $GH pr merge: a command word that is a variable, followed by pr or api, is treated as gh.
  case "${w[$i]}" in
    *'$'*|*'`'*)
      case "${w[$((i + 1))]:-}" in pr|api) analyze_gh "${w[@]:$((i + 1))}"; return 0 ;; esac ;;
  esac
  # The first unquoted gh word anywhere in the command counts, so wrappers such as
  # "timeout 60 gh ..." or "watch gh ..." are covered. An unquoted "echo gh pr merge" is
  # therefore treated as a merge; quote it to mention the command.
  while [ "$i" -lt "$n" ]; do
    if [ "${w[$i]##*/}" = gh ]; then
      analyze_gh "${w[@]:$((i + 1))}"
      return 0
    fi
    i=$((i + 1))
  done
  return 0
}

# Sets GH_FLAGS to the number of leading option words in "$@", so that gh -R o/r pr merge and
# gh pr --repo o/r merge match like gh pr merge. -R, --repo and --hostname take a value;
# --repo=x, -Rx and any other -word count as one word. A global avoids a subshell per call.
count_gh_flags() {
  GH_FLAGS=0
  while [ $# -gt 0 ]; do
    case "$1" in
      -R|--repo|--hostname)
        if [ $# -ge 2 ]; then GH_FLAGS=$((GH_FLAGS + 2)); shift 2
        else GH_FLAGS=$((GH_FLAGS + 1)); shift; fi ;;
      --) break ;;
      -*) GH_FLAGS=$((GH_FLAGS + 1)); shift ;;
      *) break ;;
    esac
  done
}

analyze_gh() {
  local a
  count_gh_flags "$@"; shift "$GH_FLAGS"
  [ $# -gt 0 ] || return 0
  if not_literal "$1"; then note_deny "$R_LITERAL"; return 0; fi
  if [ "$1" = pr ]; then
    shift
    count_gh_flags "$@"; shift "$GH_FLAGS"
    if [ $# -gt 0 ] && not_literal "$1"; then note_deny "$R_LITERAL"; return 0; fi
    set -- pr "$@"
  fi
  case "$1 $2" in
    "pr create"|"pr new")
      shift 2; check_pr_create "$@" ;;
    "pr ready")
      for a in "$@"; do [ "$a" = "--undo" ] && return 0; done
      ready_policy "$R_READY" ;;
    "pr merge")
      note_deny "$R_MERGE" ;;
    api\ *)
      shift; check_gh_api "$@" ;;
  esac
  return 0
}

check_pr_create() {
  local draft=0 web=0 dry=0 a letters ch val
  while [ $# -gt 0 ]; do
    a=$1; shift
    case "$a" in
      --) break ;;
      "$HEREDOC_MARK"*) ;;
      *'<'|*'>'|'<<<') shift ;;   # a redirect operator; its target is the next word
      *'<'*|*'>'*) ;;             # a redirect with its target attached (2>err.log)
      [!-]*) not_literal "$a" && note_deny "$R_LITERAL" ;;   # gh pr create takes no positional words
      --draft) draft=1 ;;
      --draft=*) if is_true "${a#--draft=}"; then draft=1; else draft=0; fi ;;
      --web) web=1 ;;
      --web=*) if is_true "${a#--web=}"; then web=1; else web=0; fi ;;
      --dry-run) dry=1 ;;
      --dry-run=*) if is_true "${a#--dry-run=}"; then dry=1; else dry=0; fi ;;
      --assignee|--base|--body|--body-file|--head|--label|--milestone|--project|--recover|--reviewer|--template|--title|--repo)
        shift ;;
      --*) ;;
      -?*)
        # Short-flag cluster such as -d, -fd, -dw, -tTitle. Bool letters: d e f w.
        # Note -d here is --draft; on gh pr merge, -d means --delete-branch.
        letters=${a#-}
        while [ -n "$letters" ]; do
          ch=${letters:0:1}; letters=${letters:1}
          case "$ch" in
            d|w)
              val=1
              if [ "${letters:0:1}" = "=" ]; then
                is_true "${letters:1}" || val=0
                letters=""
              fi
              if [ "$ch" = d ]; then draft=$val; else web=$val; fi ;;
            a|B|b|F|H|l|m|p|r|T|t|R)
              [ -z "$letters" ] && shift
              letters="" ;;
          esac
        done ;;
    esac
  done
  [ "$dry" = 1 ] && return 0
  if [ "$web" = 1 ]; then
    ready_policy "$R_WEB"
  elif [ "$draft" != 1 ]; then
    note_deny "$R_CREATE"
  fi
  return 0
}

# Reads a file named in a gh api argument (relative to the session cwd) into FILE_TEXT.
# Returns 1 when it cannot be read, or when the name is not literal.
read_arg_file() {
  local f=$1
  FILE_TEXT=""
  not_literal "$f" && return 1
  case "$f" in /*) ;; *) [ -n "$CWD" ] && f="$CWD/$f" ;; esac
  [ -f "$f" ] && [ -r "$f" ] || return 1
  FILE_TEXT=$(cat "$f")
  return 0
}

check_gh_api() {
  local method="" endpoint="" has_input=0 input_file="" input_text="" fields=""
  local stdin_text="" stdin_ok=0 stdin_file="" unreadable=0 text a f var
  while [ $# -gt 0 ]; do
    a=$1; shift
    case "$a" in
      "$HEREDOC_MARK"*) stdin_text=$(heredoc_text "$a"); stdin_ok=1 ;;
      "<<<") stdin_text=$1; stdin_ok=1; shift ;;
      "<") stdin_file=$1; shift ;;
      "<"[!\<\(]*) stdin_file=${a#<} ;;
      -X|--method) method=$1; shift ;;
      --method=*) method=${a#--method=} ;;
      -X*) method=${a#-X} ;;
      -f|-F|--field|--raw-field) fields="$fields$1"$'\n'; shift ;;
      --field=*|--raw-field=*) fields="$fields${a#*=}"$'\n' ;;
      -f*|-F*) fields="$fields${a#-?}"$'\n' ;;
      --input) has_input=1; input_file=$1; shift ;;
      --input=*) has_input=1; input_file=${a#--input=} ;;
      -H|--header|-q|--jq|-t|--template|--hostname|--cache|-p|--preview) shift ;;
      -*) ;;
      *) [ -z "$endpoint" ] && endpoint=$a ;;
    esac
  done
  # A < FILE redirect is stdin too.
  if [ -n "$stdin_file" ]; then
    if read_arg_file "$stdin_file"; then stdin_text=$FILE_TEXT; stdin_ok=1; else stdin_ok=0; fi
  fi
  # The --input body: stdin for "-", otherwise the file. input_ok says whether it was read.
  local input_ok=0
  if [ "$has_input" = 1 ]; then
    if [ "$input_file" = - ]; then
      input_text=$stdin_text; input_ok=$stdin_ok
    elif read_arg_file "$input_file"; then
      input_text=$FILE_TEXT; input_ok=1
    fi
  fi
  method=$(printf '%s' "$method" | tr '[:lower:]' '[:upper:]')
  if [ -z "$method" ]; then
    if [ -n "$fields" ] || [ "$has_input" = 1 ]; then method=POST; else method=GET; fi
  fi
  # A write whose endpoint path ends in a variable (gh api "$EP" -X PUT, .../pulls/3/$A)
  # cannot be checked. A variable earlier in the path (repos/$REPO/pulls,
  # issues/$N/comments) is fine: the literal tail still decides which rule applies.
  f=${endpoint%%[?#]*}; f=${f%/}
  if [ "$method" != GET ] && not_literal "${f##*/}"; then
    note_deny "$R_LITERAL"; return 0
  fi
  # Normalise the endpoint the way it reaches GitHub: drop the fragment and query string,
  # percent-decode, lowercase, drop the host (github.com or GHE /api/v3), squeeze slashes.
  endpoint=${endpoint%%#*}
  endpoint=${endpoint%%\?*}
  case "$endpoint" in *%*) endpoint=$(printf '%b' "${endpoint//%/\\x}") ;; esac
  endpoint=$(printf '%s' "$endpoint" | tr '[:upper:]' '[:lower:]')
  case "$endpoint" in
    http://*|https://*)
      endpoint=${endpoint#*://}; endpoint=${endpoint#*/}; endpoint=${endpoint#api/v3/}
      [ "$endpoint" = api/graphql ] && endpoint=graphql ;;
  esac
  endpoint=$(printf '%s' "$endpoint" | tr -s '/')
  endpoint=${endpoint#/}
  endpoint=${endpoint%/}

  case "$endpoint" in
    graphql)
      # The query can arrive as -f query=..., -F query=@file, --input FILE, or on stdin
      # (a heredoc, a here-string or a < FILE redirect). A body that was asked for but
      # could not be read fails closed, as does a query that is only a variable.
      text="$fields$input_text"
      while IFS= read -r f; do
        case "$f" in
          query='$'*|query='`'*) note_deny "$R_LITERAL" ;;
        esac
        case "$f" in
          *=@-) text="$text$stdin_text"; [ "$stdin_ok" = 1 ] || unreadable=1 ;;
          *=@*)
            if read_arg_file "${f#*=@}"; then text="$text$FILE_TEXT"; else unreadable=1; fi ;;
        esac
      done <<< "$fields"
      [ "$has_input" = 1 ] && [ "$input_ok" != 1 ] && unreadable=1
      [ "$unreadable" = 1 ] && note_deny "$R_GQL_INPUT"
      if printf '%s' "$text" | grep -Eq 'mergePullRequest|enablePullRequestAutoMerge'; then
        note_deny "$R_MERGE"
      fi
      if printf '%s' "$text" | grep -q 'markPullRequestReadyForReview'; then
        ready_policy "$R_READY"
      fi
      if printf '%s' "$text" | grep -q 'createPullRequest'; then
        if ! printf '%s' "$text" | grep -Eq 'draft[[:space:]]*:[[:space:]]*true'; then
          var=$(printf '%s' "$text" | sed -n 's/.*draft[[:space:]]*:[[:space:]]*\$\([A-Za-z_][A-Za-z0-9_]*\).*/\1/p' | head -n 1)
          if [ -z "$var" ] || ! printf '%s' "$fields" | grep -Eq "^$var=(true|1)\$"; then
            note_deny "$R_API_CREATE"
          fi
        fi
      fi ;;
    repos/*/pulls/*/merge)
      [ "$method" != GET ] && note_deny "$R_MERGE" ;;
    repos/*/pulls/*/*) ;;
    repos/*/pulls/*)
      if [ "$method" = PATCH ] && printf '%s' "$fields" | grep -Eq '^draft=(false|0)$'; then
        ready_policy "$R_READY"
      fi ;;
    repos/*/pulls)
      if [ "$method" = POST ]; then
        if [ "$has_input" = 1 ]; then
          { [ "$input_ok" = 1 ] && printf '%s' "$input_text" | grep -Eq '"draft"[[:space:]]*:[[:space:]]*true'; } || note_deny "$R_API_INPUT"
        elif ! printf '%s' "$fields" | grep -Eq '^draft=(true|1)$'; then
          note_deny "$R_API_CREATE"
        fi
      fi ;;
  esac
  return 0
}

# ---- Route by tool ----
case "$TOOL" in
  Bash)
    analyze_command "$COMMAND" 0 ;;
  mcp__*_create_pull_request)
    [ "$DRAFT" = true ] || note_deny "$R_CREATE" ;;
  mcp__*_update_pull_request)
    [ "$DRAFT" = false ] && ready_policy "$R_READY" ;;
  mcp__*_merge_pull_request)
    note_deny "$R_MERGE" ;;
esac

case "$DECISION" in
  deny)
    printf 'BLOCKED (%s): %s\n' "$TAG" "$REASON" >&2
    exit 2 ;;
  ask)
    jq -n --arg r "$TAG: $REASON" \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
    exit 0 ;;
esac
exit 0
