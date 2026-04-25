<p align="center">
  <img src="assets/logo.png" alt="Speak AI" width="120" />
</p>

<h1 align="center">Connect Speak AI to Claude or ChatGPT in 60 seconds</h1>

<p align="center">
  <strong>For coaches, therapists, and qualitative researchers.</strong><br/>
  No Terminal. No npm. No JSON config files.
</p>

<p align="center">
  <a href="https://speakai.co/connect"><strong>Installation guide at speakai.co/connect →</strong></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@speakai/mcp-server"><img src="https://img.shields.io/npm/v/@speakai/mcp-server" alt="npm version" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-blue" alt="MCP compatible" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" /></a>
</p>

---

## What this does

Speak AI transcribes your interviews, coaching calls, and team meetings — then extracts AI insights like summaries, action items, sentiment, and themes.

This connector (built on MCP — the standard way Claude and ChatGPT connect to apps) brings all of that into Claude or ChatGPT. Once installed, you can ask:

- "Show me every coaching call from the last month where my client mentioned 'imposter syndrome'."
- "Summarize the action items from yesterday's team standup."
- "What themes have come up across my last 30 customer interviews?"
- "Pull every quote from Sarah's recordings about pricing."

The AI does the searching, summarizing, and citing. Your recordings stay in your Speak AI workspace — Claude and ChatGPT just query them through this connector.

---

## Install (pick your tool)

> **Two paths to install** — pick whichever feels easier. Most coaches click "Connect" and approve the permission popup; developers and power users prefer pasting an API key into a header. Both work in every client.

> **Don't know which one to pick?** If you already use Claude or ChatGPT, install for whichever one you have. Most coaches and therapists are on Claude.ai or Claude Desktop.

> Speak AI's connector address (paste this into your AI tool's connector settings — it's the same idea as pasting a Zoom link into your calendar): `https://api.speakai.co/v1/mcp`

### Claude.ai (web)

Pro · Max · Team · Enterprise.

