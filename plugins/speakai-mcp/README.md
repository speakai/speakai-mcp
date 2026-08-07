# Speak AI agent plugin

A portable plugin that connects an AI agent to Speak AI. It follows the open
[Agent Plugins](https://agent-plugins.org) standard (version 1.0.0), so any compatible
client can load it, and it also ships the Claude Code and Codex manifests those clients
expect.

The plugin gives an agent 112 Speak AI tools, 5 resources, and 3 prompts, plus five skills
that teach it how to use them. Access alone is not much use: the skills are what turn "this
agent can call 112 tools" into "this agent knows which three to call, in what order, and
what to do when a recording is still processing".

Full documentation: <https://docs.speakai.co/plugin>

## What is in here

```
plugins/speakai-mcp/
├── plugin.json                 # Agent Plugins manifest, the portable identity
├── mcp.json                    # Agent Plugins MCP config, the remote Speak AI server
├── skills/                     # Five skills, discovered at this fixed location
│   ├── getting-started/
│   ├── meeting-summaries/
│   ├── research-analysis/
│   ├── clips-and-captions/
│   └── automations-and-webhooks/
├── .claude-plugin/plugin.json  # Claude Code's own manifest format
├── .codex-plugin/plugin.json   # Codex's own manifest format
└── .mcp.json                   # stdio server config used by those two clients
```

`plugin.json` and `mcp.json` are the portable core. The dot-directories are each client's
own convention, not Agent Plugins extension namespaces, and compatible clients ignore them.

## Install

### Any Agent Plugins compatible client

The specification deliberately leaves distribution and installation to each client, so the
exact steps differ. Point your client at this directory, or at the published plugin, and it
reads `plugin.json`, connects the server in `mcp.json`, and loads everything under `skills/`.

`mcp.json` declares one server:

```json
{
  "type": "streamable-http",
  "url": "https://api.speakai.co/v1/mcp"
}
```

That endpoint uses OAuth 2.1 with Dynamic Client Registration. You approve access once in a
consent screen and no API key is ever stored in the plugin. This is deliberate: the Agent
Plugins standard has no mechanism for user-supplied secrets, so a portable manifest cannot
carry a key. See [the reference page](https://docs.speakai.co/plugin/reference) for why.

### Claude Code

```sh
claude plugin marketplace add speakai/speakai-mcp
claude plugin install speakai-mcp@speakai
```

Claude Code uses `.mcp.json`, which runs the server locally over stdio and asks for your
Speak AI API key. Create one at <https://app.speakai.co/developers/apikeys>.

## Skills

| Skill | What it covers |
| --- | --- |
| `getting-started` | What Speak AI is, how to connect, the tool categories, where to go next |
| `meeting-summaries` | Sending the assistant to a call, then pulling decisions, action items, owners and risks |
| `research-analysis` | Themes, verbatim quotes and sentiment across many interviews, with citations |
| `clips-and-captions` | Finding a moment in a transcript, cutting a clip, exporting captions and embeds |
| `automations-and-webhooks` | Triggers and actions, and receiving events reliably over webhooks |

Skills load progressively. The name and description of each load at startup, the body loads
only when the agent activates that skill, and anything under `references/` loads only when
it is needed.

## Example prompts

```text
Find the last 10 customer interviews that mention pricing, group the feedback by theme, and cite the source recordings.
```

```text
Summarize this week's team meetings into decisions, action items, owners, and unresolved risks.
```

```text
Pull exact customer quotes about onboarding friction from recent research calls and format them for a product brief.
```

```text
Find a strong 30-second highlight from the latest webinar, create a clip, and export captions.
```

```text
Create a folder for interviews about churn risk and move the matching recordings into it after showing me the list.
```

## Local development

From the repository root:

```sh
claude --plugin-dir ./plugins/speakai-mcp
```

Run `/reload-plugins` inside Claude Code after editing plugin files.

## Editing this plugin

The version and every tool count in this directory are **derived values**. Do not edit them
by hand. They come from `package.json` and `src/tool-names.ts` at the repository root, and
are propagated by:

```sh
npm run sync          # rewrite every derived surface
npm run sync:check    # report drift, used by CI
```

`tests/derived-surfaces.test.ts` fails the build when any of them drift. This exists because
they did drift, repeatedly and silently: this plugin's skill claimed 84 and the root README
claimed 107 long after the real count reached 112.

When you change the manifests themselves, read the
[Agent Plugins specification](https://agent-plugins.org/specification) first. `plugin.json`
permits a closed set of top-level fields, `SKILL.md` frontmatter permits a closed set of
keys and has no `version`, and only `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` expand inside
`mcp.json`.

## Troubleshooting

- If tools do not appear, check that your client connected the `speakai` server. In Claude
  Code, run `/mcp`.
- If authentication fails on the remote endpoint, remove the connector and re-approve the
  OAuth consent screen.
- If authentication fails on stdio, rotate the key at
  <https://app.speakai.co/developers/apikeys> and reconfigure.
- If `npx` cannot install the server, confirm Node.js 22 or newer is on your `PATH`.
