# Sourced by block-secrets.sh, comment-guard.sh and test-guard.sh: the lines one tool call adds.
# Not a hook itself, so it is wired nowhere. Callers set $input (the event JSON) first.
#
# read_event WORKDIR reads the event with one jq call. It sets $tool, $cwd (the session cwd,
# or pwd when the event has none) and $file (tool_input.file_path), and writes the tool's text
# fields to WORKDIR/field.0, field.1, ... in order: old and new string pairs (Edit, MultiEdit),
# the content (Write) or the patch (apply_patch). It returns 1 when the event cannot be read.
#
# added_lines_stream WORKDIR, after read_event, prints one record per line: "F<TAB>path" starts
# a file, "A<TAB>text" is an added line and "B" ends a run of consecutive added lines. It
# returns 1 for an unknown tool or an event without a path, so callers can fail open.
#   Edit, MultiEdit: diff old_string against new_string, one run per hunk.
#   Write:           diff against HEAD when the file is tracked; a new file counts as all added.
#   apply_patch:     Codex patch headers "*** Add File: p", "*** Update File: p" (optionally
#                    followed by "*** Move to: p") and "*** Delete File: p". Added lines start
#                    with "+"; any other line ends the current run. Indented lines are tolerated.
# patch_stream does the apply_patch part alone, for a caller that already has the patch text.

read_event() {
  local work=$1 i=0 field
  printf '%s' "$input" | jq -j '
    (.tool_name // ""), "\u0000", (.cwd // ""), "\u0000", (.tool_input.file_path // ""), "\u0000",
    ( if .tool_name == "Edit" then (.tool_input.old_string // ""), "\u0000", (.tool_input.new_string // ""), "\u0000"
      elif .tool_name == "MultiEdit" then (.tool_input.edits // [] | .[] | (.old_string // ""), "\u0000", (.new_string // ""), "\u0000")
      elif .tool_name == "Write" then (.tool_input.content // ""), "\u0000"
      elif .tool_name == "apply_patch" and .tool_input.command then .tool_input.command, "\u0000"
      else empty end )' > "$work/event" 2>/dev/null || return 1
  { IFS= read -r -d '' tool && IFS= read -r -d '' cwd && IFS= read -r -d '' file || return 1
    while IFS= read -r -d '' field; do printf '%s' "$field" > "$work/field.$i"; i=$((i + 1)); done
  } < "$work/event"
  FIELDS=$i
  [ -n "$cwd" ] || cwd=$(pwd)
}

abs_path() {  # $1 = path from the tool call; relative paths are relative to the session cwd
  case "$1" in /*) printf '%s' "$1" ;; *) printf '%s/%s' "$cwd" "$1" ;; esac
}

# emit_diff_runs PATH OLD_FILE NEW_FILE: the "+" lines of diff -U0, one run per hunk.
emit_diff_runs() {
  printf 'F\t%s\n' "$1"
  diff -U0 "$2" "$3" 2>/dev/null | awk '
    NR <= 2 && (/^--- / || /^\+\+\+ /) { next }
    /^@@/ { print "B"; next }
    /^\+/ { print "A\t" substr($0, 2); next }
  '
  printf 'B\n'
}

# patch_stream: a Codex patch on stdin, as stream records on stdout.
patch_stream() {
  awk '
    { line = $0; sub(/^[ \t]+/, "", line) }
    line ~ /^\*\*\* (Add|Update) File: / { f = line; sub(/^\*\*\* (Add|Update) File: /, "", f); print "B"; print "F\t" f; skip = 0; next }
    line ~ /^\*\*\* Move to: /           { f = line; sub(/^\*\*\* Move to: /, "", f); print "B"; print "F\t" f; skip = 0; next }
    line ~ /^\*\*\* Delete File: /       { print "B"; skip = 1; next }
    line ~ /^\+/ && !skip                { print "A\t" substr(line, 2); next }
    { print "B" }
  '
}

added_lines_stream() {
  local work=$1 i=0 abs
  case "$tool" in
    Edit|MultiEdit)
      [ -n "$file" ] || return 1
      while [ $((i + 1)) -lt "$FIELDS" ]; do
        emit_diff_runs "$file" "$work/field.$i" "$work/field.$((i + 1))"
        i=$((i + 2))
      done
      ;;
    Write)
      [ -n "$file" ] || return 1
      abs=$(abs_path "$file")
      if ! git -C "$(dirname "$abs")" show "HEAD:./$(basename "$abs")" > "$work/old" 2>/dev/null; then
        : > "$work/old"
      fi
      emit_diff_runs "$file" "$work/old" "$work/field.0"
      ;;
    apply_patch)
      [ "$FIELDS" -gt 0 ] || return 0
      patch_stream < "$work/field.0"
      ;;
    *) return 1 ;;
  esac
}
