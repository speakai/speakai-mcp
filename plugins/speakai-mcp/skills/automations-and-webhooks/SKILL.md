---
name: automations-and-webhooks
description: Build, test, and operate Speak AI automations and webhooks through MCP. Use this when the user wants recurring work to happen on its own, for example when a recording finishes processing and should be summarized, translated, routed to a folder, or pushed to another system, when an external system should post data into Speak, or when a server needs to receive Speak events in real time. Covers discovering the trigger and action catalog, building an automation with build_automation or create_automation, running it manually, reading run history, provisioning inbound webhooks and mapping their payload tokens, and registering outbound webhooks with idempotent delivery handling. Keywords include automation, workflow, trigger, action, step, webhook, inbound webhook, outbound webhook, callback URL, event delivery, retry, run history.
metadata:
  version: "1.18.0"
  category: "automations, webhooks"
  tool_count: "22"
---

# Automations and webhooks

The Speak AI MCP server exposes 112 tools in 15 categories. This skill covers two of
them: automations (15 tools) and webhooks (7 tools). Automations run work inside Speak.
Webhooks move data across the boundary, either into Speak or out to your own server.

Three things are easy to confuse, so keep them apart:

1. **Automations** are a trigger plus an ordered list of steps stored in the workspace.
2. **Inbound webhooks** give an outside system a URL to POST to. The POST starts an
   automation run. You provision these with `provision_inbound_webhook`.
3. **Outbound webhooks** send Speak events to a URL you own. You register these with
   `create_webhook`.

## Step 1: discover before you build

Never guess a trigger slug, an action type, a folder id, or a custom field id. Read the
catalog first. All five calls are read only.

| Tool | What you get |
| --- | --- |
| `list_automation_apps` | Apps in the catalog, Speak native plus connected integrations |
| `list_automation_triggers` | Trigger types, with an optional `app` filter |
| `list_automation_actions` | Action and step types, with an optional `app` filter |
| `list_folders` | Folder ids and names, needed by folder scoped triggers |
| `list_fields` | Custom field ids and names, needed by field mapping and `field_updated` |

Docs: <https://docs.speakai.co/mcp/tools/automations/list_automation_triggers/> and
<https://docs.speakai.co/mcp/tools/automations/list_automation_actions/>.

If the workspace has no custom fields yet, `list_fields` returns an empty list. Create
one with `create_field` before you reference it, because a field name that does not
resolve fails the build with the list of available names.

## Step 2: build the automation

Prefer `build_automation`. It takes folder and custom field names instead of ids,
resolves them for you, creates missing folders, and accepts `payload.<path>` shorthand
for webhook tokens. Use `create_automation` only when you need raw control over the
step graph.

### Triggers

`build_automation` accepts three values for `trigger.on`:

- `media_analyzed`, which fires when a recording in the listed folders finishes
  analysis. Requires `folders`, an array of names or ids.
- `inbound_webhook`, which fires when an outside system POSTs to the receive URL.
  Optional `webhookId` to reuse a provisioned webhook, and optional `childKey` to
  narrow the payload root, for example `"data"`.
- `field_updated`, which fires when a watched custom field changes. Requires
  `watchFields`, an array of `{ field, values? }`. Leave `values` off to fire on any
  change.

Add `orTriggers` to fire on any of several triggers with the same steps. An
`inbound_webhook` cannot be an or trigger, so make it the primary trigger.

### Steps

Each step is an object with a `do` key: `filter`, `branch`, `upload`, `ai_chat`,
`translate`, `notify`, or `call_webhook`. A short example that summarizes every new
recording in one folder and posts the answer to your own service:

```json
{
  "name": "Summarize research calls",
  "trigger": { "on": "media_analyzed", "folders": ["Research calls"] },
  "steps": [
    { "do": "filter", "rules": [{ "field": "duration", "op": "gt", "value": 120 }] },
    {
      "do": "ai_chat",
      "title": "Call summary",
      "prompt": "Summarize the call in five bullets and list every action item.",
      "saveToFields": ["Call summary"]
    },
    {
      "do": "notify",
      "channel": "in_app",
      "message": "A research call was summarized and saved to the Call summary field."
    }
  ]
}
```

Token syntax matters. `{{trigger.payload.<path>}}` reads the inbound webhook payload.
`{{step.<index>.<path>}}` or `{{step.<stepId>.<path>}}` reads an earlier step output.
An `upload` step exposes `mediaId`, an `ai_chat` step exposes `answer`, and a
`call_webhook` step exposes `status` and `response`. Get the exact payload tokens from
`get_inbound_webhook` rather than writing them from memory, and confirm a step output
path against `get_automation` before you depend on it.

Docs: <https://docs.speakai.co/mcp/tools/automations/build_automation/> and
<https://docs.speakai.co/mcp/tools/automations/create_automation/>.

## Step 3: test the automation

You have three ways to test, in increasing order of realism.

1. **Run it by hand.** `run_automations` takes `mediaIds` and `automationIds` and runs
   the automation against existing media right now, outside the normal trigger. This is
   the fastest check for `media_analyzed` automations. It does not work for inbound
   webhook automations, because there is no payload to feed them.
