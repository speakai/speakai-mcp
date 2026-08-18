---
name: research-analysis
description: Analyze interviews, user research calls, and customer conversations across many Speak AI recordings. Use this when you need themes across a set of calls, verbatim quotes with speaker names and timestamps, sentiment, or a comparison between two time periods, segments, or folders. Covers finding the right recordings with search_media and list_media, scoping a question to a folder or to specific media ids with ask_ai_chat, asking for citations, and pulling exact quotes out of transcripts. Triggers on requests like analyze these interviews, research synthesis, find the themes, what did customers say about pricing, pull quotes, compare Q1 and Q2 calls, sentiment across recordings, and code these interview transcripts.
license: MIT
metadata:
  server: "@speakai/mcp-server"
  server-version: "1.21.1"
  categories: "research"
---

# Research analysis across many recordings

You use this skill when someone asks a research question that spans more than one
recording. The work always follows the same shape. Find the right recordings, confirm
they are ready to read, scope the question, ask it, then pull the exact words back out
of the transcripts so the answer is defensible.

The Speak AI MCP server has 117 tools. This skill uses tools from five of the fifteen
categories: search-analytics (3 tools), magic-prompt (13 tools), media (17 tools),
folders-views (11 tools), and custom-fields (4 tools). Every tool named below exists.
Do not invent tool names. If you need something that is not listed here, check
`tools.json` in the repository before you call anything.

## Connection

The remote endpoint is `https://api.speakai.co/v1/mcp`, transport type
`streamable-http`, with OAuth 2.1 and Dynamic Client Registration. The user approves
once and you never handle a key.

There are three ways to authenticate and they are not interchangeable. Keys come from
https://app.speakai.co/developers/apikeys.

- **Remote MCP endpoint**, `https://api.speakai.co/v1/mcp`: OAuth, or
  `Authorization: Bearer <speak-api-key>`.
- **stdio mode and the CLI**: the `SPEAK_API_KEY` environment variable only. There is no
  header to set.
- **The REST API directly**: two headers on every call, `x-speakai-key` and
  `x-access-token`. It does not accept Bearer. You exchange your key for the access token
  first.

You do not need raw REST for this skill, since the tools cover it. If you do call it
directly, the exchange looks like this:

```sh
export SPEAK_API_KEY="speak_sk_example_000000000000"

# Step 1: exchange the API key for an access token.
curl -s -X POST https://api.speakai.co/v1/auth/accessToken \
  -H "Content-Type: application/json" \
  -H "x-speakai-key: $SPEAK_API_KEY"

# Step 2: send both headers on the real call.
curl -s https://api.speakai.co/v1/analytics/search \
  -H "Content-Type: application/json" \
  -H "x-speakai-key: $SPEAK_API_KEY" \
  -H "x-access-token: eyJhbG-example-access-token" \
  -d '{"query":"onboarding friction","startDate":"2026-01-01T00:00:00.000Z","endDate":"2026-06-30T23:59:59.000Z"}'
```

## Step 1. Find the right recordings

This is the step people skip, and it is the step that decides whether the answer is
right. Never ask a research question across the whole workspace on the first call. You
will get an average of everything, and you will not be able to say which calls it came
from.

### Which finder to use

| You know | Use | Why |
| --- | --- | --- |
| A topic, phrase, or theme, and you do not know which files contain it | `search_media` | Full text search across transcripts, insights, and metadata. Returns matching media with excerpts, sentiment, and tags. |
| A folder, a date range, a name pattern, or a media type | `list_media` | Structured listing with filters, sorting, and pagination. Cheaper and more predictable than search. |
| Nothing yet, and the user described a set in words | `list_folders` then `get_folder_info` | Research work is usually already organized into folders by study, quarter, or segment. |
| The set already, and you want an answer about it | `ask_ai_chat` | This is the analysis step, not the finding step. |

The important distinction: `search_media` and `list_media` return media ids. `ask_ai_chat`
returns prose. If you call `ask_ai_chat` first, you are asking a model to both pick the
evidence and interpret it, and you cannot audit either half. Find first, then ask.

Docs:
https://docs.speakai.co/mcp/tools/search-analytics/search_media/
https://docs.speakai.co/mcp/tools/media/list_media/
https://docs.speakai.co/mcp/tools/magic-prompt/ask_ai_chat/

### Using search_media

Inputs: `query` (required), `startDate`, `endDate`, and `filterList`.

```json
{
  "query": "pricing objection",
  "startDate": "2026-01-01T00:00:00.000Z",
  "endDate": "2026-06-30T23:59:59.000Z",
  "filterList": [
    {
      "fieldName": "tags",
      "fieldOperator": "include",
      "fieldValue": ["enterprise"],
      "fieldCondition": "and"
    }
  ]
}
```

