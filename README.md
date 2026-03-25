<p align="center">
  <img src="assets/logo.png" alt="Speak AI" width="120" />
</p>

<h1 align="center">Speak AI MCP Server & CLI</h1>

<p align="center">
  Connect Claude, Cursor, Windsurf, and other AI assistants to your <a href="https://speakai.co">Speak AI</a> workspace.<br/>
  81 tools, 5 resources, 3 prompts, 26 CLI commands — transcribe, analyze, search, and manage media at scale.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@speakai/mcp-server"><img src="https://img.shields.io/npm/v/@speakai/mcp-server" alt="npm version" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-blue" alt="MCP compatible" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" /></a>
</p>

---

## Quick Start

### 1. Get Your API Key

1. Go to [Speak AI API Keys](https://app.speakai.co/developers/apikeys)
2. Copy your **API Key**

### 2. Choose How to Use It

| Method | Best for |
|---|---|
| **CLI** | Scripts, pipelines, quick one-off tasks |
| **MCP Server** | AI assistants (Claude, Cursor, Windsurf, VS Code) |
| **Both** | Full power — agents orchestrate, CLI automates |

---

## Setup

### Auto-Setup (Recommended)

Detects installed MCP clients and configures them automatically:

```sh
npm install -g @speakai/mcp-server
speakai-mcp init
```

### Manual Setup

<details>
<summary>Claude Desktop</summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

</details>

<details>
<summary>Claude Code</summary>

```sh
export SPEAK_API_KEY="your-api-key"
claude mcp add speak-ai -- npx -y @speakai/mcp-server
```

</details>

<details>
<summary>Cursor</summary>

Add to `~/.cursor/mcp.json`:

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

</details>

<details>
<summary>Windsurf</summary>

Add to `~/.windsurf/mcp.json`:

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

</details>

<details>
<summary>VS Code</summary>

Add to `~/.vscode/mcp.json`:

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

</details>

<details>
<summary>Any MCP Client (STDIO)</summary>

```sh
SPEAK_API_KEY=your-key npx @speakai/mcp-server
```

</details>

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SPEAK_API_KEY` | Yes | -- | Your Speak AI API key |
| `SPEAK_ACCESS_TOKEN` | No | Auto-managed | JWT access token (auto-fetched and refreshed) |
| `SPEAK_BASE_URL` | No | `https://api.speakai.co` | API base URL |

---

## MCP Tools (81)

<details>
<summary>Media (14 tools)</summary>

| Tool | Description |
|---|---|
| `get_signed_upload_url` | Get a pre-signed S3 URL for direct file upload |
| `upload_media` | Upload media from a public URL for transcription |
| `upload_local_file` | Upload a local file directly from disk |
| `upload_and_analyze` | Upload, wait for processing, return transcript + insights in one call |
| `list_media` | List and search media files with filters and pagination |
| `get_media_insights` | Get AI insights — topics, sentiment, summaries, action items |
| `get_transcript` | Get full transcript with speaker labels and timestamps |
| `get_captions` | Get subtitle-formatted captions for a media file |
| `update_transcript_speakers` | Rename speaker labels in a transcript |
| `get_media_status` | Check processing status (pending -> processed) |
| `update_media_metadata` | Update name, description, tags, or folder |
| `delete_media` | Permanently delete a media file |
| `toggle_media_favorite` | Mark or unmark media as a favorite |
| `reanalyze_media` | Re-run AI analysis with latest models |

</details>

<details>
<summary>Magic Prompt / AI Chat (12 tools)</summary>

| Tool | Description |
|---|---|
| `ask_magic_prompt` | Ask AI questions about media, folders, or your whole workspace |
| `retry_magic_prompt` | Retry a failed or incomplete AI response |
| `get_chat_history` | List recent Magic Prompt conversations |
| `get_chat_messages` | Get full message history for conversations |
| `delete_chat_message` | Delete a specific chat message |
| `list_prompts` | List available AI prompt templates |
| `get_favorite_prompts` | Get all favorited prompts and answers |
| `toggle_prompt_favorite` | Mark or unmark a chat message as favorite |
| `update_chat_title` | Rename a chat conversation |
| `submit_chat_feedback` | Rate a chat response (thumbs up/down) |
| `get_chat_statistics` | Get Magic Prompt usage statistics |
| `export_chat_answer` | Export a conversation or answer |

</details>

<details>
<summary>Folders & Views (11 tools)</summary>

| Tool | Description |
|---|---|
| `list_folders` | List all folders with pagination and sorting |
| `get_folder_info` | Get folder details and contents |
| `create_folder` | Create a new folder |
| `clone_folder` | Duplicate a folder and its contents |
| `update_folder` | Rename or update a folder |
| `delete_folder` | Delete a folder (media is preserved) |
| `get_all_folder_views` | List all saved views across folders |
| `get_folder_views` | List views for a specific folder |
| `create_folder_view` | Create a saved view with custom filters |
| `update_folder_view` | Update a saved view |
| `clone_folder_view` | Duplicate a view |

</details>

<details>
<summary>Recorder / Survey (10 tools)</summary>

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

</details>

<details>
<summary>Automations (5 tools)</summary>

| Tool | Description |
|---|---|
| `list_automations` | List automation rules |
| `get_automation` | Get automation details |
| `create_automation` | Create an automation rule |
| `update_automation` | Update an automation |
| `toggle_automation_status` | Enable or disable an automation |

</details>

<details>
<summary>Clips (4 tools)</summary>

| Tool | Description |
|---|---|
| `create_clip` | Create a highlight clip from time ranges across media files |
| `get_clips` | List clips or get a specific clip with download URL |
| `update_clip` | Update clip title, description, or tags |
| `delete_clip` | Permanently delete a clip |

</details>

<details>
<summary>Custom Fields (4 tools)</summary>

| Tool | Description |
|---|---|
| `list_fields` | List all custom fields |
| `create_field` | Create a custom field |
| `update_field` | Update a custom field |
| `update_multiple_fields` | Batch update multiple fields |

</details>

<details>
<summary>Webhooks (4 tools)</summary>

| Tool | Description |
|---|---|
| `create_webhook` | Create a webhook for event notifications |
| `list_webhooks` | List all webhooks |
| `update_webhook` | Update a webhook |
| `delete_webhook` | Delete a webhook |

</details>

<details>
<summary>Meeting Assistant (4 tools)</summary>

| Tool | Description |
|---|---|
| `list_meeting_events` | List scheduled and completed events |
| `schedule_meeting_event` | Schedule AI assistant to join a meeting |
| `remove_assistant_from_meeting` | Remove assistant from active meeting |
| `delete_scheduled_assistant` | Cancel a scheduled meeting assistant |

</details>

<details>
<summary>Media Embed (4 tools)</summary>

| Tool | Description |
|---|---|
| `create_embed` | Create an embeddable player widget |
| `update_embed` | Update embed settings |
| `check_embed` | Check if embed exists for media |
| `get_embed_iframe_url` | Get iframe URL for your website |

</details>

<details>
<summary>Text Notes (4 tools)</summary>

| Tool | Description |
|---|---|
| `create_text_note` | Create a text note for AI analysis |
| `get_text_insight` | Get AI insights for a text note |
| `reanalyze_text` | Re-run AI analysis on a text note |
| `update_text_note` | Update note content (triggers re-analysis) |

</details>

<details>
<summary>Exports (2 tools)</summary>

| Tool | Description |
|---|---|
| `export_media` | Export as PDF, DOCX, SRT, VTT, TXT, CSV, or Markdown |
| `export_multiple_media` | Batch export with optional merge into one file |

</details>

<details>
<summary>Media Statistics & Languages (2 tools)</summary>

| Tool | Description |
|---|---|
| `get_media_statistics` | Get workspace-level stats — counts, storage, processing breakdown |
| `list_supported_languages` | List all supported transcription languages |

</details>

<details>
<summary>Search / Analytics (1 tool)</summary>

| Tool | Description |
|---|---|
| `search_media` | Deep search across transcripts, insights, and metadata with filters |

</details>

---

## MCP Resources (5)

Resources provide direct data access without tool calls. Clients can read these URIs directly.

| Resource | URI | Description |
|---|---|---|
| Media Library | `speakai://media` | List of all media files in your workspace |
| Folders | `speakai://folders` | List of all folders |
| Supported Languages | `speakai://languages` | Transcription language list |
| Transcript | `speakai://media/{mediaId}/transcript` | Full transcript for a specific media file |
| Insights | `speakai://media/{mediaId}/insights` | AI-generated insights for a specific media file |

---

## MCP Prompts (3)

Pre-built workflow prompts that agents can invoke to run multi-step tasks.

### `analyze-meeting`

Upload a recording and get a full analysis — transcript, insights, action items, and key takeaways.

```
Parameters: url (required), name (optional)
```

**Example:** "Use the analyze-meeting prompt with url=https://example.com/standup.mp3"

### `research-across-media`

Search for themes, patterns, or topics across multiple recordings or your entire library.

```
Parameters: topic (required), folder (optional)
```

**Example:** "Use the research-across-media prompt with topic='customer churn reasons'"

### `meeting-brief`

Prepare a brief from recent meetings — pull transcripts, extract decisions, and summarize open items.

```
Parameters: days (optional, default: 7), folder (optional)
```

**Example:** "Use the meeting-brief prompt with days=14 to cover the last two weeks"

---

## CLI (26 Commands)

Install globally and configure once:

```sh
npm install -g @speakai/mcp-server
speakai-mcp config set-key
```

Or run without installing:

```sh
npx @speakai/mcp-server config set-key
```

### Configuration

| Command | Description |
|---|---|
| `config set-key [key]` | Set your API key (interactive if no key given) |
| `config show` | Show current configuration |
| `config test` | Validate API key and test connectivity |
| `config set-url <url>` | Set custom API base URL |
| `init` | Interactive setup — configure key and auto-detect MCP clients |

### Media Management

| Command | Description |
|---|---|
| `list-media` / `ls` | List media files with filtering and pagination |
| `upload <source>` | Upload media from URL or local file (`--wait` to poll) |
| `get-transcript` / `transcript <id>` | Get transcript (`--plain` or `--json`) |
| `get-insights` / `insights <id>` | Get AI insights (topics, sentiment, keywords) |
| `status <id>` | Check media processing status |
| `export <id>` | Export transcript (`-f pdf\|docx\|srt\|vtt\|txt\|csv\|md`) |
| `update <id>` | Update media metadata (name, description, tags, folder) |
| `delete <id>` | Delete a media file |
| `favorites <id>` | Toggle favorite status |
| `captions <id>` | Get captions for a media file |
| `reanalyze <id>` | Re-run AI analysis with latest models |

### AI & Search

| Command | Description |
|---|---|
| `ask <prompt>` | Ask AI about media, folders, or your whole workspace |
| `chat-history` | List past Magic Prompt conversations |
| `search <query>` | Full-text search across transcripts and insights |

### Folders & Clips

| Command | Description |
|---|---|
| `list-folders` / `folders` | List all folders |
| `create-folder <name>` | Create a new folder |
| `clips` | List clips (filter by media or folder) |
| `clip <mediaId>` | Create a clip (`--start` and `--end` in seconds) |

### Workspace

| Command | Description |
|---|---|
| `stats` | Show workspace media statistics |
| `languages` | List supported transcription languages |
| `schedule-meeting <url>` | Schedule AI assistant to join a meeting |
| `create-text <name>` | Create a text note (`--text` or pipe via stdin) |

### CLI Options

Every command supports:
- `--json` — output raw JSON (for scripting and piping)
- `--help` — show command-specific help

### CLI Examples

```sh
# Upload and wait for processing
speakai-mcp upload https://example.com/interview.mp3 -n "Q1 Interview" --wait

# Upload a local file
speakai-mcp upload ./meeting-recording.mp4

# Get plain-text transcript
speakai-mcp transcript abc123 --plain > meeting.txt

# Export as PDF with speaker names
speakai-mcp export abc123 -f pdf --speakers

# Ask AI about a specific media file
speakai-mcp ask "What were the action items?" -m abc123

# Ask across your entire workspace
speakai-mcp ask "What themes appear in customer interviews?"

# Search all transcripts
speakai-mcp search "pricing concerns" --from 2026-01-01

# Create a text note from stdin
cat notes.txt | speakai-mcp create-text "Meeting Notes"

# Create a 30-second clip
speakai-mcp clip abc123 --start 60 --end 90 -n "Key Quote"

# Schedule a meeting bot
speakai-mcp schedule-meeting "https://zoom.us/j/123456" -t "Weekly Standup"

# List videos as JSON for scripting
speakai-mcp ls --type video --json | jq '.mediaList[].name'
```

---

## Workflow Examples

### Transcribe and Analyze a Meeting

```
You: "Upload and transcribe this recording: https://example.com/meeting.mp3"

AI: I'll upload and analyze that for you.
    -> upload_and_analyze(url, name)
    [waits for processing... returns transcript + insights]

    Here's your transcript with 3 speakers identified.
    Key insights: 5 action items, positive sentiment overall.
    Top topics: Q2 roadmap, hiring plan, budget review.
```

### Research Across Your Library

```
You: "What themes came up across all our customer interviews this month?"

AI: Let me search your media library.
    -> search_media(query: "customer interview", startDate: "2026-03-01")
    -> ask_magic_prompt(mediaIds: [...], prompt: "What are the recurring themes?")

    Across 12 interviews, the top themes were:
    1. Pricing sensitivity (mentioned in 8/12)
    2. Onboarding friction (6/12)
    3. Feature requests for API access (5/12)
```

### Meeting Automation

```
You: "Join my 2pm Zoom call, then send me a summary with action items"

AI: -> schedule_meeting_event(meetingUrl, scheduledAt: "2026-03-25T14:00:00Z")

    Done. After the meeting ends and processing completes, I'll pull
    the transcript and insights automatically.

    [After the meeting]
    -> get_media_insights(mediaId)
    -> ask_magic_prompt(mediaIds: [...], prompt: "List all action items with owners")

    Here's your meeting summary with 7 action items...
```

### Build a Weekly Brief

```
You: "Prepare a brief from all meetings in the last week"

AI: -> list_media(from: "2026-03-18", mediaType: "audio")
    -> get_media_insights(mediaId) [for each of 5 meetings]

    Weekly Meeting Brief (Mar 18-25):
    - Engineering Standup: Deployed v2.3, 2 bugs triaged
    - Sales Review: Pipeline at $1.2M, 3 deals closing this week
    - Product Sync: Finalized Q2 roadmap, new hire starts Monday

    Consolidated Action Items: [12 items grouped by owner]
```

---

## For Agent Developers

### Authentication

All requests require `x-speakai-key` (API key) and `x-access-token` (JWT) headers. The MCP server handles token management automatically. Access tokens expire — the client refreshes them via `POST /v1/auth/accessToken`.

### Rate Limits

- Implement exponential backoff on `429` responses
- Cache stable data (folder lists, field definitions, supported languages)
- Use `export_multiple_media` over individual exports for batch operations
- Use `upload_and_analyze` instead of manual upload + poll + fetch loops

### Error Format

All tool errors follow this structure:

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

---

## Resources

- [Speak AI](https://speakai.co) — Platform
- [API Documentation](https://docs.speakai.co) — Full API reference
- [MCP Protocol](https://modelcontextprotocol.io) — Model Context Protocol spec
- [npm Package](https://www.npmjs.com/package/@speakai/mcp-server) — npm registry
- [Support](mailto:accounts@speakai.co) — Email us

## License

MIT
