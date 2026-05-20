import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

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
