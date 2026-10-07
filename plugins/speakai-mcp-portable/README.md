# Speak AI agent plugin

A portable plugin that connects an AI agent to Speak AI. It follows the open
[Agent Plugins](https://agent-plugins.org) standard (version 1.0.0), so any compatible
client can load it. It is also the package for Codex and for the OpenAI plugin directory
(ChatGPT). Claude uses the Claude-only package in `../speakai-mcp/`.

The plugin gives an agent 168 Speak AI tools, 5 resources, and 3 prompts, plus eight skills
that teach it how to use them. Access alone is not much use: the skills are what turn "this
agent can call 168 tools" into "this agent knows which three to call, in what order, and
what to do when a recording is still processing".

Full documentation: <https://docs.speakai.co/mcp/plugin>

## What is in here

```
plugins/speakai-mcp-portable/
├── plugin.json                 # Agent Plugins manifest, the portable identity and OpenAI listing
├── mcp.json                    # Agent Plugins MCP config, the remote Speak AI server
├── skills/                     # Eight skills, discovered at this fixed location
│   └── <skill>/
│       ├── SKILL.md            # generated from ../speakai-mcp/skills, do not edit here
│       └── agents/openai.yaml  # OpenAI skill metadata, authored here
├── .codex-plugin/plugin.json   # Codex's own manifest format
└── assets/                     # OpenAI and Codex listing icons and logos (no code)
```

`plugin.json` and `mcp.json` are the portable core. `.codex-plugin/` is Codex's own
convention, not an Agent Plugins extension namespace, and other clients ignore it.

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
carry a key.

### Codex

```sh
codex plugin marketplace add speakai/speakai-mcp
```

Then install **Speak AI** from that marketplace in the Plugins Directory of the ChatGPT desktop
app. Codex reads `.codex-plugin/plugin.json` through the repository's
`.agents/plugins/marketplace.json`.

### Claude

Use the Claude package in `../speakai-mcp/`; its README has the install steps.

## Skills

| Skill | What it covers |
| --- | --- |
| `getting-started` | What Speak AI is, how to connect, the tool categories, where to go next |
| `meeting-summaries` | Sending the assistant to a call, then pulling decisions, action items, owners and risks |
| `research-analysis` | Themes, verbatim quotes and sentiment across many interviews, with citations |
| `clips-and-captions` | Finding a moment in a transcript, cutting a clip, exporting captions and embeds |
| `automations-and-webhooks` | Triggers and actions, and receiving events reliably over webhooks |
| `surveys-and-recorders` | Running async voice and video surveys, then analyzing what comes back |
| `dashboards-and-reporting` | Building, sharing and scoping analytics dashboards |
| `social-url-import` | Importing recordings from YouTube and other supported page links |

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

## Editing this plugin

Edit skills in `../speakai-mcp/skills/`, never here: `npm run sync` copies each `SKILL.md`
into this folder and CI fails if a copy drifts. `agents/openai.yaml` files are authored here.

The version and every tool count in this directory are **derived values**. Do not edit them
by hand. They come from `package.json` and `src/tool-names.ts` at the repository root, and
are propagated by:

```sh
npm run sync          # rewrite every derived surface
npm run sync:check    # report drift, used by CI
```

`tests/derived-surfaces.test.ts` fails the build when any of them drift.

When you change the manifests themselves, read the
[Agent Plugins specification](https://agent-plugins.org/specification) first. `plugin.json`
permits a closed set of top-level fields, `SKILL.md` frontmatter permits a closed set of
keys and has no `version`, and only `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` expand inside
`mcp.json`.

## Submitting a new version to the OpenAI plugin directory

Run `npm run build:openai-zip`. It runs `verify-plugin` (including the OpenAI listing, icon and name checks), then writes `.openai-package/speakai-mcp-openai-<version>.zip`. Upload that ZIP to the existing plugin at <https://platform.openai.com/plugins> with **Upload plugin to make changes**.

OpenAI reads the package identity from the root `plugin.json`, and an update must keep the name OpenAI assigned to the existing listing (`OPENAI_PLUGIN_NAME` in `scripts/openai-plugin.ts`). The builder swaps only that name inside the ZIP; the repo keeps `speakai-mcp` for Claude, Codex and the marketplaces. Tool annotation changes reach OpenAI through **Rescan** on the plugin's MCPs tab, not through the ZIP.

## Troubleshooting

- If tools do not appear, check that your client connected the `speakai` server.
- If authentication fails on the remote endpoint, remove the connector and re-approve the
  OAuth consent screen.
- If you run the server locally over stdio and authentication fails, rotate the key at
  <https://app.speakai.co/developers/apikeys> and reconfigure.
