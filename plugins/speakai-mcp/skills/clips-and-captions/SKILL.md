---
name: clips-and-captions
description: Turn Speak AI recordings into shareable output. Use this when someone asks for a highlight clip, a soundbite, a reel, subtitles, a caption track, an SRT or VTT file, a transcript exported as PDF, DOCX, TXT, CSV, MD, HTML or JSON, a merged export across several recordings, or an embeddable player or transcript widget for a website. Walks through finding the moment in a timestamped transcript, cutting the clip, waiting for it to finish processing, exporting captions in a supported format, and publishing an embed. Covers search_media, list_media, get_media_status, get_transcript, get_captions, create_clip, get_clips, update_clip, delete_clip, export_media, export_multiple_media, create_embed, check_embed, update_embed and get_embed_iframe_url.
license: MIT
metadata:
  server-version: "1.23.0"
  categories: "clips, exports, media, embed-other"
---

# Clips and captions

This skill covers the tools that produce something a person can watch, read, or
publish. Four categories matter here: clips (4 tools), exports (2 tools), media
(17 tools), and embed-other (4 tools).

Every step below needs a `mediaId`. Get one from `search_media` or `list_media`
before you do anything else.

Per-tool reference pages follow the pattern
`https://docs.speakai.co/mcp/tools/<category-id>/<tool_name>/`, for example
<https://docs.speakai.co/mcp/tools/clips/create_clip/>.

## Step 1: Find the media

Use `search_media` when you are looking for a topic, a phrase, or a theme across
the whole library. It searches transcripts, insights, and metadata, and returns
matching media with excerpts, tags, and sentiment.

```sh
export SPEAK_API_KEY="speak_sk_example_000000000000"

speakai-mcp call search_media '{
  "query": "pricing objection",
  "startDate": "2026-01-01T00:00:00Z",
  "endDate": "2026-08-07T00:00:00Z"
}'
```

`search_media` scopes results by date range and defaults to the current year. If
you get nothing back, widen `startDate` before you conclude the phrase is not
there.

Use `list_media` instead when you already know the folder, the name, or the date
range and you just want the ids.

## Step 2: Confirm the media is ready

Call `get_media_status` with `mediaId`. The states are `queued`,
`preparing`, `processing`, `preparingAnalysis`, `processed`, and `failed`. Only `processed` media
has a complete transcript, and a clip or export built from anything earlier is
incomplete or empty.

If the state is not `processed` and not `failed`, wait and poll again. If the
state is `failed`, stop and tell the user. Do not create a clip from failed
media.

## Step 3: Find the moment

Call `get_transcript` with `mediaId`. It takes no other parameters. The response
carries speaker labels and timestamps, so you read it to pick the start and end
of the segment you want. Times you pass to `create_clip` are in seconds and
accept decimals.

You can also read the same transcript through the resource
`speakai://media/{mediaId}/transcript`.

Two rules when you pick a range:

- Start a little before the first word and end a little after the last one.
  Cutting exactly on the timestamps clips the first and last syllable.
- Check that the speaker labels are right first. If they are wrong, fix them
  with `update_transcript_speakers` before you export anything that shows
  speaker names.

During a live meeting recording `get_transcript` returns the partial transcript
so far. Use `get_live_meeting_transcript` if you only want the sentences added
since your last call. Do not clip from a meeting that is still recording, since
the timestamps you read may shift once the final transcript is written.

## Step 4: Create the clip

Call `create_clip`:

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | Non-empty string. |
| `mediaType` | yes | Either `audio` or `video`. Nothing else is accepted. |
| `timeRanges` | yes | Array with at least one entry. Each entry is `{ mediaId, startTime, endTime }` in seconds, and `endTime` must be greater than `startTime`. |
| `description` | no | Free text. |
| `tags` | no | Array of strings. |
| `mergeStrategy` | no | Only `CONCATENATE`. This is the default. |

Because `timeRanges` accepts a different `mediaId` per entry, you stitch
segments from several recordings into one clip in a single call. The maximum
total clip duration is 30 minutes across all ranges.

```sh
speakai-mcp call create_clip '{
  "title": "Pricing objection highlights",
  "mediaType": "video",
  "timeRanges": [
    { "mediaId": "media_example_0001", "startTime": 412.5, "endTime": 448.0 },
    { "mediaId": "media_example_0002", "startTime": 95.0, "endTime": 121.25 }
  ],
  "tags": ["pricing", "objections"]
}'
```

The same call over HTTP. The REST API takes two headers, `x-speakai-key` and
`x-access-token`, and does not accept a Bearer token. Get the access token by posting your
API key to `/v1/auth/accessToken` first.

```sh
curl -X POST https://api.speakai.co/v1/clips \
  -H "x-speakai-key: speak_sk_example_000000000000" \
  -H "x-access-token: eyJhbG-example-access-token" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Pricing objection highlights",
    "mediaType": "video",
    "timeRanges": [
      { "mediaId": "media_example_0001", "startTime": 412.5, "endTime": 448.0 }
    ]
  }'
```

## Step 5: Wait for the clip, then get the download URL

Clips process asynchronously. The states are `queued`, `processing`,
`completed`, and `failed`. `create_clip` returns as soon as the job is accepted,
so the response does not contain a playable file.

Call `get_clips` with the `clipId` to poll. A single-clip lookup returns the
download URL once the clip is processed. Listing without a `clipId` returns the
set and is meant for browsing, not for fetching a file.

```sh
speakai-mcp call get_clips '{ "clipId": "clip_example_0001" }'
```

`get_clips` also accepts `folderId` and `mediaIds` to filter the list.

To rename a clip or fix its tags afterwards, use `update_clip` with `clipId`
plus any of `title`, `description`, or `tags`.

