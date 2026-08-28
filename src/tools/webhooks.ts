import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";
import {
  fetchInboundWebhookInfo,
  resolveAutomationInboundWebhook,
  unwrapData,
} from "./inbound-webhook-utils.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  registerSpeakTool(server, 
    "create_webhook",
    "Create a new webhook to receive real-time notifications when events occur in Speak AI.",
    {
      callbackUrl: z.string().url().describe("HTTPS endpoint URL to receive webhook payloads"),
      events: z
        .array(z.string())
        .optional()
        .describe("Array of event types to subscribe to"),
      description: z.string().optional().describe("Optional description for the webhook"),
    },
    {
      title: "Create Webhook",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/webhook", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server, 
    "list_webhooks",
    "List all configured webhooks in the workspace.",
    {},
    {
      title: "List Webhooks",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/webhook");
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server, 
    "update_webhook",
    "Update an existing webhook. This replaces the webhook config, so `callbackUrl` must always be supplied.",
    {
      webhookId: z.string().min(1).describe("Unique identifier of the webhook"),
      callbackUrl: z.string().url().describe("HTTPS endpoint URL to receive webhook payloads"),
      events: z
        .array(z.string())
        .optional()
        .describe("Updated array of event types"),
      description: z.string().optional().describe("Optional description for the webhook"),
    },
    {
      title: "Update Webhook",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ webhookId, ...body }) => {
      try {
        const result = await api.put(`/v1/webhook/${webhookId}`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "provision_inbound_webhook",
    "Provision a standalone inbound webhook and get its public receive URL (inboundUrl) BEFORE creating an automation. " +
      "Webhook-first flow: provision, send a test payload to the URL (append ?test=1 to only capture a sample without running anything), " +
      "inspect mappable payload paths with get_inbound_webhook, then pass the webhookId as trigger.webhookId to create_automation.",
    {},
    {
      title: "Provision Inbound Webhook",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async () => {
      try {
        const result = await api.post("/v1/webhook/inbound/provision", {});
        const payload = unwrapData(result.data) ?? {};
        const inboundUrl = typeof payload.inboundUrl === "string" ? payload.inboundUrl : "<inboundUrl>";
        const data = {
          ...payload,
          nextSteps: [
            `Capture a sample payload (does not run anything): curl -X POST '${inboundUrl}?test=1' -H 'Content-Type: application/json' -d '{"url": "https://example.com/file.mp3", "name": "Test"}'`,
            "Call get_inbound_webhook with this webhookId to see the captured sample and mappable {{trigger.payload.*}} tokens.",
            "Create the automation with create_automation, passing this webhookId in trigger.webhookId (triggerSlug: \"inbound_webhook\").",
          ],
        };
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "get_inbound_webhook",
    "Get an inbound webhook's public receive URL, captured sample payload, and the ready-to-paste " +
      "{{trigger.payload.*}} tokens for mapping payload values into automation steps (speak-upload name/sourceUrl, " +
      "fieldsMap custom-field values, notify/outbound-webhook templates). Pass either the webhookId or the " +
      "automationId of an inbound-webhook automation. If no sample has been captured yet, send a test payload " +
      "to the inboundUrl first (append ?test=1 to capture without running the automation).",
    {
      webhookId: z
        .string()
        .min(1)
        .optional()
        .describe("Inbound webhook id (from provision_inbound_webhook or an automation's trigger.webhookId)"),
      automationId: z
        .string()
        .min(1)
        .optional()
        .describe("Automation id — resolves the bound webhookId and childKey automatically"),
      childKey: z
        .string()
        .optional()
        .describe("Override the dot-path used to narrow mappable payload paths (defaults to the automation's trigger.childKey)"),
    },
    {
      title: "Get Inbound Webhook",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ webhookId, automationId, childKey }) => {
      try {
        let resolvedWebhookId = webhookId;
        let resolvedChildKey = childKey;
        if (!resolvedWebhookId && automationId) {
          const resolved = await resolveAutomationInboundWebhook(api, automationId);
          if (!resolved.webhookId) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: automation ${automationId} has no inbound webhook bound to its trigger (it is not an inbound-webhook automation).`,
                },
              ],
              isError: true,
            };
          }
          resolvedWebhookId = resolved.webhookId;
          resolvedChildKey = resolvedChildKey ?? resolved.childKey;
        }
        if (!resolvedWebhookId) {
          return {
            content: [{ type: "text", text: "Error: provide either webhookId or automationId." }],
            isError: true,
          };
        }
        const info = await fetchInboundWebhookInfo(api, resolvedWebhookId, resolvedChildKey);
        return {
          content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "get_webhook_attempts",
    "Get the delivery log for an inbound webhook: each received request with its HTTP acknowledgement status " +
      "(200 = sample captured, 202 = accepted and run started, 401/403 = rejected) and the automation run it started. " +
      "Use get_automation_runs for the run outcomes themselves.",
    {
      webhookId: z.string().min(1).describe("Unique identifier of the inbound webhook"),
      page: z.number().int().min(0).optional().describe("0-based page index"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Results per page"),
    },
    {
      title: "Get Webhook Attempts",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ webhookId, ...params }) => {
      try {
        const result = await api.get(`/v1/webhook/${webhookId}/attempts`, { params });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "delete_webhook",
    "Delete a webhook and stop receiving notifications at its endpoint.",
    {
      webhookId: z.string().min(1).describe("Unique identifier of the webhook to delete"),
    },
    {
      title: "Delete Webhook",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ webhookId }) => {
      try {
        const result = await api.delete(`/v1/webhook/${webhookId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );
}