`fieldName` accepts `category`, `folderId`, `mediaId`, `mediaType`,
`sentimentNegative`, `sentimentPositive`, `speaker`, `tags`, `recorderId`, and
`fields`. `fieldOperator` accepts `include`, `notInclude`, `contain`, `notContain`,
`greaterThan`, and `lessThan`. `fieldCondition` is `and` or `or`.

The date range matters more than it looks. If you leave `startDate` and `endDate` out,
the search covers the current calendar year only. A study that ran last autumn will
return nothing and the empty result will look like a real answer. Always set the range
explicitly when the user mentions any period, and widen it before you report that
nothing was found.

### Using list_media

Inputs you will actually use: `folderId`, `filterName`, `mediaType`, `from`, `to`,
`sortBy`, `page`, `pageSize`, `isFavorites`, and `include`.

```json
{
  "folderId": "fld_example_q2_interviews",
  "from": "2026-04-01T00:00:00.000Z",
  "to": "2026-06-30T23:59:59.000Z",
  "sortBy": "createdAt:desc",
  "pageSize": 50,
  "include": ["speakers", "keywords", "sentiment"]
}
```

`include` embeds extra data inline so you avoid one call per file. It accepts
`transcription`, `keywords`, `speakers`, `sentiment`, `custom`, and `fields`.

Do not combine `include: ["transcription"]` with a large `pageSize`. Every result then
carries a full transcript and an oversized response is rejected outright, so you lose
the whole page instead of one file. Keep `pageSize` around 10 when you pull
transcripts inline, and page through.

## Step 2. Confirm the recordings are readable

Call `get_media_status` for anything you plan to quote or analyze. The states run
queued, then preparing, then processing, then preparingAnalysis, then processed, or failed.

Only `processed` media has insights. `get_media_insights` needs the processed state.
`get_transcript` is more forgiving: it works on processed media and also returns the
partial in progress transcript while a meeting bot is still recording.

If a file is still processing, do not treat it as absent and do not silently drop it.
Tell the user which files are not ready, run the analysis on the ones that are, and say
so in the answer. A synthesis over 11 of 14 interviews is useful. A synthesis that
quietly claims to cover 14 is not.

Docs:
https://docs.speakai.co/mcp/tools/media/get_media_status/
https://docs.speakai.co/mcp/tools/media/get_media_insights/
https://docs.speakai.co/mcp/tools/media/get_transcript/

## Step 3. Scope the question

`ask_ai_chat` accepts three levels of scope. Pick the narrowest one that answers the
question.

- `mediaIds`: an array of specific files. Use this when you found the set in step 1.
  This is the default choice for research work because you can name every source.
- `folderIds` (array) or `folderId` (single): the whole folder. Use this when the folder
  is the study and the user wants everything in it, including files added after you
  looked. Cheaper than listing, but you cannot enumerate what it read.
- Neither: the entire workspace. Use this only when the user explicitly asks about
  everything, and say in your answer that the scope was the whole workspace.

Folder scope is the right call for a standing study where recordings keep arriving.
Media id scope is the right call for a one time synthesis you will have to defend. When
in doubt, list the media ids. Being able to answer "which calls is this from" is worth
the extra call.

If the study is not in a folder yet, create one with `create_folder` and move the files
with `bulk_move_media`. That turns an ad hoc set into something the user can re-run
later. Ask before you reorganize anything, since moving media changes what other people
see.

## Step 4. Ask the question and ask for citations

```json
{
  "prompt": "List the recurring themes about onboarding across these interviews. For each theme, give the number of participants who raised it, then quote one verbatim line per theme and name the recording and the speaker it came from. Do not include a theme that only one participant raised.",
  "mediaIds": ["med_example_0001", "med_example_0002", "med_example_0003"],
  "assistantType": "researcher"
}
```

Things worth setting:

- `assistantType`. Options are `general` (the default), `researcher`, `marketer`,
  `sales`, `recruiter`, and `custom`. Use `researcher` for interview and study work.
  With `custom` you must also pass `assistantTemplateId`, and you get template ids from
  `list_prompts`.
- `promptId`. The response returns one. Pass it back on the next call to keep the
  conversation in context. Follow up questions that lose context produce answers that
  contradict the first one.
- `isIndividualPrompt`. When true, each media file is processed separately instead of
  being combined into one context. This is how you get per participant answers you can
  count, rather than one blended summary.
- `startDate` and `endDate`, `tags`, and `speakers`. These narrow the media inside the
  scope you already set.
- `fieldId` or `fieldIds` (max 10) to scope the prompt to specific custom fields.