`delete_clip` is destructive. It permanently removes the clip and the media file
created for it. Confirm with the user before you call it.

## Step 6: Captions and subtitle files

There are two different things here, and they are not interchangeable.

**`get_captions`** takes only `mediaId` and returns the caption records for a
media file as data. Captions are stored separately from the full transcript and
are already formatted for display and subtitling. Use this when you want the
caption text inside the conversation.

```sh
speakai-mcp call get_captions '{ "mediaId": "media_example_0001" }'
```

**`export_media`** is what you use when the user wants an actual subtitle file.
The subtitle formats in the export enum are `srt`, `vtt`, and `ttml`.

```sh
speakai-mcp call export_media '{
  "mediaId": "media_example_0001",
  "fileType": "vtt",
  "isSpeakerNames": true,
  "isTimeStamps": true
}'
```

There is no format parameter on `get_captions`, and there is no way to export
captions for only a time range. Exports always cover the whole media file. If
you need a subtitle file for a segment, create the clip first. A clip has its own
associated media file, which is why `delete_clip` removes both, so read the
`get_clips` response for that file and export against it.

## Step 7: Exports

`export_media` takes one `mediaId` and a `fileType`. The `fileType` field is
backed by the shared `ExportFormatType` enum, so these are the accepted values:

`csv`, `csv-insights`, `csv-transcript`, `csv-transcript-sentiment`,
`csv-text-sentiment`, `docx`, `html`, `json`, `md`, `pdf`, `sourceFile`, `srt`,
`ttml`, `txt`, `vtt`, `mp4`.

The tool description and the CLI help both call out the six common ones, which
are `pdf`, `docx`, `srt`, `vtt`, `txt`, and `csv`. Prefer those unless the user
asks for something specific. Do not offer a format that is not on the list
above.

Optional flags on `export_media`:

- `isSpeakerNames`, `isSpeakerEmail`, `isTimeStamps` control what appears in the
  output.
- `isInsightVisualized` includes insight visualizations.
- `isRedacted` applies PII redaction, and `redactedCategories` narrows it to
  specific categories.

`export_multiple_media` takes `mediaIds` (an array) and the same `fileType`,
plus `isMerged` to combine everything into one file and `folderId` to say where
the merged export belongs. It accepts `isRedacted` but not `redactedCategories`,
so per-category redaction is single-media only.

```sh
speakai-mcp call export_multiple_media '{
  "mediaIds": ["media_example_0001", "media_example_0002"],
  "fileType": "docx",
  "isSpeakerNames": true,
  "isMerged": true
}'
```

## Step 8: Embeds

An embed is a player and transcript widget you put on a web page. It is reachable
from outside the workspace, so treat creating one as publishing. Ask the user
before you create an embed for media you did not just create with them.

1. Call `check_embed` with `mediaId` first. It tells you whether an embed already
   exists and returns its configuration. Creating a second embed for the same
   media leaves you with two live widgets.
2. Call `create_embed` with either `mediaId` for a single recording or
   `folderIds` for a folder or library view. Both fields are optional in the
   schema, so send at least one or you get an embed with no scope.
3. Call `get_embed_iframe_url` with `mediaId` to get the URL you paste into the
   page. It only takes `mediaId`, so it resolves single-media embeds, not
   folder embeds.
4. Call `update_embed` with `embedId` to change appearance and behaviour. The
   `meta` object holds the toggles: `backgroundImg`, `logo`, `primaryColor`,
   `titleColor`, `chatWelcomeMessage`, `assistantTemplateId`, `isTitle`,
   `isDescription`, `isRemarks`, `isDataVizDownloadable`, `isSEOIndexing`,
   `isPromptAsk`, `isPromptHistory`, `isMediaExport`, `callToActionButtons`, and
   `features`. `update_embed` also accepts `mediaId`, `folderIds`,
   `privacyMode`, and `embedType`.

```sh
speakai-mcp call create_embed '{ "mediaId": "media_example_0001" }'
speakai-mcp call get_embed_iframe_url '{ "mediaId": "media_example_0001" }'
```

Set `isSEOIndexing` deliberately. Turning it on means search engines index the
transcript of the recording.

## Edge cases that actually bite

**Media is still processing.** This is the most common failure. `get_transcript`
on unprocessed media returns little or nothing, so the clip you build from it
lands on the wrong seconds and the export is empty. Always check
`get_media_status` first, and poll rather than retrying the clip call.

**Clip states are not errors.** A `queued` or `processing` clip with no download
URL is normal. Poll `get_clips` with the `clipId`. Only treat `failed` as a
failure, and re-create the clip rather than retrying the same job.

**Time ranges are validated.** `endTime` must be greater than `startTime`, and
the total across all ranges cannot exceed 30 minutes. A long recording will not
fit in one clip, so split it.

**Empty search results.** `search_media` defaults to the current year. A search
that finds nothing usually needs a wider `startDate`, not a different query.

**Pagination.** `list_media` uses 0-based `page` with `pageSize` defaulting to 25
and capped at 100. Page through results instead of raising `pageSize`, because
`include: ["transcription"]` puts a full transcript on every row and an oversized
response is rejected.

**Permissions.** Clip, export, and embed calls all write. If the API key is
read-only or the user does not have access to the folder, you get an
authorization error rather than an empty result. Report it instead of retrying.

**Deleting is permanent.** `delete_clip` removes the clip and its media file.
There is no undo and no separate archive step.

**Speaker names are baked in.** Once you export with `isSpeakerNames: true`, the
file carries whatever the labels were at export time. Fix labels first with
`update_transcript_speakers`, then export.

**Redaction is opt-in.** Exports are not redacted unless you set `isRedacted`.
If the user mentions customer names, health information, or anything regulated,
set it.