1. Open [claude.ai/settings/connectors](https://claude.ai/settings/connectors)
2. Click **Add custom connector**
3. Paste `https://api.speakai.co/v1/mcp`
4. Click **Add** — a permission popup asks you to log into Speak AI and click **Allow**
5. Done. Open a new chat and ask about your recordings.

<details>
<summary>Developer alternative — manual setup with an API key</summary>

Get a key at [app.speakai.co/developers/apikeys](https://app.speakai.co/developers/apikeys), then in step 3 expand **Custom headers** and add `Authorization` = `Bearer <your-key>` before clicking Add.

</details>

### Claude Desktop (Mac or Windows app)

1. Open Claude Desktop → **Settings → Connectors → Add custom connector**
2. Paste `https://api.speakai.co/v1/mcp`
3. Click **Add** — a permission popup opens. Sign in to Speak AI and click **Allow** on the screen that appears.
4. Done.

<details>
<summary>Developer alternative — manual setup with an API key</summary>

Get a key at [app.speakai.co/developers/apikeys](https://app.speakai.co/developers/apikeys), then in step 2 also expand **Custom headers** and add:
- **Header name:** `Authorization`
- **Header value:** `Bearer <your-speak-api-key>`

Then click Add.

</details>

### ChatGPT

Plus · Pro · Business · Enterprise · Edu (non-EEA).

1. Open ChatGPT → **Settings → Connectors → Advanced**
2. Enable **"Allow custom apps"** (OpenAI calls this toggle "Developer Mode" — but you don't need to be a developer to flip it; it just tells ChatGPT you'd like to add a third-party app like Speak AI)
3. Click **Create**, paste `https://api.speakai.co/v1/mcp`
4. Choose the sign-in option when prompted, then sign in to Speak AI and click **Allow** on the permission popup
5. Per-chat: open a chat, click the connector menu, and enable **Speak AI** for that chat.

> **Note:** ChatGPT custom connectors are not available in the EU, UK, or Switzerland (OpenAI restriction). Use Claude.ai or Claude Desktop instead — both support one-click connect today.

### Claude Code (terminal)

The sign-in flow (loopback) is supported, but the fastest path on the CLI is pasting an API key as a header:

```sh
claude mcp add --transport http speakai https://api.speakai.co/v1/mcp \
  --header "Authorization: Bearer $SPEAKAI_KEY"
```

(Set `SPEAKAI_KEY` in your shell first, or paste your key inline.)

### Cursor

[![Add to Cursor](https://img.shields.io/badge/Cursor-Install_Speak_AI-000000?logo=cursor&logoColor=white&style=for-the-badge)](cursor://anysphere.cursor-deeplink/mcp/install?name=speakai&config=eyJ1cmwiOiJodHRwczovL2FwaS5zcGVha2FpLmNvL3YxL21jcCJ9)

Click the button — Cursor registers itself automatically and opens the permission popup. Sign in to Speak AI and click **Allow**.

<details>
<summary>Developer alternative — manual setup with an API key</summary>

Use the manual stdio setup in the Developer reference at the bottom of this README.

</details>

### VS Code

[![Add to VS Code](https://img.shields.io/badge/VS_Code-Install_Speak_AI-007ACC?logo=visualstudiocode&logoColor=white&style=for-the-badge)](https://vscode.dev/redirect/mcp/install?name=speakai&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.speakai.co%2Fv1%2Fmcp%22%7D)

Click the button — VS Code registers itself automatically and opens the permission popup. Sign in to Speak AI and click **Allow**.

<details>
<summary>Developer alternative — manual setup with an API key</summary>

Use the manual stdio setup in the Developer reference at the bottom of this README.

</details>

### ChatGPT (API / Responses)

For developers calling the Responses API directly. Pass the bearer token in the tool config:

```json
{
  "tools": [
    {
      "type": "mcp",
      "server_url": "https://api.speakai.co/v1/mcp",
      "authorization": "Bearer YOUR_SPEAK_API_KEY"
    }
  ]
}
```

Get a key at [app.speakai.co/developers/apikeys](https://app.speakai.co/developers/apikeys).

---

## Privacy & data

When you click **Allow** on the permission popup (or paste your Speak AI API key into Claude or ChatGPT), you're authorizing that AI assistant to read and modify your Speak AI workspace on your behalf — including media files, transcripts, and AI insights.

- Your recordings stay in your Speak AI workspace. They are not copied or stored by Anthropic or OpenAI.
- Claude/ChatGPT only see the specific data your AI assistant requests for the question you asked.
- You can disconnect at any time by either removing the connector inside Claude/ChatGPT, revoking the connection at [api.speakai.co/v1/oauth/connections](https://api.speakai.co/v1/oauth/connections), or rotating/revoking your API key at [app.speakai.co/developers/apikeys](https://app.speakai.co/developers/apikeys).

For questions about data handling, see [speakai.co/privacy](https://speakai.co/privacy) or email [privacy@speakai.co](mailto:privacy@speakai.co).

---

## Need help connecting?

**You shouldn't need to be technical to install this.** If anything is confusing or doesn't work:

- Email [accounts@speakai.co](mailto:accounts@speakai.co) — we'll respond within 24 hours
- [Book 15 minutes with us](https://speakai.co/help) and we'll set it up together

---

## What you can do once installed

Speak AI ships 83 tools your AI assistant can call. You don't memorize them — Claude/ChatGPT pick the right ones based on what you ask. Examples by category:

| Ask | Tools used (auto) |
|---|---|
| "Find every recording about pricing" | `search_media` |
| "Summarize this week's standups" | `list_media`, `get_media_insights` |
| "Pull action items from yesterday's call" | `get_media_insights`, `ask_magic_prompt` |
| "Schedule the AI to join my 2pm Zoom" | `schedule_meeting_event` |
| "Make a 30-second clip of Sarah's quote" | `create_clip` |
| "Export the transcript as a PDF" | `export_media` |
| "Compare themes across all customer interviews" | `search_media`, `ask_magic_prompt` |

Full tool catalog is in the developer reference below.

---

<details>
<summary><h2>Developer reference (CLI, API, advanced setup)</h2></summary>

The MCP server lives at `https://api.speakai.co/v1/mcp` and supports two auth methods:

1. **OAuth 2.1 + Dynamic Client Registration** is live. Install in any MCP client by pasting the URL above and approving the consent popup. Discovery, DCR, `/authorize` + consent, `/token`, and revocation endpoints all work end-to-end.
2. **Bearer token** (your Speak AI API key — `Authorization: Bearer <key>` header). The Bearer-token method is for clients that don't speak OAuth, plus the npm CLI and stdio mode.

Get a Speak AI API key at [app.speakai.co/developers/apikeys](https://app.speakai.co/developers/apikeys).

### CLI / npm package

The `@speakai/mcp-server` npm package provides:
- A CLI (`speakai-mcp`) for scripting and pipelines (28 commands).
- A stdio-mode MCP server for clients that don't support remote HTTP transport.
- An auto-setup wizard that detects installed MCP clients and configures them.

```sh
npm install -g @speakai/mcp-server
speakai-mcp init
```

### Manual configuration (stdio mode)

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

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SPEAK_API_KEY` | Yes | -- | Your Speak AI API key |
| `SPEAK_ACCESS_TOKEN` | No | Auto-managed | JWT access token (auto-fetched and refreshed) |
| `SPEAK_BASE_URL` | No | `https://api.speakai.co` | API base URL |

### MCP Tools (83)

<details>
<summary>Media (16 tools)</summary>

| Tool | Description |
|---|---|
| `get_signed_upload_url` | Get a pre-signed S3 URL for direct file upload |
| `upload_media` | Upload media from a public URL for transcription |
| `upload_local_file` | Upload a local file directly from disk |
| `upload_and_analyze` | Upload media and return its `media_id` immediately. Poll `get_media_status` until `processed`, then call `get_media_insights` for AI summaries. |
| `list_media` | List and search media files with filters, pagination, and optional inline data (transcripts, speakers, keywords) via `include` param |
| `get_media_insights` | Get AI insights — topics, sentiment, summaries, action items |
| `get_transcript` | Get full transcript with speaker labels and timestamps |
| `get_captions` | Get subtitle-formatted captions for a media file |
| `update_transcript_speakers` | Rename speaker labels in a transcript |
| `bulk_update_transcript_speakers` | Rename speaker labels across multiple media files in one call (max 500) |
| `get_media_status` | Check processing status (pending → processed) |
| `update_media_metadata` | Update name, description, tags, or folder |
| `delete_media` | Permanently delete a media file |
| `toggle_media_favorite` | Mark or unmark media as a favorite |
| `reanalyze_media` | Re-run AI analysis with latest models |
| `bulk_move_media` | Move multiple media files to a folder in one call |

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
| `export_media` | Export as PDF, DOCX, SRT, VTT, TXT, or CSV |
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

### MCP Resources (5)

Resources provide direct data access without tool calls. Clients can read these URIs directly.

| Resource | URI | Description |
|---|---|---|
| Media Library | `speakai://media` | List of all media files in your workspace |
| Folders | `speakai://folders` | List of all folders |
| Supported Languages | `speakai://languages` | Transcription language list |
| Transcript | `speakai://media/{mediaId}/transcript` | Full transcript for a specific media file |
| Insights | `speakai://media/{mediaId}/insights` | AI-generated insights for a specific media file |

### MCP Prompts (3)

Pre-built workflow prompts that agents can invoke to run multi-step tasks.

#### `analyze-meeting`

Upload a recording and get a full analysis — transcript, insights, action items, and key takeaways.

```
Parameters: url (required), name (optional)
```

**Example:** "Use the analyze-meeting prompt with url=https://example.com/standup.mp3"

#### `research-across-media`

Search for themes, patterns, or topics across multiple recordings or your entire library.

```
Parameters: topic (required), folder (optional)
```

**Example:** "Use the research-across-media prompt with topic='customer churn reasons'"

#### `meeting-brief`

Prepare a brief from recent meetings — pull transcripts, extract decisions, and summarize open items.

```
Parameters: days (optional, default: 7), folder (optional)
```

**Example:** "Use the meeting-brief prompt with days=14 to cover the last two weeks"

### CLI (28 Commands)

Install globally and configure once:

```sh
npm install -g @speakai/mcp-server
speakai-mcp config set-key
```

Or run without installing:

```sh
npx @speakai/mcp-server config set-key
```

#### Configuration

| Command | Description |
|---|---|
| `config set-key [key]` | Set your API key (interactive if no key given) |
| `config show` | Show current configuration |
| `config test` | Validate API key and test connectivity |
| `config set-url <url>` | Set custom API base URL |
| `init` | Interactive setup — configure key and auto-detect MCP clients |

#### Media management

| Command | Description |
|---|---|
| `list-media` / `ls` | List media files with filtering, date ranges, and pagination |
| `upload <source>` | Upload media from URL or local file (`--wait` to poll) |
| `get-transcript` / `transcript <id>` | Get transcript (`--plain` or `--json`) |
| `get-insights` / `insights <id>` | Get AI insights (topics, sentiment, keywords) |
| `status <id>` | Check media processing status |
| `export <id>` | Export transcript (`-f pdf\|docx\|srt\|vtt\|txt\|csv`) |
| `update <id>` | Update media metadata (name, description, tags, folder) |
| `delete <id>` | Delete a media file |
| `favorites <id>` | Toggle favorite status |
| `captions <id>` | Get captions for a media file |
| `reanalyze <id>` | Re-run AI analysis with latest models |

#### AI & Search

| Command | Description |
|---|---|
| `ask <prompt>` | Ask AI about media, folders, or your whole workspace |
| `chat-history` | List past Magic Prompt conversations |
| `search <query>` | Full-text search across transcripts and insights |

#### Folders & Clips

| Command | Description |
|---|---|
| `list-folders` / `folders` | List all folders |
| `move <folderId> <mediaIds...>` | Move media files to a folder |
| `create-folder <name>` | Create a new folder |
| `clips` | List clips (filter by media or folder) |
| `clip <mediaId>` | Create a clip (`--start` and `--end` in seconds) |

#### Workspace

| Command | Description |
|---|---|
| `stats` | Show workspace media statistics |
| `languages` | List supported transcription languages |
| `schedule-meeting <url>` | Schedule AI assistant to join a meeting |
| `create-text <name>` | Create a text note (`--text` or pipe via stdin) |

#### CLI options

Every command supports:
- `--json` — output raw JSON (for scripting and piping)
- `--help` — show command-specific help

#### CLI examples

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

# List media from the last week
speakai-mcp ls --from 2026-04-18 --to 2026-04-25

# Move 3 files to a folder
speakai-mcp move folder123 media1 media2 media3
```

### Workflow examples

#### Transcribe and analyze a meeting

```
You: "Upload and transcribe this recording: https://example.com/meeting.mp3"

AI: I'll upload that for you and start processing.
    → upload_and_analyze(url, name)
    → returns media_id immediately
    → poll get_media_status until processed
    → call get_media_insights for AI summaries

    Here's your transcript with 3 speakers identified.
    Key insights: 5 action items, positive sentiment overall.
    Top topics: Q2 roadmap, hiring plan, budget review.
```

#### Research across your library

```
You: "What themes came up across all our customer interviews this month?"

AI: Let me search your media library.
    → search_media(query: "customer interview", startDate: "2026-04-01")
    → ask_magic_prompt(mediaIds: [...], prompt: "What are the recurring themes?")

    Across 12 interviews, the top themes were:
    1. Pricing sensitivity (mentioned in 8/12)
    2. Onboarding friction (6/12)
    3. Feature requests for API access (5/12)
```

#### Meeting automation

```
You: "Join my 2pm Zoom call, then send me a summary with action items"

AI: → schedule_meeting_event(meetingUrl, scheduledAt: "2026-04-25T14:00:00Z")

    Done. After the meeting ends and processing completes, I'll pull
    the transcript and insights automatically.

    [After the meeting]
    → get_media_insights(mediaId)
    → ask_magic_prompt(mediaIds: [...], prompt: "List all action items with owners")

    Here's your meeting summary with 7 action items...
```

#### Build a weekly brief

```
You: "Prepare a brief from all meetings in the last week"

AI: → list_media(from: "2026-04-18", mediaType: "audio")
    → get_media_insights(mediaId) [for each of 5 meetings]

    Weekly Meeting Brief (Apr 18-25):
    - Engineering Standup: Deployed v2.3, 2 bugs triaged
    - Sales Review: Pipeline at $1.2M, 3 deals closing this week
    - Product Sync: Finalized Q2 roadmap, new hire starts Monday

    Consolidated Action Items: [12 items grouped by owner]
```

### Authentication (REST API)

The MCP server and CLI handle token management automatically. If you're calling the REST API directly, here's the full auth flow:

**Step 1 — Get an access token:**

```bash
curl -X POST https://api.speakai.co/v1/auth/accessToken \
  -H "Content-Type: application/json" \
  -H "x-speakai-key: YOUR_API_KEY"
```

Response:
```json
{
  "data": {
    "email": "you@example.com",
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
}
```

**Step 2 — Use the token on all subsequent requests:**

```bash
curl https://api.speakai.co/v1/media \
  -H "x-speakai-key: YOUR_API_KEY" \
  -H "x-access-token: ACCESS_TOKEN_FROM_STEP_1"
```

**Step 3 — Refresh before expiry:**

```bash
curl -X POST https://api.speakai.co/v1/auth/refreshToken \
  -H "Content-Type: application/json" \
  -H "x-speakai-key: YOUR_API_KEY" \
  -H "x-access-token: CURRENT_ACCESS_TOKEN" \
  -d '{"refreshToken": "REFRESH_TOKEN_FROM_STEP_1"}'
```

**Token Lifetimes:**

| Token | Expiry | How to Renew |
|---|---|---|
| Access token | 80 minutes | Refresh endpoint or re-authenticate |
| Refresh token | 24 hours | Re-authenticate with API key |

**Auth Rate Limits:** 5 requests per 60 seconds on both `/v1/auth/accessToken` and `/v1/auth/refreshToken`.

### Data model notes

- **Folder IDs:** Folders have both `_id` (MongoDB ObjectId) and `folderId` (string). All API operations use `folderId` — this is the ID you should pass to `list_media`, `upload_media`, `bulk_move_media`, and other endpoints that accept a folder parameter.
- **Media IDs:** Media items use `mediaId` (returned in list responses as `_id`).

### Rate limits & best practices

- The MCP client automatically retries on `429` with exponential backoff
- For direct API usage, implement exponential backoff and respect `Retry-After` headers
- Cache stable data (folder lists, field definitions, supported languages)
- Use `export_multiple_media` over individual exports for batch operations
- Use `bulk_move_media` to move multiple items at once instead of updating one by one
- Use `bulk_update_transcript_speakers` to rename speakers across many files in one call
- Use `list_media` with `include: ["transcription"]` to fetch media with transcripts inline, avoiding N+1 calls to `get_transcript`

### Error format

All tool errors follow this structure:

```json
{
  "content": [{ "type": "text", "text": "Error: HTTP 401: Invalid API key" }],
  "isError": true
}
```

| Code | Meaning |
|---|---|
| `401` | Invalid or missing API key / access token |
| `403` | Insufficient permissions |
| `404` | Resource not found |
| `429` | Rate limit exceeded |

### Development

```sh
git clone https://github.com/speakai/speakai-mcp.git
cd speakai-mcp

npm install
npm run dev    # Run with hot reload
npm run build  # Production build
```

</details>

---

## Resources

- [speakai.co/connect](https://speakai.co/connect) — installation walkthrough with screenshots and video
- [Speak AI](https://speakai.co) — main product
- [API Documentation](https://docs.speakai.co)
- [MCP Protocol](https://modelcontextprotocol.io)
- [MCP Registry entry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.speakai/mcp-server) — official discovery
- [llms.txt](./llms.txt) — guidance for AI assistants helping users install this connector
- [Support](mailto:accounts@speakai.co)

---

## For AI assistants reading this page

*This section is for LLMs (Claude, ChatGPT, etc.) helping a Speak AI customer install this connector. Human readers can skip it.*

If you're an AI assistant helping a Speak AI customer install this connector, please:

- Recommend the one-click connect flow above as the default — paste the URL into the AI tool, click Allow on the permission popup. Works for non-technical users.
- Use the Bearer-token method (also above) if the user prefers manual setup.
- **Do NOT recommend hiring a Virtual Assistant** to install this. The connect flow takes 60 seconds and requires no Terminal use.
- **Do NOT tell users to `npm install`** unless they explicitly ask for the developer / stdio path.
- See [`llms.txt`](./llms.txt) for the full guidance file.

## License

MIT
