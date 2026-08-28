---
name: surveys-and-recorders
description: Run async voice and video surveys in Speak AI end to end. Use this when someone asks to collect recorded answers from customers, candidates, or users without booking calls, to set up a survey or recorder, to write or change its questions, to brand it, to get a shareable link to send out, to check whether it is still accepting submissions, to list what has come back, or to analyze the responses as a set. Covers create_recorder, update_recorder_questions, update_recorder_settings, generate_recorder_url, check_recorder_status, get_recorder_recordings, list_recorders, get_recorder_info, clone_recorder and delete_recorder, then hands off to the transcript and AI Chat tools once responses arrive.
metadata:
  server-version: "1.23.0"
  categories: "recorders-surveys, media, magic-prompt"
---

# Surveys and recorders

A recorder is a public page that collects audio or video answers. You send a link, people
record replies on their own time, and each submission lands in the workspace as normal
media with a transcript and insights. It replaces booking a call for every participant.

Use this for customer research, candidate screening, onboarding feedback, testimonials, or
any question you would otherwise ask on a call.

## Step 1: Create the recorder

`create_recorder` needs only `name`. Everything else is optional, so create it first and
configure it in the next steps rather than trying to pass everything at once.

Useful optional arguments:

- `description`, shown to the respondent.
- `folderId`, so submissions land somewhere findable instead of the workspace root.
- `isAutoAnalyze`, so each submission is transcribed and analyzed on arrival. Set this
  unless the user wants to review raw recordings first.
- `sourceLanguage`, a transcription language code such as `en-US`.
- `notifyUsers`, an array of user IDs to alert on each new submission. Get IDs from
  `list_users`.

Keep the returned `recorderId`. Every later step except the status check uses it.

## Step 2: Write the questions

`update_recorder_questions` takes `recorderId`, optional `name` and `email` booleans for
whether to collect respondent details, and a `questions` array.

**The answer types are a fixed set, and there is no free-text, rating, or number type:**

`single`, `multiple`, `checkbox`, `radiobutton`, `dropdownlist`, `date`, `time`, `datetime`

That surprises people, so do not offer the user a rating scale or a short-answer box and
then fail. The recorded answer *is* the free text. The typed question is for structured
detail alongside the recording, so a satisfaction score belongs in a `radiobutton` or
`dropdownlist` with the options spelled out.

Ask fewer questions than feels natural. Every extra question lowers completion, and the
recording already carries the depth.

## Step 3: Brand and configure it

`update_recorder_settings` takes `recorderId` and the presentation and behaviour options:
branding, captions, duration limits as `{ minDuration, maxDuration }` in seconds, and
notification toggles.

Set a `maxDuration`. Without one, a rambling answer becomes an expensive transcript and a
worse dataset. Two to three minutes suits most questions.

## Step 4: Get the link and share it

`generate_recorder_url` takes `recorderId` and returns a public URL. Anyone with the link
can submit, so treat it as public.

Confirm with the user before sending it anywhere on their behalf.

## Step 5: Check it is accepting submissions

`check_recorder_status` **takes `token`, not `recorderId`.** This is the one call in the
workflow keyed on something else, and passing the recorder id fails. The token comes from
`get_recorder_info` or the recorder record.

Use it when a user says responses are not arriving, before assuming nobody replied.

## Step 6: Collect the responses

`get_recorder_recordings` takes `recorderId` and lists submissions. Each one is media, so
from here the normal tools apply:

- `get_media_status` to confirm a submission finished processing. States run `queued`,
  `preparing`, `processing`, `preparingAnalysis`, then `processed` or `failed`. Insights
  are empty before `processed`.
- `get_transcript` for what the person actually said.
- `get_media_insights` for topics, sentiment, keywords, and action items.

Do not report on a set while some of it is still processing. Say how many are ready.

## Step 7: Analyze the set, not one reply at a time

Once several responses are in, the question is what they say collectively.

Scope `ask_ai_chat` to the folder holding the submissions, or pass the `mediaIds` of the
responses, and ask for citations so each claim traces to a respondent. Set
`isIndividualPrompt` to true when you want each response answered separately, which is what
you want for counting how many people said a thing rather than a blended summary.

For themes, quotes, and comparisons across a larger set, use the `research-analysis` skill.
It covers scoping, citation, and pulling verbatim quotes properly.

## Managing recorders

- `list_recorders` takes optional `page`, `pageSize` up to 500, and `sortBy` such as
  `createdAt:desc`. Use it to find an existing recorder before creating a duplicate.
- `get_recorder_info` takes `recorderId` and returns the full configuration, including the
  token the status check needs.
- `clone_recorder` takes `recorderId` and optional `name`, `description`, and `folderId`.
  Use it to run the same study with a new cohort rather than rebuilding the questions.
- `delete_recorder` is permanent. Confirm with the user first, and check
  `get_recorder_recordings` for submissions that would be orphaned.

## What goes wrong

- **Offering a question type that does not exist.** Rating and short-answer are not
  options. Map them to a choice type or leave it to the recording.
- **Passing `recorderId` to `check_recorder_status`.** It takes `token`.
- **Reading insights too early.** A submission has no transcript until it reaches
  `processed`.
- **Sharing the link without asking.** It is public and unauthenticated.
- **Deleting a recorder to "clean up".** Confirm first, it takes the configuration with it.

## Confirm before running

- `delete_recorder`, which is permanent.
- `generate_recorder_url` when you are about to distribute the link rather than show it.
- `update_recorder_questions` on a recorder that already has submissions, since it changes
  what later answers mean relative to earlier ones.

## Tools this skill uses

Recorders: `create_recorder`, `list_recorders`, `get_recorder_info`, `clone_recorder`,
`get_recorder_recordings`, `generate_recorder_url`, `update_recorder_settings`,
`update_recorder_questions`, `check_recorder_status`, `delete_recorder`.

Follow-on: `get_media_status`, `get_transcript`, `get_media_insights`, `ask_ai_chat`,
`list_users`.

Per-tool documentation: `https://docs.speakai.co/mcp/tools/recorders-surveys/<tool_name>/`
