---
name: social-url-import
description: Import public social and video links into Speak AI and read the results. Use this when someone pastes a YouTube, TikTok, Instagram, X, Facebook, Reddit, SoundCloud, Twitch, Dailymotion, Streamable, Snapchat, Pinterest, Tumblr, Bilibili, VK, OK.ru or Rutube link and wants it transcribed, summarized, analyzed or compared, when they hand over a list of links to process together, or when a link import fails and you need to tell them why. Covers which tool to call, what to pass for mediaType, how the batch import paces itself, and which failures are worth retrying. Uses upload_and_analyze, upload_and_analyze_batch, get_media_status, get_transcript, get_media_insights and ask_ai_chat.
license: MIT
metadata:
  server-version: "1.24.0"
  categories: "media, magic-prompt"
---

# Importing public social and video links

Speak AI resolves a shareable page link to the media behind it, server-side. You pass
the link as the user gave it. You never download the file, scrape the page, or hunt for
a direct file URL first.

## Which tool

| Situation | Tool |
|---|---|
| One link | `upload_and_analyze` |
| Two or more links | `upload_and_analyze_batch` |
| A file on the user's disk | `upload_local_file` |
| A direct file URL you already have | `upload_and_analyze` works for these too |

Never call `upload_and_analyze` in a loop. `upload_and_analyze_batch` takes up to 25
links, runs 5 at a time, and reports each one separately, so one dead link does not cost
you the other twenty four.

## Supported links

YouTube, TikTok, Instagram, X/Twitter, Facebook, Reddit, SoundCloud, Twitch, Dailymotion,
Streamable, Snapchat, Pinterest, Tumblr, Bilibili, VK, OK.ru and Rutube.

**Vimeo and Loom page links are not supported.** If a user pastes one, say so rather
than letting the import fail with a generic message.

Post and video URLs only. A TikTok *profile* URL is expanded into a list of recent videos
by the Speak AI web app, not by these tools, so ask the user for the specific videos.

## What to pass

Only three things matter. Everything else is optional metadata.

**`url`** — exactly as the user gave it. Do not strip tracking parameters, expand a short
link, or convert it to a file URL. The server handles all of that.

**`mediaType`** — send it when the user has told you which they want:

- They said "audio", "just the audio", "podcast", "transcribe the audio" → `"audio"`
- They said "video", or want anything about what is on screen → `"video"`
- They did not say → **omit it**

Omitting is the important case. With no `mediaType` the server picks the best track the
platform offers, which is video where a video track exists. If you send `"audio"`, Speak
AI imports the audio track only, and that is permanent: the stored file is audio, so the
media can never be analysed as video later. Guessing "audio" to be safe is the one thing
that cannot be undone.

**`folderId`** — pass it when the user named a destination, or when you are importing a
batch that belongs together. `list_folders` gets you the id, `create_folder` makes one.

Optional: `sourceLanguage` (BCP-47, for example `en-US`), `tags`, and `name` on the
single-link tool.

## One link

```
upload_and_analyze(url: "https://www.youtube.com/watch?v=…")
  → { mediaId, state: "pending" }
```

Then poll `get_media_status(mediaId)` every 10 to 30 seconds. States run `queued`,
`preparing`, `processing`, `preparingAnalysis`, `processed`, `failed`. Media under an
hour usually finishes in 1 to 3 minutes; a long video takes longer because the source has
to be fetched before transcription starts.

On `processed`, call `get_media_insights` for summaries, topics, sentiment and action
items, and `get_transcript` for the timestamped text.

## Several links

```
upload_and_analyze_batch(
  urls: ["https://…", "https://…", "https://…"],
  folderId: "…"        // optional, keeps them together
)
```

The response tells you exactly what happened:

```json
{
  "requested": 3,
  "uploaded": 2,
  "failed": 1,
  "media":  [{ "url": "…", "mediaId": "…", "state": "pending" }],
  "errors": [{ "url": "…", "error": "…" }]
}
```

Read `errors` and tell the user which links did not make it and why. Do not silently
retry them and do not present a partial batch as a complete one.

`concurrency` defaults to 5 and can be lowered to 1 when the user wants strict order.
Raising it is not possible; the ceiling protects the upload API.

Duplicate URLs in one call are imported once. Splitting a mixed audio-and-video batch into
two calls is better than sending one `mediaType` that is wrong for half of them.

Once several are `processed`, `ask_ai_chat` with their `mediaIds` answers questions across
the whole set, which is usually what someone wants after handing you a list.

## When an import fails

- **"Could not import this YouTube video"** — the upstream provider refused this specific
  video. Copyright blocks, private and region-locked videos land here. Retrying rarely
  helps; a different video will work.
- **"YouTube imports are temporarily rate limited"** — this one does clear. Wait and retry.
- **"This does not look like a valid YouTube link"** — the URL is malformed. Ask for it again.
- **A live stream** — cannot be imported until the stream has ended.
- **Vimeo or Loom** — not supported on this path at all.

A failure at upload time is reported to you immediately. A failure *after* upload shows up
as `state: "failed"` from `get_media_status`, so a status poll that never reaches
`processed` is worth surfacing rather than polling forever.

## Cost and consent

Every import consumes the workspace's credits, and a batch multiplies that. When a user
pastes a long list, say how many links you are about to import before you run it. Imported
media lands in their workspace permanently until deleted.
