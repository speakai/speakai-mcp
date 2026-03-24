<p align="center">
  <img src="assets/logo.png" alt="Speak AI" width="120" />
</p>

<h1 align="center">Speak AI MCP Server & CLI</h1>

<p align="center">
  Connect Claude, ChatGPT, and other AI assistants to your <a href="https://speakai.co">Speak AI</a> workspace.<br/>
  Transcribe meetings, analyze media, extract insights — through AI assistants or the command line.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@speakai/mcp-server"><img src="https://img.shields.io/npm/v/@speakai/mcp-server" alt="npm version" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-blue" alt="MCP compatible" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" /></a>
</p>

---

## What You Can Do

**With AI assistants:**

> "Transcribe this audio file and give me the key takeaways"

> "What action items came out of yesterday's team meeting?"

> "Export all Q1 interview transcripts as PDFs with speaker names"

**From the command line:**

```sh
speakai-mcp upload https://example.com/meeting.mp3 --wait
speakai-mcp transcript abc123 --plain
speakai-mcp ask abc123 "What were the action items?"
speakai-mcp export abc123 -f pdf --speakers
```

---

## Quick Start

### 1. Get Your API Key

1. Log in to [Speak AI](https://app.speakai.co)
2. Go to **Settings > Developer**
3. Copy your **API Key**

That's it — the server handles access token management automatically.

### 2. Choose How to Use It

---

## CLI (Command Line)

Install globally and configure your API key once:

```sh
npm install -g @speakai/mcp-server
speakai-mcp config set-key
```

Or run without installing:

```sh
npx @speakai/mcp-server config set-key
```

Then use any command:

```sh
speakai-mcp ls                                    # List all media
speakai-mcp upload https://example.com/call.mp3   # Upload media
speakai-mcp transcript <id>                       # Get transcript
speakai-mcp insights <id>                         # Get AI insights
speakai-mcp ask <id> "Summarize this meeting"     # Ask AI questions
speakai-mcp export <id> -f pdf --speakers         # Export transcript
speakai-mcp schedule-meeting <zoom-url>           # Join a meeting
```

### All CLI Commands

| Command | Description |
|---|---|
| `config set-key [key]` | Set your API key (interactive if no key given) |
| `config show` | Show current configuration |
| `config set-url <url>` | Set custom API base URL |
| `list-media` / `ls` | List media files with filtering and pagination |
| `get-transcript` / `transcript <id>` | Get transcript (formatted, `--plain`, or `--json`) |
| `get-insights` / `insights <id>` | Get AI insights (topics, sentiment, keywords) |
| `upload <url>` | Upload media from URL (`--wait` to poll until done) |
| `export <id>` | Export transcript (`-f pdf\|docx\|srt\|vtt\|txt\|csv\|md`) |
| `status <id>` | Check media processing status |
| `create-text <name>` | Create text note (`--text` or pipe via stdin) |
| `list-folders` / `folders` | List all folders |
| `ask <id> <prompt>` | Ask AI a question about a media file |
| `schedule-meeting <url>` | Schedule meeting assistant to join a call |

### CLI Options

Every command supports:
- `--json` — output raw JSON (for scripting and piping)
- `--help` — show command-specific help

```sh
# Pipe transcript to a file
speakai-mcp transcript abc123 --plain > meeting.txt

# Upload and wait for processing
speakai-mcp upload https://example.com/interview.mp3 -n "Q1 Interview" --wait

# Create text note from stdin
cat notes.txt | speakai-mcp create-text "Meeting Notes"

# List only video files as JSON
speakai-mcp ls --type video --json | jq '.mediaList[].name'
```

---

## MCP Server (AI Assistants)

### Claude Desktop

Add to your config file:

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

### Claude Code

```sh
export SPEAK_API_KEY="your-api-key"
claude mcp add speak-ai -- npx -y @speakai/mcp-server
```

### Claude Web (claude.ai)

1. Go to **Settings > Connectors > Add Connector**
2. Enter the URL: `https://api.speakai.co/v1/mcp`
3. Add your `x-speakai-key` and `x-access-token` headers
4. Start chatting with your Speak AI data

### Any MCP Client

Any STDIO-compatible client can connect:

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
git clone https://github.com/speakai/speakai-mcp.git
cd speakai-mcp

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