Citations are something you have to request. Put the requirement in the `prompt` text,
as in the example above: name the recording, name the speaker, quote the line. Then
verify it in step 5. Do not pass a model claim through to the user as a quote without
checking it against the transcript.

To read the stored answer with its `references` and metadata, call `get_chat_messages`
with the `promptId`. It also paginates with `page` and `pageSize` (default 25, max 500),
and it accepts a `query` for searching text across past prompts and answers, which is a
fast way to find analysis somebody already ran.

If a call comes back failed or truncated, use `retry_ai_chat` with the `promptId` and
the `messageId` rather than re-asking from scratch. Re-asking creates a second
conversation and loses the thread.

Docs:
https://docs.speakai.co/mcp/tools/magic-prompt/get_chat_messages/
https://docs.speakai.co/mcp/tools/magic-prompt/list_prompts/
https://docs.speakai.co/mcp/tools/magic-prompt/retry_ai_chat/

## Step 5. Pull the exact quotes

Verification is a separate step and it uses different tools.

1. `get_transcript` with a `mediaId` returns the full transcript with speaker labels and
   timestamps. This is the source of truth for a verbatim quote.
2. `get_media_insights` with a `mediaId` returns the generated topics, sentiment,
   keywords, action items, and summaries for one file. Use it for per file sentiment and
   for keyword counts that you want to compare across files.
3. `get_captions` returns subtitle formatted output. Use it only when the user wants
   captions or a clip label, not for reading.

Check that the quoted words appear in the transcript before you present them. If a
quoted line is not in the transcript, drop it and say the claim could not be verified.

Speaker labels are the usual reason a quote looks wrong. A transcript may say
"Speaker 0" rather than a name. Call `get_transcript` first to read the current labels,
then `update_transcript_speakers` for one file, or `bulk_update_transcript_speakers` to
apply one mapping across several files at once. Two cautions. The speaker id is the
current label, not a fixed identifier, so ids you captured in an earlier turn can be
stale. Renaming a speaker to a name another speaker already holds is refused as a
collision.

Docs:
https://docs.speakai.co/mcp/tools/media/update_transcript_speakers/
https://docs.speakai.co/mcp/tools/media/bulk_update_transcript_speakers/

## Step 6. Compare across time or segment

There are three usable comparison patterns. Pick one and stay in it.

**By date.** Run the same `prompt` twice with the same scope and different `startDate`
and `endDate` values, then compare the two answers yourself. Do not ask a single call to
compare two periods, because you cannot tell which period a given claim came from.

**By segment.** Keep each segment in its own folder and run the same prompt against each
`folderId`. Where segments are marked with tags instead of folders, pass `tags` to
`ask_ai_chat`, or filter with `search_media` and `filterList` on `tags` and feed the
resulting media ids in.

**By participant.** Set `isIndividualPrompt` to true so each file is answered separately.
You get one answer per recording, which is what you need to count how many participants
said a thing rather than trusting a summary that says "most".

Custom fields make segment comparisons repeatable. `list_fields` shows what already
exists. `create_field` adds one, and a field can carry a `prompt` that populates it
automatically. `update_multiple_fields` sets values across a whole folder or a list of
media ids in one call, so you can label a cohort once and filter on it forever after.
Reuse an existing field before you create a new one, since duplicate fields with slightly
different names make every later comparison ambiguous.

```json
{
  "folderId": "fld_example_q2_interviews",
  "fields": [
    { "id": "fld_field_example_segment", "value": "enterprise" }
  ]
}
```

Docs:
https://docs.speakai.co/mcp/tools/custom-fields/list_fields/
https://docs.speakai.co/mcp/tools/custom-fields/update_multiple_fields/
https://docs.speakai.co/mcp/tools/folders-views/list_folders/
https://docs.speakai.co/mcp/tools/folders-views/get_folder_info/

## Step 7. Save what is worth keeping

- `toggle_prompt_favorite` marks an answer so the team can find it again.
  `get_favorite_prompts` reads them back.
- `update_chat_title` gives the conversation a name you can find in
  `get_chat_history`.
- `export_chat_answer` writes one answer out as `txt`, `docx`, `pdf`, or `md`. It needs
  both `promptId` and `messageId`.
- `create_folder_view` saves a column layout for a folder so the next person opens the
  study with the right fields visible. `get_folder_views` lists what already exists.

## Bringing in written feedback

Research is not only recordings. Survey free text, support tickets, and pasted notes
answer the same questions, and Speak AI treats them the same way once they are in.

`create_text_note` takes the text and stores it as media. `get_text_insight` returns the
same shape of analysis a recording gets: topics, sentiment, keywords, entities.
`reanalyze_text` regenerates that analysis after the content changes, and
`update_text_note` edits the note's name, content, or metadata.

