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

## Pull requests
- Open every PR as a draft (`gh pr create --draft`, or `draft: true` with the GitHub MCP tool),
  because a human previews each PR before anything merges and a merge here is a public release.
  `.github/workflows/draft-pr-guard.yml` turns a PR opened as ready back into a draft. The
  developer marks it Ready; you may do so when the developer asks, after confirming with them. A
  human merges.
- Ask before any action that is shared or hard to undo: pushing to `main`, deleting branches or
  tags, or anything that publishes.
- Do not commit credentials or `.env` files. Stage by explicit path and do not use `git add -f`,
  which bypasses the `.gitignore` rules that keep local `.env` files out.

## Agent guardrails
`.claude/settings.json` runs the hooks in `.claude/hooks/ai-skills/eng-safety/`: `pr-gate.sh`
blocks non-draft PR creation and merges, and asks before a PR is marked Ready; `block-secrets.sh`
blocks writes that contain a credential. They are vendored from Speak's shared ai-skills repo,
so change them there rather than here. Re-vendor with that repo's
`scripts/install.sh --target <this repo> --plugins eng-safety` (the plugin list is in
`.claude/ai-skills.config`; this repo has no synced skills, only the hooks).
