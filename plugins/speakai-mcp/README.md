# Speak AI plugin for Claude

Connects Claude to Speak AI, so you can search and summarize your meetings, interviews and
recordings, pull verbatim quotes, cut clips, run async voice and video surveys, and automate
workflows without leaving the conversation. Eight skills teach Claude which Speak AI tools to
use for each job and in what order.

Full documentation: <https://docs.speakai.co/mcp/plugin>

## What this plugin runs and connects to

- **One remote MCP server**, `https://api.speakai.co/v1/mcp`, declared in `.mcp.json`. Every
  tool call goes to that Speak AI endpoint over HTTPS and nowhere else.
- **No local code.** The plugin starts no process, installs no package and runs no hooks or
  scripts on your machine.
- **OAuth sign-in.** The first time a tool is used, Claude opens Speak AI's consent screen.
  You approve access once; no API key is stored in the plugin or read from your environment.
- **Skills** in `skills/`, which are Markdown instructions only.

What the tools can do inside your Speak AI workspace depends on the permissions of the account
you sign in with. Tools that delete, overwrite or send data outside Speak AI are marked as such,
so Claude asks before running them.

## Install

```sh
claude plugin marketplace add speakai/speakai-mcp
claude plugin install speakai-mcp@speakai
```

The same remote server also works as a connector on claude.ai. If you need the server running
locally over stdio, install `@speakai/mcp-server` directly with an API key from
<https://app.speakai.co/developers/apikeys>.

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

## Example prompts

- Find the last 10 customer interviews that mention pricing, group the feedback by theme, and cite the source recordings.
- Summarize this week's team meetings into decisions, action items, owners, and unresolved risks.
- Pull exact customer quotes about onboarding friction from recent research calls and format them for a product brief.
- Find a strong 30-second highlight from the latest webinar, create a clip, and export captions.

## Troubleshooting

- If tools do not appear, run `/mcp` in Claude Code and check that the `speakai` server is connected.
- If authentication fails, remove the connection and approve the consent screen again.

## For maintainers

This folder holds only what Claude reads. The Agent Plugins, Codex and OpenAI package lives in
`../speakai-mcp-portable/`. The version, tool counts and listing links are derived values, and
`npm run sync` keeps both folders in step. The skills in this folder are the source; the copies
in the portable folder are generated from them. Test locally with
`claude --plugin-dir ./plugins/speakai-mcp`.
