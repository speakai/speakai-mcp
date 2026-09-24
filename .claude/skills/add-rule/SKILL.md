---
name: add-rule
description: Add a rule for coding agents to the right place and propose it as a draft PR. Use only when a person explicitly runs add-rule with a rule, such as "add a rule that every PR is a draft". It sorts the rule into a team rule, a repo fact, a hook candidate, a skill, a personal preference or a refusal, checks for duplicates, and runs one shared script. Do not use to edit the generated rules block in AGENTS.md by hand.
disable-model-invocation: true
argument-hint: [rule text]
---

# Add a rule

The rule is the text given with the command. If none was given, ask for it. A rule belongs in exactly one layer, because a rule kept in two places drifts apart.

## 1. Classify it

| Class | When | Route |
|---|---|---|
| Team rule | Always true for the whole team, in every repo it applies to | `shared` mode: a file in ai-skills `policy/`, rendered into every AGENTS.md |
| Hook candidate | A team rule a machine could check on every tool call | `shared` mode with `--hook-candidate`; the PR body flags it. Do not write hook code here |
| Repo fact | True for this repo only (paths, commands, base branch, test location) | `repo-fact` mode: one line in this repo's AGENTS.md |
| Skill | A procedure with several steps, used for one kind of task | Stop and point to sections 1 to 3 of AUTHORING.md in speakai/ai-skills |
| Personal | How one person likes to work (tone, formats, model choice) | `personal` mode: printed with the file to paste it into |
| Refuse | Holds a secret, names a customer, or weakens a safety rule | Stop and say why |

Show the person the class, the final one-line wording and, for a team rule, the id, section and a one-sentence reason. Wait for a yes before running anything.

## 2. Run the script

Run `scripts/propose-rule.sh` from this skill's folder, from the repo root. `--help` lists every option.

```bash
bash <skill folder>/scripts/propose-rule.sh shared --text "<rule>" --id <id> --section "<section>" --reason "<why>"
bash <skill folder>/scripts/propose-rule.sh repo-fact --text "<line>" --heading "## <existing heading>"
bash <skill folder>/scripts/propose-rule.sh personal --text "<rule>"
```

Sections are Working style, Code, Tests, Pull requests, Safety and Definition of done. Add `--applies-to`, `--except` or `--enforced-by` only when they apply. The script clones ai-skills into a temp folder, or branches this repo from its base in a temp worktree, so it never touches the current checkout. It needs network and writes outside the workspace; in a sandbox, ask for approval for that one command. A shared rule runs the ai-skills checks, which take a minute or two.

## 3. Act on the result

- 0: report the draft PR link, or the personal rule and its file.
- 3: a duplicate exists. Show it and stop.
- 4: similar rules exist. Show them; rerun with `--allow-similar` only if the person confirms the new rule neither repeats nor contradicts them.
- 5: no access. Give the person the printed rule file and the new-file link, or the line to add by hand.
- 6: the checks failed. Show the errors, fix the wording with the person and run again.

In a public repo, keep a repo fact free of internal names, people and infrastructure.