Because a text note becomes media, it lands in the same folders, matches the same
`search_media` queries, and can be scoped into the same `ask_ai_chat` question as the
recordings. So a study can cover fifteen interviews and two hundred survey comments in one
answer rather than two disconnected ones.

Analyze the note before asking about it. A note that has not finished analyzing returns
empty insights, the same as a recording.

## Edge cases that actually bite

**Media still processing.** Insights are missing until the state is `processed`. Check
`get_media_status` before you analyze, name the files you skipped, and never present a
partial set as complete.

**Empty results that are not really empty.** `search_media` defaults to the current
calendar year. This is the single most common cause of a false negative. Widen the date
range and retry before you tell anyone there is nothing. Also try `list_media` with
`filterName`, since a term that appears only in a file name will not always surface the
way you expect through full text search.

**Oversized responses.** `list_media` with `include: ["transcription"]` and a large
`pageSize` gets rejected as a whole. Reduce `pageSize`, or drop `transcription` from
`include` and fetch transcripts one at a time with `get_transcript` for the files you
actually quote.

**Pagination.** `list_media` uses zero based `page` with `pageSize` up to 100.
`get_chat_messages` uses zero based `page` with `pageSize` up to 500. `list_folders`
allows up to 500 per page. `search_media` has no page parameter, so narrow it with
`filterList` and the date range instead of expecting to page through it. Never conclude
"there are only N interviews" from a single unpaged call.

**Permissions.** Everything runs as the connected account, so you only see media that
account can reach. An access error is not a transient failure. Do not retry it in a
loop. Report which item was refused and let the user fix access.

**Stale speaker ids.** A speaker id is the current label. If you renamed speakers, or
someone else did, re-read with `get_transcript` before the next rename. A rename that
already succeeded is a safe no-op, so do not retry a call that reported success.

**Sentiment as a headline number.** Per file sentiment from `get_media_insights` is a
signal about one recording. Averaging it across a study and reporting a single number
hides the split that the user is asking about. Report the range and the outliers, and
name the recordings at each end.

**Scope drift in a conversation.** `ask_ai_chat` keeps context when you pass `promptId`,
which is what you want for follow ups. It also means a later question inherits the
earlier scope. When the user changes the subject to a different set of recordings, start
a new conversation rather than passing the old `promptId`.

## Tool reference

| Tool | Category | Use |
| --- | --- | --- |
| `search_media` | search-analytics | Full text search across transcripts, insights, metadata |
| `get_media_statistics` | search-analytics | Workspace level counts and processing status breakdown |
| `list_media` | media | Filtered, sorted, paginated listing, with optional inline data |
| `get_media_status` | media | Processing state before you analyze or quote |
| `get_transcript` | media | Verbatim text with speaker labels and timestamps |
| `get_media_insights` | media | Topics, sentiment, keywords, action items, summaries |
| `get_captions` | media | Subtitle formatted output |
| `update_transcript_speakers` | media | Rename speakers in one file |
| `bulk_update_transcript_speakers` | media | Apply one speaker mapping across files |
| `bulk_move_media` | media | Move a found set into a study folder |
| `toggle_media_favorite` | media | Flag key recordings |
| `ask_ai_chat` | magic-prompt | The analysis call, scoped by media, folder, or workspace |
| `retry_ai_chat` | magic-prompt | Recover a failed or truncated answer |
| `get_chat_messages` | magic-prompt | Read answers, references, and metadata, with pagination |
| `get_chat_history` | magic-prompt | Find recent conversations and their promptIds |
| `list_prompts` | magic-prompt | Template ids for `assistantType: "custom"` |
| `toggle_prompt_favorite` | magic-prompt | Keep an answer |
| `get_favorite_prompts` | magic-prompt | Read kept answers back |
| `update_chat_title` | magic-prompt | Name a conversation |
| `export_chat_answer` | magic-prompt | Export one answer as txt, docx, pdf, or md |
| `list_folders` | folders-views | Discover studies and segments |
| `get_folder_info` | folders-views | Folder detail and contents |
| `create_folder` | folders-views | Make a study folder |
| `create_folder_view` | folders-views | Save a column layout for the study |
| `get_folder_views` | folders-views | List saved views for a folder |
| `list_fields` | custom-fields | See existing segment and coding fields |
| `create_field` | custom-fields | Add a field, optionally auto populated by a prompt |
| `update_multiple_fields` | custom-fields | Set field values across a folder or media list |

Per tool documentation follows the pattern
`https://docs.speakai.co/mcp/tools/<category-id>/<tool_name>/`.
