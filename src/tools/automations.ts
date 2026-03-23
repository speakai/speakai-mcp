import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer): void {
  server.tool(
    "list_automations",
    "List all automation rules configured in the workspace.",
    {},
    async () => {
      try {
        const result = await speakClient.get("/v1/automations");
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

  server.tool(
    "get_automation",
    "Get detailed information about a specific automation rule.",
    {
      automationId: z.string().describe("Unique identifier of the automation"),
    },
    async ({ automationId }) => {
      try {
        const result = await speakClient.get(`/v1/automations/${automationId}`);
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

  server.tool(
    "create_automation",
    "Create a new automation rule for automatic media processing workflows.",
    {
      name: z.string().optional().describe("Display name for the automation"),
      trigger: z.record(z.unknown()).optional().describe("Trigger configuration"),
      actions: z
        .array(z.record(z.unknown()))
        .optional()
        .describe("Array of action configurations"),
      config: z.record(z.unknown()).optional().describe("Full automation configuration object"),
    },
    async (body) => {
      try {
        const result = await speakClient.post("/v1/automations/", body);
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

  server.tool(
    "update_automation",
    "Update an existing automation rule's configuration.",
    {
      automationId: z.string().describe("Unique identifier of the automation"),
      name: z.string().optional().describe("New display name"),
      trigger: z.record(z.unknown()).optional().describe("Updated trigger configuration"),
      actions: z
        .array(z.record(z.unknown()))
        .optional()
        .describe("Updated action configurations"),
      config: z.record(z.unknown()).optional().describe("Full updated configuration object"),
    },
    async ({ automationId, ...body }) => {
      try {
        const result = await speakClient.put(
          `/v1/automations/${automationId}`,
          body
        );
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

  server.tool(
    "toggle_automation_status",
    "Enable or disable an automation rule.",
    {
      automationId: z.string().describe("Unique identifier of the automation"),
      enabled: z.boolean().describe("Set to true to enable, false to disable"),
    },
    async ({ automationId, enabled }) => {
      try {
        const result = await speakClient.put(
          `/v1/automations/status/${automationId}`,
          { enabled }
        );
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
