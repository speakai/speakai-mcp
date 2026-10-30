---
name: research-analysis
description: Analyze interviews, user research calls, and customer conversations across many Speak AI recordings. Use this when you need themes across a set of calls, verbatim quotes with speaker names and timestamps, sentiment, or a comparison between two time periods, segments, or folders. Covers finding the right recordings with search_media and list_media, reading the transcripts and insights of a folder or of specific media ids and doing the analysis yourself, citing every claim, and pulling exact quotes out of transcripts. Triggers on requests like analyze these interviews, research synthesis, find the themes, what did customers say about pricing, pull quotes, compare Q1 and Q2 calls, sentiment across recordings, and code these interview transcripts.
license: MIT
metadata:
  server: "@speakai/mcp-server"
  server-version: "1.40.3"
  categories: "research"
---

# Research analysis across many recordings

The user's explicit instructions take priority over this skill. When they ask for something different from the steps below, do what they asked, and confirm with them before any action that deletes, overwrites, or sends data outside Speak AI.

You use this skill when someone asks a research question that spans more than one
recording. The work always follows the same shape. Find the right recordings, confirm
they are ready to read, scope the set, read it and do the analysis yourself, then check
the exact words against the transcripts so the answer is defensible.

The Speak AI MCP server has 189 tools. This skill uses tools from five of the fifteen
categories: search-analytics (3 tools), magic-prompt (13 tools), media (19 tools),
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
- **stdio mode and the CLI**: an API key configured on the user's machine, as described
  at <https://docs.speakai.co/mcp/authentication>. There is no header to set.
- **The REST API directly**: your API key on every call, in `x-speakai-key` or as
  `Authorization: Bearer <key>`. There is no access token to fetch.

You do not need raw REST for this skill, since the tools cover it. If you do call it
directly, authentication is documented at <https://docs.speakai.co/mcp/authentication>.

## Step 1. Find the right recordings

This is the step people skip, and it is the step that decides whether the answer is
right. Never analyze the whole workspace on the first pass. You will end up with an
average of everything, and you will not be able to say which calls each point came from.

### Which finder to use

| You know | Use | Why |
| --- | --- | --- |
| A topic, phrase, or theme, and you do not know which files contain it | `search_media` | Full text search across transcripts, insights, and metadata. Returns matching media with excerpts, sentiment, and tags. |
| A folder, a date range, a name pattern, or a media type | `list_media` | Structured listing with filters, sorting, and pagination. Cheaper and more predictable than search. |
| Nothing yet, and the user described a set in words | `list_folders` then `get_folder_info` | Research work is usually already organized into folders by study, quarter, or segment. |
| The set already, and you want an answer about it | `get_transcript`, `get_media_insights`, or `list_media` with `include` | This is the reading step, not the finding step. |

The important distinction: `search_media` and `list_media` return media ids. The analysis
comes after, from the transcripts and insights of exactly those ids. If you start reading
before you have fixed the set, you cannot say which recordings an answer covers. Find
first, then read.

Docs:
https://docs.speakai.co/mcp/tools/search-analytics/search_media/
https://docs.speakai.co/mcp/tools/media/list_media/

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

## Step 3. Scope the set

Decide which recordings the analysis covers before you read anything. Pick the narrowest
set that answers the question.

- Specific media ids. Use this when you found the set in step 1. This is the default
  choice for research work because you can name every source.
- A whole folder. Pass its `folderId` to `list_media` and page through. Use this when the
  folder is the study and the user wants everything in it.
- The entire workspace. Use this only when the user explicitly asks about everything,
  and say in your answer that the scope was the whole workspace.

Whatever the scope, keep the list of media ids you actually read. Being able to answer
"which calls is this from" is the point of the exercise.

If the study is not in a folder yet, create one with `create_folder` and move the files
with `bulk_move_media`. That turns an ad hoc set into something the user can re-run
later. Ask before you reorganize anything, since moving media changes what other people
see.

## Step 4. Read the set and do the analysis

Read the content of every recording in the set, then do the analysis yourself.

- `list_media` with the `folderId` or date range and `include: ["transcription"]` returns
  transcripts inline. Keep `pageSize` around 10 and page through, as described in step 1.
- `get_transcript` with a `mediaId` returns one transcript with speaker labels and
  timestamps. Use it when you only need a few files, or when a file was too large to come
  back inline.
- `get_media_insights` with a `mediaId` returns that file's topics, sentiment, keywords,
  action items, and summaries. It is a quick way to see what each recording is about
  before you read it closely.

Work through the question the user asked. For a theme analysis, for example: list the
recurring themes, count how many participants raised each one, and quote one verbatim
line per theme with the recording and speaker it came from. Leave out a theme that only
one participant raised unless the user wants those too.

Keep track of the source for every claim as you go: the recording name or media id, the
speaker, and the timestamp. Citations are much harder to recover afterwards.

When the set is too large to read in full, say so. Use `search_media` with a focused
`query` to find the passages that matter, read those recordings in full, and tell the
user which recordings you read and which you only saw through search excerpts or
insights.

Someone may already have run this analysis in Speak's AI Chat. `get_chat_messages`
accepts a `query` that searches text across past prompts and answers, and returns them
with their `references`. It paginates with `page` and `pageSize` (default 25, max 500).
Treat what you find there as a lead, and check it against the transcripts before you
repeat it.

Docs:
https://docs.speakai.co/mcp/tools/media/get_transcript/
https://docs.speakai.co/mcp/tools/media/get_media_insights/
https://docs.speakai.co/mcp/tools/magic-prompt/get_chat_messages/

## Step 5. Pull the exact quotes

Verification is a separate step and it uses different tools.

Before you present a quote, confirm it against the source.

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

**By date.** Build two sets with the same filters and different date ranges, using
`from` and `to` on `list_media` or `startDate` and `endDate` on `search_media`. Analyze
each set separately with the same questions, then compare the two results. Do not mix the
periods while you read, because you will lose track of which period a claim came from.

**By segment.** Keep each segment in its own folder and run the same analysis on each
`folderId`. Where segments are marked with tags instead of folders, filter with
`search_media` and `filterList` on `tags` and read the resulting media ids.

**By participant.** Go through the recordings one at a time and note an answer for each.
You get one answer per recording, which is what you need to count how many participants
said a thing rather than writing a summary that says "most".

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

- `create_folder_view` saves a column layout for a folder so the next person opens the
  study with the right fields visible. `get_folder_views` lists what already exists.
- `toggle_media_favorite` flags the key recordings so the team can find them again.

## Bringing in written feedback

Research is not only recordings. Survey free text, support tickets, and pasted notes
answer the same questions, and Speak AI treats them the same way once they are in.

`create_text_note` takes the text and stores it as media. `get_text_insight` returns the
same shape of analysis a recording gets: topics, sentiment, keywords, entities.
`reanalyze_text` regenerates that analysis after the content changes, and
`update_text_note` edits the note's name, content, or metadata.

Because a text note becomes media, it lands in the same folders, matches the same
`search_media` queries, and can be read and analyzed alongside the recordings. So a study can cover fifteen interviews and two hundred survey comments in one
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

**Scope drift across questions.** A follow up question often moves to a different set
of recordings. When the user changes the subject, go back to step 1 and fix the new set
before you answer, rather than reusing the media ids from the earlier question.

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
| `get_chat_messages` | magic-prompt | Search and read past AI Chat answers and their references |
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
