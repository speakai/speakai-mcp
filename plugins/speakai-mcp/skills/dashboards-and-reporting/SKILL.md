---
name: dashboards-and-reporting
description: Build, update, and share Speak AI analytics dashboards. Use this when someone asks for a dashboard, a recurring report, a chart or widget over their recordings, a speaker breakdown, a view of sentiment or themes over time, a shareable link or embed for stakeholders, or a copy of an existing dashboard scoped to a different folder or date range. Covers list_dashboard_widgets, list_dashboards, get_dashboard, create_dashboard, update_dashboard, duplicate_dashboard, share_dashboard, delete_dashboard and get_dashboard_speakers_insight, and explains the strict widget config rules that reject unknown keys.
metadata:
  server-version: "1.21.2"
  categories: "dashboards, custom-fields, folders-views"
---

# Dashboards and reporting

A dashboard is a saved set of widgets over a scope of media. It answers "how is this
changing" rather than "what did this call say", and it can be shared with people who do not
have a Speak AI account.

## Step 1: Always call list_dashboard_widgets first

`list_dashboard_widgets` takes no arguments. It returns every widget type, the exact
`config` shape each one accepts, the metric and filter grammar, date-range presets, design
rules, and two complete worked examples.

Call it before `create_dashboard` or `update_dashboard`, every time. Widget configs are
strict and reject unknown keys, so guessing a field name fails the whole call. The catalog
is the only place the current vocabulary is written down, and it changes as widgets are
added.

## Step 2: Create the dashboard

`create_dashboard` requires only `title`, capped at 60 characters. Everything else is
optional, so you can create it and then add widgets.

Pass `widgets` as a simple ordered list. Widget ids and grid layout are computed for you,
so do not hand-build an `x`/`y` grid unless the user asks for a specific arrangement.

Four rules from the catalog that cause most failures:

- **Configs are strict.** An unknown key is rejected rather than ignored.
- **Metrics reference custom fields by NAME, not id.** Get names from `list_fields`.
- **`field-distribution` requires `config.fieldName`.** Most other widgets render on
  sensible defaults with no config at all.
- **`team-activity` is only valid when the source is `{ type: "team" }`**, either on the
  dashboard or on that widget's `binding.source`.

To group widgets into sections, give each sectioned widget an explicit kebab-case `id` and
reference those ids in `sections[].widgetIds`.

## Step 3: Scope it

A dashboard has a source, a date range, and optional filters. Each widget can override any
of them through `binding`, and omitting a key inherits the dashboard's value.

Get the scope right before adding widgets. A dashboard over the whole workspace when the
user meant one folder produces charts that look fine and mean nothing. If the user names a
team, a project, or a client, find the matching folder with `list_folders` first and scope
to it.

## Step 4: Share it

`share_dashboard` takes `dashboardId` and enables public sharing, returning a share token
and an embed. That link is public and unauthenticated, so anyone holding it sees the data.

Confirm with the user before sharing, and say plainly that the link needs no login.

## Speaker breakdowns

`get_dashboard_speakers_insight` computes a speakers breakdown for a folder scope and date
range. Use it for talk-time splits and who dominated a set of conversations, which is a
common ask after a batch of sales or research calls.

It answers the question directly, so reach for it instead of building a dashboard when the
user only wants that one number.

## Managing dashboards

- `list_dashboards` returns the dashboards the caller can access, including share state.
  Check here before creating something that already exists.
- `get_dashboard` returns a dashboard's full spec: title, description, source, date range,
  and widgets. Read it before updating so you preserve what is already there.
- `update_dashboard` takes `dashboardId`. Send the full intended state of what you are
  changing rather than assuming a partial merge, and re-read with `get_dashboard`
  afterwards if the user is iterating.
- `duplicate_dashboard` takes `dashboardId` and clones it. This is the right tool for
  "same report, different folder" or "same report, last quarter", so rebuild nothing.
- `delete_dashboard` is a soft delete. Confirm with the user first.

## What goes wrong

- **Building widgets without calling `list_dashboard_widgets`.** Configs are strict and
  the vocabulary is not guessable.
- **Referencing a custom field by id.** Metrics take the field NAME. Use `list_fields`.
- **Using `team-activity` on a non-team source.** It is only valid with
  `{ type: "team" }`.
- **Sharing without asking.** The share link needs no login.
- **Updating blind.** Read with `get_dashboard` first, or you will drop widgets the user
  wanted.
- **Building a dashboard for a one-off number.** If the ask is talk time, use
  `get_dashboard_speakers_insight`.

## Confirm before running

- `share_dashboard`, which exposes data to anyone with the link.
- `delete_dashboard`, even though it is a soft delete.
- `update_dashboard` on a dashboard someone else built.

## Tools this skill uses

Dashboards: `list_dashboard_widgets`, `list_dashboards`, `get_dashboard`,
`create_dashboard`, `update_dashboard`, `duplicate_dashboard`, `share_dashboard`,
`delete_dashboard`, `get_dashboard_speakers_insight`.

Supporting: `list_fields` for custom field names, `list_folders` for scoping.

Per-tool documentation: `https://docs.speakai.co/mcp/tools/dashboards/<tool_name>/`