2. **Read the run history.** `get_automation_runs` takes an `automationId` and optional
   `page`, `pageSize`, and `status`, where status is one of `pending`, `running`,
   `completed`, `failed`, or `killed`. Filter on `failed` first.
3. **Send a real payload.** For inbound webhook automations, POST to the receive URL.
   See the next section.

A run that stops early is not the same as a run that failed. A `filter` step that does
not match stops the run silently, and the run still records as completed. If you expect
work and see nothing, check the filter rules before you look for an error.

## Step 4: receive data into Speak with an inbound webhook

The reliable order is provision, capture a sample, map tokens, then wire the automation.

1. Call `provision_inbound_webhook`. It takes no arguments and returns `inboundUrl`,
   the public receive URL, plus the `webhookId`.
2. POST a representative payload to that URL with `?test=1`. The test flag captures the
   sample without running anything.

   ```sh
   # Paste the inboundUrl value returned by provision_inbound_webhook.
   INBOUND_URL="paste-the-inboundUrl-value-here"

   curl -X POST "$INBOUND_URL?test=1" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com/file.mp3", "name": "Test recording", "contact": {"email": "someone@example.com"}}'
   ```

3. Call `get_inbound_webhook` with the `webhookId`, or with the `automationId` of an
   existing inbound webhook automation. It returns `samplePayload`, `sampleCaptured`,
   and `mappableTokens`, which are ready to paste `{{trigger.payload.*}}` strings.
4. Build the automation with `trigger.on` set to `inbound_webhook` and `webhookId` set
   to the id you provisioned. Use the tokens from step 3 in `source`, `name`, and
   `mapFields`. Inside `build_automation` you can write `payload.<path>` shorthand when
   it is the entire value, and Speak expands it to the full token.

   ```json
   {
     "name": "Ingest recordings from our CRM",
     "trigger": { "on": "inbound_webhook", "webhookId": "paste-the-webhookId-here" },
     "steps": [
       {
         "do": "upload",
         "source": "payload.url",
         "name": "payload.name",
         "language": "en-US",
         "folder": "CRM intake",
         "mapFields": { "Contact email": "payload.contact.email" }
       },
       { "do": "ai_chat", "prompt": "List the action items from this call." }
     ]
   }
   ```

5. Check `get_webhook_attempts` with the `webhookId`. Each entry shows the HTTP
   acknowledgement for a received request. `200` means the sample was captured, `202`
   means the request was accepted and a run started, and `401` or `403` means it was
   rejected. Use `get_automation_runs` for what happened after that.

If you skip `create_automation` and pass no `webhookId`, the server provisions one for
you and the create response includes `inboundWebhook.inboundUrl`. That works, but you
then have no captured sample, so `mappableTokens` is empty and you have to send a test
payload and call `update_automation` to wire the tokens. Provisioning first avoids the
second write.

Docs: <https://docs.speakai.co/mcp/tools/webhooks/provision_inbound_webhook/>,
<https://docs.speakai.co/mcp/tools/webhooks/get_inbound_webhook/>, and
<https://docs.speakai.co/mcp/tools/webhooks/get_webhook_attempts/>.

## Step 5: receive Speak events on your own server

Register an outbound webhook with `create_webhook`. It takes `callbackUrl`, which must
be an HTTPS URL, an optional `events` array of event types, and an optional
`description`.

Over raw HTTP, the REST API takes `x-speakai-key` and `x-access-token`. It does not accept
a Bearer token. Exchange your API key at `/v1/auth/accessToken` to get the access token.

```sh
curl -X POST https://api.speakai.co/v1/webhook \
  -H "x-speakai-key: sk_speak_example_0000000000000000" \
  -H "x-access-token: eyJhbG-example-access-token" \
  -H "Content-Type: application/json" \
  -d '{
    "callbackUrl": "https://example.com/hooks/speak",
    "description": "Production event receiver"
  }'
```

Or through the CLI, which calls the same tool:

```sh
export SPEAK_API_KEY="sk_speak_example_0000000000000000"
speakai-mcp call create_webhook '{"callbackUrl":"https://example.com/hooks/speak"}'
```

**The new id comes back as `data.webhookId`.** Read it from there. Store it, because
`update_webhook` and `delete_webhook` both require it, and `update_webhook` replaces
the whole config, so you must always send `callbackUrl` again even when you are only
changing the event list.

### Delivery bodies and idempotent handling

Every delivery body carries two fields you should rely on:

- `eventType`, which tells you what happened and lets one endpoint serve several
  subscriptions.
- `deliveryId`, which identifies this delivery. Speak generates a fresh `deliveryId`
  per delivery and reuses the same value across retries of that delivery.

That reuse is the whole reason idempotent handling works. Record every `deliveryId` you
finish, and drop a body whose `deliveryId` you have already recorded. Do not key on the
event payload contents, because two genuinely separate events can look identical.

