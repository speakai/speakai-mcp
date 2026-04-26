# Speak AI MCP for Claude Code

This Claude Code plugin connects your local Claude Code session to Speak AI through the `@speakai/mcp-server` MCP server. It lets Claude Code work with your Speak AI media, transcripts, AI insights, clips, folders, exports, automations, webhooks, and meeting assistant workflows.

## Install from the marketplace

```sh
claude plugin marketplace add speakai/speakai-mcp
claude plugin install speakai-mcp@speakai
```

When Claude Code enables the plugin, enter your Speak AI API key from:

```text
https://app.speakai.co/developers/apikeys
```

## Local development

From this repository root:

```sh
claude --plugin-dir ./plugins/speakai-mcp
```

Then run `/reload-plugins` inside Claude Code after editing plugin files.

## Troubleshooting

- If tools do not appear, run `/mcp` in Claude Code and confirm the `speakai` server is connected.
- If authentication fails, rotate or recreate your API key in Speak AI and reconfigure the plugin.
- If `npx` cannot install the MCP server, confirm Node.js 22 or newer is available in your shell.
