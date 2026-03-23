<p align="center">
  <img src="https://speakai.co/assets/images/speak-ai-logo.png" alt="Speak AI" width="200" />
</p>

<h1 align="center">Speak AI MCP Server</h1>

<p align="center">
  Connect Claude, ChatGPT, and other AI assistants to your <a href="https://speakai.co">Speak AI</a> workspace.<br/>
  Transcribe meetings, analyze media, extract insights — all through natural conversation.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@speakai/mcp-server"><img src="https://img.shields.io/npm/v/@speakai/mcp-server" alt="npm version" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-blue" alt="MCP compatible" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" /></a>
</p>

---

## What You Can Do

Ask your AI assistant to work with your Speak AI data:

> "Transcribe this audio file and give me the key takeaways"

> "What action items came out of yesterday's team meeting?"

> "Export all Q1 interview transcripts as PDFs with speaker names"

> "Schedule the meeting assistant for my Zoom call at 2pm"

> "Create a folder called Customer Research and move these recordings into it"

---

## Quick Start

### 1. Get Your API Key

1. Log in to [Speak AI](https://app.speakai.co)
2. Go to **Settings > Developer**
3. Copy your **API Key**

That's it — the server handles access token management automatically.

### 2. Connect to Your AI Assistant

There are two ways to connect — choose the one that fits your setup:

---

## Option A: Claude Web / ChatGPT (Remote Connector)

For **Claude on the web** (claude.ai) and **ChatGPT**, use the hosted endpoint. No installation required.

**Claude (claude.ai):**

1. Go to **Settings > Connectors > Add Connector**
2. Enter the URL: `https://api.speakai.co/v1/mcp/sse`
3. Add your authentication headers
4. Start chatting with your Speak AI data

**ChatGPT:**

1. Go to **Settings > Connectors > Create**
2. Enter the MCP URL: `https://api.speakai.co/v1/mcp/sse`
3. Configure authentication with your API key
4. Done — your GPT can now access Speak AI

---

## Option B: Claude Desktop / Claude Code (Local Server)

For **Claude Desktop** and **Claude Code**, the server runs locally on your machine via npm.

**Claude Desktop** — add to your config file:

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "speak-ai": {
      "command": "npx",
      "args": ["-y", "@speakai/mcp-server"],
      "env": {
        "SPEAK_API_KEY": "your-api-key"
      }
    }
  }
}
```

**Claude Code (CLI):**

```sh
export SPEAK_API_KEY="your-api-key"

claude mcp add speak-ai -- npx -y @speakai/mcp-server
claude
```

**Any STDIO-compatible MCP client:**

```sh
SPEAK_API_KEY=your-key npx @speakai/mcp-server
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SPEAK_API_KEY` | Yes | — | Your Speak AI API key |
| `SPEAK_ACCESS_TOKEN` | No | Auto-managed | JWT access token (auto-fetched and refreshed using your API key) |
| `SPEAK_BASE_URL` | No | `https://api.speakai.co` | API base URL |

---

## Available Tools (45)

### Media (Audio/Video)

| Tool | Description |
|---|---|
| `get_signed_upload_url` | Get a pre-signed S3 URL for direct file upload |
| `upload_media` | Upload media from a public URL for transcription |
| `list_media` | List and search media files with filters and pagination |
| `get_media_insights` | Get AI insights — topics, sentiment, summaries, action items |
| `get_transcript` | Get full transcript with speaker labels and timestamps |
| `update_transcript_speakers` | Rename speaker labels in a transcript |
| `get_media_status` | Check processing status (pending → completed) |
| `update_media_metadata` | Update name, description, tags, or folder |
| `delete_media` | Permanently delete a media file |

### Text Notes

| Tool | Description |
|---|---|
| `create_text_note` | Create a text note for AI analysis |
| `get_text_insight` | Get AI insights for a text note |
| `reanalyze_text` | Re-run AI analysis with latest models |
| `update_text_note` | Update note content (triggers re-analysis) |

### Exports

| Tool | Description |
|---|---|
| `export_media` | Export as PDF, DOCX, SRT, VTT, TXT, CSV, or Markdown |
| `export_multiple_media` | Batch export with optional merge into one file |

### Folders

| Tool | Description |
|---|---|
| `list_folders` | List all folders |
| `get_folder_info` | Get folder details and contents |
| `create_folder` | Create a new folder |
| `clone_folder` | Duplicate a folder and its contents |
| `update_folder` | Rename a folder |
| `delete_folder` | Delete a folder (media is preserved) |
| `get_all_folder_views` | List all saved views |
| `get_folder_views` | List views for a specific folder |
| `create_folder_view` | Create a saved view with custom filters |
| `update_folder_view` | Update a saved view |
| `clone_folder_view` | Duplicate a view |

