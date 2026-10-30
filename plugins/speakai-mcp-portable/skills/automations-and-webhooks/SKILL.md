---
name: automations-and-webhooks
description: Receive Speak AI events on your own server with outbound webhooks, and explain where automations live. Use this when the user wants Speak to notify their system when a recording is created, processed or updated, wants to register, list, update or delete a webhook, needs to handle webhook deliveries reliably, or asks to build or run an automation. Covers create_webhook, list_webhooks, update_webhook and delete_webhook, the delivery body and idempotent handling with deliveryId, and points automation requests to the Speak AI web app. Keywords include webhook, outbound webhook, callback URL, event delivery, retry, idempotency, automation, workflow, trigger.
metadata:
  server-version: "1.40.3"
  categories: "webhooks"
  tool_count: "4"
---
# Automations and webhooks

The user's explicit instructions take priority over this skill. When they ask for something different from the steps below, do what they asked, and confirm with them before any action that deletes, overwrites, or sends data outside Speak AI.

This skill covers outbound webhooks, which send Speak events to a URL the user owns, and where automations are set up.

## Automations are set up in the Speak AI app

Automations (a trigger plus steps that run on their own, such as summarizing every new recording or posting to Slack) are created, tested and managed in the Speak AI web app at <https://app.speakai.co>. This connector does not create, change or run automations. When the user asks for one, explain that and point them to the Automations page in the app. Automations the user has already set up keep running on their own.

## Receive Speak events on your own server

Register an outbound webhook with `create_webhook`. It takes `callbackUrl`, which must
be an HTTPS URL, an optional `events` array of event types, and an optional
`description`.

Over raw HTTP, send your API key on every call, in `x-speakai-key` or as
`Authorization: Bearer <key>`. There is no access token to fetch.

```sh
curl -X POST https://api.speakai.co/v1/webhook \
  -H "x-speakai-key: speak_sk_example_000000000000" \
  -H "Content-Type: application/json" \
  -d '{
    "callbackUrl": "https://example.com/hooks/speak",
    "description": "Production event receiver"
  }'
```

Or through the CLI, which calls the same tool:

```sh
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

## Edge cases that actually bite

**Empty results are normal, not errors.** `list_webhooks` on a new workspace returns an empty list with a success status. Report the empty result. Do not retry it and do not treat it as a failure.

**Permissions and scope.** Every call runs with the permissions of the API key or the OAuth session. A key without webhook access gets a `401` or `403`, not an empty list. Ask the user to check their key at <https://app.speakai.co/developers/apikeys> rather than retrying.

**Ask before destructive calls.** `delete_webhook` stops deliveries and removes its delivery history, and `update_webhook` replaces the whole configuration. Confirm with the user first and say exactly what will change.