```js
// Express receiver. Returns 200 fast, then does the real work out of band.
const express = require("express");
const app = express();
app.use(express.json());

const seenDeliveries = new Set(); // Use a durable store in production.

app.post("/hooks/speak", (req, res) => {
  const { eventType, deliveryId } = req.body;

  if (!deliveryId) return res.status(400).send("missing deliveryId");
  if (seenDeliveries.has(deliveryId)) return res.status(200).send("duplicate");

  seenDeliveries.add(deliveryId);
  res.status(200).send("ok");

  setImmediate(() => handleEvent(eventType, req.body));
});

function handleEvent(eventType, body) {
  console.log("handling", eventType, body);
}

app.listen(3000);
```

Acknowledge with a `2xx` before you do slow work. A handler that transcribes, calls an
LLM, or writes to a slow database inside the request is the most common cause of
retries, and retries are what make duplicate handling necessary in the first place.

Use `list_webhooks` to see everything registered in the workspace before you add
another one. Duplicate `callbackUrl` values are a common way to end up processing every
event twice.

Docs: <https://docs.speakai.co/mcp/tools/webhooks/create_webhook/>,
<https://docs.speakai.co/mcp/tools/webhooks/list_webhooks/>,
<https://docs.speakai.co/mcp/tools/webhooks/update_webhook/>, and
<https://docs.speakai.co/mcp/tools/webhooks/delete_webhook/>.

## Operating automations after they ship

| Task | Tool | Notes |
| --- | --- | --- |
| Find an automation | `list_automations` | Supports `page`, `pageSize`, `sortBy`, `query`, `folderIds`, `isActive`, `runType` |
| Build a picker | `list_automation_names` | Returns name and id pairs only, no paging arguments |
| Read the full config | `get_automation` | Returns the trigger and the step graph |
| Change it | `update_automation` | Full replace, see the warning below |
| Flip active state | `toggle_automation_status` | Flips whatever the current state is |
| Set state for many | `bulk_update_automation_status` | Takes `automationIds` and an explicit `isActive` |
| Re-scope folders | `bulk_assign_automation_folders` | An empty `folderIds` array means all folders |
| Remove it | `delete_automation` | Permanent |

`update_automation` replaces the entire automation, including the name, the trigger,
and every step. Always call `get_automation` first, merge your change into the values
you got back, and send the whole thing. Sending only the changed field silently drops
everything you left out.

`toggle_automation_status` flips the current state rather than setting it. When you
need a known end state, especially across several automations, call
`bulk_update_automation_status` with an explicit `isActive` instead.

## Edge cases that actually bite

**Media is still processing.** A `media_analyzed` trigger fires after analysis, but
`run_automations` fires whenever you call it. If you run an automation against media
that is still processing, steps that read the transcript get nothing. Poll
`get_media_status` until the state is `processed` first, then run. Uploads created
inside an automation already wait for processing before later steps run, so this only
affects manual runs.

**Empty results are normal, not errors.** `list_automations` on a new workspace,
`get_automation_runs` on an automation that has never fired, and `get_webhook_attempts`
before any request arrives all return empty lists with a success status. Report the
empty result. Do not retry it and do not treat it as a failure.

**No sample means no tokens.** `get_inbound_webhook` returns an empty `mappableTokens`
array until a payload has been captured. Send a test POST with `?test=1` and call it
again rather than guessing paths.

**Filters on raw payload fields can be rejected.** A `filter` step whose rule field is
a webhook payload path can fail at publish time with a permission error about field
ids. Move the filter after the `upload` step and filter on media or custom fields, or
filter in the sending system before it POSTs.

**Branch routing depends on a server feature.** `branch` steps and their `runWhen`
markers need the server DAG runner. When it is off, steps run in order and the markers
are ignored. Use `filter` when you need gating you can count on.

**Translate needs a region qualified locale.** Use `es-ES` or `fr-FR`. A bare `es` is
rejected.

**Folder names are created on demand.** `build_automation` creates a folder whose name
it cannot find, and reports it in `createdFolders`. A value that looks like an id but
matches nothing is treated as a typo and raises an error instead, so it never creates a
folder named after a broken id. Check `createdFolders` in the response and tell the
user what was created.

**Paging is zero based.** `page` starts at 0 and `pageSize` caps at 100 on
`list_automations`, `get_automation_runs`, and `get_webhook_attempts`. Page through
until a short page comes back. `list_automation_names` and `list_webhooks` take no
paging arguments and return everything.

**Permissions and scope.** Every call runs with the permissions of the API key or the
OAuth session. A key without automation access gets a `401` or `403`, not an empty
list. Inbound webhook requests that are rejected show as `401` or `403` in
`get_webhook_attempts`, which is how you tell a bad secret apart from a payload
problem. Ask the user to check their key at
<https://app.speakai.co/developers/apikeys> rather than retrying.

**Ask before destructive calls.** `delete_automation`, `delete_webhook`,
`update_automation`, and `bulk_assign_automation_folders` all remove or replace
existing configuration. Confirm with the user first and say exactly what will change.