### Recorder / Survey

| Tool | Description |
|---|---|
| `create_recorder` | Create a new recorder or survey |
| `list_recorders` | List all recorders |
| `get_recorder_info` | Get recorder details and questions |
| `clone_recorder` | Duplicate a recorder |
| `get_recorder_recordings` | List all submissions |
| `generate_recorder_url` | Get a shareable public URL |
| `update_recorder_settings` | Update branding and permissions |
| `update_recorder_questions` | Update survey questions |
| `check_recorder_status` | Check if recorder is active |
| `delete_recorder` | Delete a recorder |

### Media Embed

| Tool | Description |
|---|---|
| `create_embed` | Create an embeddable player widget |
| `update_embed` | Update embed settings |
| `check_embed` | Check if embed exists for media |
| `get_embed_iframe_url` | Get iframe URL for your website |

### Magic Prompt (AI Chat)

| Tool | Description |
|---|---|
| `list_prompts` | List available AI prompt templates |
| `ask_magic_prompt` | Ask AI questions about any media file |

### Meeting Assistant

| Tool | Description |
|---|---|
| `list_meeting_events` | List scheduled and completed events |
| `schedule_meeting_event` | Schedule AI assistant to join a meeting |
| `remove_assistant_from_meeting` | Remove assistant from active meeting |
| `delete_scheduled_assistant` | Cancel a scheduled meeting assistant |

### Custom Fields

| Tool | Description |
|---|---|
| `list_fields` | List all custom fields |
| `create_field` | Create a custom field |
| `update_field` | Update a custom field |
| `update_multiple_fields` | Batch update multiple fields |

### Automations

| Tool | Description |
|---|---|
| `list_automations` | List automation rules |
| `get_automation` | Get automation details |
| `create_automation` | Create an automation rule |
| `update_automation` | Update an automation |
| `toggle_automation_status` | Enable or disable an automation |

### Webhooks

| Tool | Description |
|---|---|
| `create_webhook` | Create a webhook for event notifications |
| `list_webhooks` | List all webhooks |
| `update_webhook` | Update a webhook |
| `delete_webhook` | Delete a webhook |

---

## Workflows

### Transcribe and Analyze

```
You: "Upload and transcribe this recording: https://example.com/meeting.mp3"

AI: I'll upload that for you.
    → upload_media(url, name, mediaType: "audio")
    → get_media_status(mediaId)  [polls until complete]
    → get_transcript(mediaId)
    → get_media_insights(mediaId)

    Here's your transcript with 3 speakers identified.
    Key insights: 5 action items, positive sentiment overall...
```

### Research Across Recordings

```
You: "What themes came up across all our customer interviews this month?"

AI: Let me search your media library.
    → list_media(filterName: "interview", from: "2026-03-01")
    → get_media_insights(mediaId)  [for each result]
    → ask_magic_prompt(mediaId, "What are the recurring themes?")

    Across 12 interviews, the top themes were...
```

### Meeting Automation

```
You: "Join my 2pm Zoom call and send me the summary after"

AI: → schedule_meeting_event(meetingUrl, scheduledAt: "2026-03-23T14:00:00Z")

    Done. After the meeting I'll pull the transcript and insights for you.
```

---

## For Agent Developers

### Authentication

All requests require `x-speakai-key` (API key) and `x-access-token` (JWT) headers. Access tokens expire — refresh using `POST /v1/auth/refreshToken`.

### Rate Limits

- Implement exponential backoff on `429` responses
- Cache stable data (folder lists, field definitions)
- Use `export_multiple_media` over individual exports

### Error Format

```json
{
  "content": [{ "type": "text", "text": "Error: HTTP 401: {\"message\": \"Invalid API key\"}" }],
  "isError": true
}
```

| Code | Meaning |
|---|---|
| `401` | Invalid or missing API key / access token |
| `403` | Insufficient permissions |
| `404` | Resource not found |
| `429` | Rate limit exceeded |

---

## Development

```sh
git clone https://github.com/speakai/speak-mcp.git
cd speak-mcp
npm install
npm run dev    # Run with hot reload
npm run build  # Production build
```

## Resources

- [Speak AI](https://speakai.co) — Platform
- [API Documentation](https://docs.speakai.co) — Full API reference
- [MCP Protocol](https://modelcontextprotocol.io) — Model Context Protocol spec
- [Support](mailto:accounts@speakai.co) — Email us

## License

MIT
