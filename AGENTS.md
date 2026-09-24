# speakai-mcp

The Speak AI MCP server and CLI, published to npm as `@speakai/mcp-server`, plus the
`plugins/speakai-mcp` agent plugin (Claude Code, Codex and Agent Plugins manifests and the
product skills). This repo is public: keep internal hostnames, credentials, customer data and
private links out of every file, commit and PR.

## Layout
- `src/tools/*.ts`: MCP tools, grouped by category and registered in `src/tools/index.ts`.
- `src/tool-names.ts`: the list of every tool name. It is the source of truth for the tool count.
- `src/cli/`: the `speakai-mcp` CLI. `src/client.ts`: the REST client.
- `plugins/speakai-mcp/`: the agent plugin. Its `skills/` ship to customers.
- `scripts/sync-plugin.ts`, `scripts/sync-tools-json.ts`, `scripts/verify-plugin.ts`: generators and checks.

## Commands (Node 22 or newer; setup and the full list are in README.md, Development)
- `npm run dev`: runs `src/index.ts` once with tsx (stdio server, or the CLI when given arguments). It has no watch mode.
- `npm run build`: tsup build into `dist/` (what npm publishes). `dist/index.js` is tracked even
  though `.gitignore` lists `dist`, and every build rewrites it, including the `prepare` step of
  `npm install`. The release job commits a fresh build, so a PR does not need to include it.
- `npm test`: Vitest (`npm run test:watch` to watch). CI runs `npm run build` and `npm run test:coverage` on Ubuntu and Windows, so
  keep paths and scripts cross-platform; coverage thresholds live in `vitest.config.ts`.
- `npm run sync:check`: fails when a derived surface is out of step. `npm run sync` rewrites them.
  The release job runs it; in CI, `tests/derived-surfaces.test.ts` catches the same drift.
- `npm run verify:plugin`: checks the plugin manifests, every SKILL.md, and the tool names skills cite.
  `npm run verify:plugin:live` also probes the remote MCP endpoint.

## Derived values
The version and tool counts in `server.json`, the plugin manifests, `plugins/speakai-mcp/.mcp.json`,
`.claude-plugin/marketplace.json`, `README.md`, `llms.txt` and the skills are written by
`scripts/sync-plugin.ts` from `package.json` and `src/tool-names.ts`. Change the source and run
`npm run sync` instead of editing those numbers by hand, because `tests/derived-surfaces.test.ts`
fails on any drift. When you add or remove a tool: update `src/tool-names.ts`
(`tests/tool-names.test.ts` checks it against the registered tools), run
`npx tsx scripts/sync-tools-json.ts` to regenerate `tools.json`, add the tool's row to the right
section of `README.md`, then run `npm run sync`.

## Releases
Every merge to `main` runs `.github/workflows/release.yml`, which bumps the version, rewrites the
derived files and `CHANGELOG.md`, tags, and publishes to npm, the MCP Registry and ClawHub. There
is no skip: even a docs-only merge ships a patch release. The bump comes from the conventional
commit subjects since the last tag, including every commit on a merged branch: `feat:` makes a
minor release, `!:` or `BREAKING CHANGE` makes a major one, anything else a patch. Use `fix:`,
`chore:`, `docs:` or `test:` unless the change really is a new feature. Leave the version in
`package.json` and `CHANGELOG.md` alone; the release job owns them.

## Tests
Tests live in the root `tests/` folder (Vitest, one file per `src` module or surface, not next to the source); run them with `npm test`.

## Pull requests and secrets
- A merge to `main` is a public release, so every PR stays a draft until a human has previewed it.
  `.github/workflows/draft-pr-guard.yml` turns a PR opened as ready back into a draft. You may
  mark a PR Ready only when the developer asks, after confirming with them. Under Codex, a hook
  cannot pause to ask, so marking Ready is always blocked: ask the developer to do it.
- Shared or hard to undo here: pushing to `main`, deleting branches or tags, and anything that
  publishes.
- The API key comes from `SPEAK_API_KEY` (or `~/.speakai/config.json` for the CLI). Never commit
  it or a `.env` file. Stage by explicit path and do not use `git add -f`, which bypasses the
  `.gitignore` rules that keep local `.env` files out.

<!-- BEGIN ai-skills rules: generated from speakai/ai-skills policy/; change with /add-rule or $add-rule, not here -->
## Team rules
**Working style**
- When adding or upgrading a dependency, use the latest stable version and read its current docs.
- Report an error you cannot fix instead of catching and hiding it.
- When asked for a plan, review or answer, give it and edit nothing until the developer says to build.
- Read the code, config or data before stating how something works, say what you checked, and for complex changes try to prove your own conclusion wrong before calling it done.
- Before adding a function, component, hook, script or flow, search this repo and the shared packages for one that already does it and extend that.
- Before starting, list in the plan every repo and surface the request covers (MCP, docs, mobile, shared packages, UI package, Codex config).
- Try the simplest fix first and add a helper, constant, option or layer only when a second real caller exists today.
- Before starting or resuming work in a worktree or branch, fetch and merge the latest base branch (dev, main or master per this repo) so the work starts from current code.
**Code**
- Comments explain why in one line, never what; change history, plan names and old-behavior notes go in the commit or PR.
- Match and join records by ID, never by name or label.
- Put types, enums, interfaces and constants where this repo keeps them (shared package first, then the feature's own file) and never create a file for one value.
**Tests**
- Every bug fix gets a test that fails without the fix, placed where this repo's AGENTS.md says tests live (full rules: the testing-policy skill, where installed).
**Pull requests**
- Open every PR as a draft (gh pr create --draft); the developer marks it Ready and a human merges.
- Add follow-up work for a task to that task's open PR in this repo instead of opening a new one.
**Safety**
- Ask before shared or irreversible actions; a step marked "needs a decision" stays undecided even inside an approved plan, and reversibility is proven (backup written, objects confirmed) before relying on it.
- Never hardcode a credential or a fallback for one; read it from the secret source this repo's AGENTS.md names.
- Say plainly what you did not verify; after a UI change open it in a browser, check light and dark mode and the widths this repo lists, and attach a screenshot to the PR.
**Definition of done**
- The branch is pushed and the PR shows the final commit.
- The final message lists every PR link with its state, what was verified and how, and what is left (the gap report).
- The change covers every repo and surface on the plan's scope list, or the PR says why one is skipped.
- Tests ran and the PR shows the command and result; a bug fix has its regression test.
<!-- END ai-skills rules -->

## Claude Code and Codex
Codex reads this file and skills in `.agents/skills/`. Claude Code reads `CLAUDE.md`, which only
imports this file, and skills in `.claude/skills/`. The guardrail hooks, the `add-rule` skill
(`/add-rule` in Claude Code, `$add-rule` in Codex) and the team rules block above are vendored
from Speak's shared ai-skills repo, so change them there rather than here. Re-vendor with that
repo's `scripts/install.sh --target <this repo> --plugins eng-safety`; the plugin list and this
repo's id are in `.claude/ai-skills.config`. After pulling, Codex users trust the project once and
approve its hooks in `/hooks` (Codex 0.142 or newer); Codex asks again whenever a hook changes.
The customer-facing skills in `plugins/speakai-mcp/skills/` are plugin content, not skills for
working on this repo.
