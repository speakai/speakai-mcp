# Speak AI

Speak AI transcribes and analyzes your meetings, interviews, sales calls, research sessions,
webinars and podcasts. This plugin connects Claude to your Speak AI workspace, so you can search
and summarize recordings, pull verbatim quotes, cut clips, run async voice and video surveys,
send a meeting assistant to a call, and automate workflows without leaving the conversation.
Eight skills teach Claude which Speak AI tools to use for each job and in what order.

Full documentation: <https://docs.speakai.co/mcp/plugin>

## What you need

A Speak AI account. The first time Claude uses a Speak AI tool, it opens Speak AI's sign-in and
consent screen. You approve access once, and there is no API key to copy or paste.

## What this plugin runs and connects to

- **One remote MCP server**, `https://api.speakai.co/v1/mcp`, declared in `.mcp.json`. Every
  tool call goes to that Speak AI endpoint over HTTPS and nowhere else.
- **No local code.** The plugin starts no process, installs no package and runs no hooks or
  scripts on your machine.
- **OAuth sign-in.** Access is granted through Speak AI's consent screen. No API key is stored
  in the plugin or read from your environment.
- **Skills** in `skills/`, which are Markdown instructions only.

## Your data

- The plugin sends your requests, and the details needed to carry them out, such as a search
  query or a recording's id, only to Speak AI's server above.
- Your recordings, transcripts and insights stay in your Speak AI workspace. Claude reads only
  what a request needs, with the permissions of the account you sign in with.
- Tools that delete, overwrite, spend credits or send data outside Speak AI, such as webhooks,
  email or Slack notifications from automations, are marked as such, so Claude asks before
  running them.
- Speak AI's privacy policy: <https://speakai.co/privacy-policy/>. Terms of service:
  <https://speakai.co/terms-of-service/>.

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
- Join my 2pm Zoom call, then give me the action items once the recording is processed.
- Pull exact customer quotes about onboarding friction from recent research calls and format them for a product brief.
- Find a strong 30-second highlight from the latest webinar, create a clip, and export captions.

## Troubleshooting

- If tools do not appear, run `/mcp` in Claude Code and check that the `speakai` server is connected.
- If authentication fails, remove the connection and approve the consent screen again.

## Help and links

- Documentation: <https://docs.speakai.co/mcp/>
- Support: <https://docs.speakai.co/help/>
- Speak AI: <https://speakai.co>

Maintainers: the version and tool counts in this folder are derived values kept in step by
`npm run sync`. The OpenAI and Codex package lives in `../speakai-mcp-portable/`.
