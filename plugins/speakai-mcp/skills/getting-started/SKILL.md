---
description: Use when a user asks how to use, configure, troubleshoot, or understand the Speak AI Claude Code plugin and Speak AI MCP tools.
---

# Speak AI MCP Plugin

This plugin connects Claude Code to Speak AI through the `speakai` MCP server. Speak AI stores and analyzes media files such as interviews, coaching calls, research sessions, meetings, podcasts, and videos.

Use the MCP tools when the user wants to work with their Speak AI workspace, including:

- Searching media, transcripts, metadata, and AI insights.
- Reading transcripts, summaries, action items, sentiment, themes, and custom insight fields.
- Uploading, creating, updating, moving, favoriting, deleting, or exporting media.
- Creating clips and captions from recordings.
- Managing folders, webhooks, automations, and meeting assistant workflows.
- Asking Magic Prompt questions across one file, a folder, or the whole workspace.

Respect user intent and privacy. Only fetch the records needed for the user's request, avoid exposing unnecessary personal data, and be explicit before using tools that modify or delete workspace data.

If the tools are unavailable, tell the user to:

1. Confirm the `speakai-mcp` plugin is enabled in Claude Code.
2. Run `/mcp` and check that the `speakai` MCP server is connected.
3. Confirm their Speak AI API key is configured. API keys are generated at `https://app.speakai.co/developers/apikeys`.
4. Confirm Node.js 22 or newer is installed, because the plugin starts `@speakai/mcp-server` through `npx`.
