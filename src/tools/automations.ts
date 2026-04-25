import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  server.tool(
    "list_automations",
    "List all automation rules configured in the workspace.",
    {},
    {
      title: "List Automations",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async () => {
      try {
        const result = await api.get("/v1/automations");
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
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
    },
    {
      title: "Get Automation Details",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ automationId }) => {
      try {
        const result = await api.get(`/v1/automations/${automationId}`);
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
    {
      title: "Create Automation",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/automations/", body);
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
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
      name: z.string().optional().describe("New display name"),
      trigger: z.record(z.unknown()).optional().describe("Updated trigger configuration"),
      actions: z
        .array(z.record(z.unknown()))
        .optional()
        .describe("Updated action configurations"),
      config: z.record(z.unknown()).optional().describe("Full updated configuration object"),
    },
    {
      title: "Update Automation",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ automationId, ...body }) => {
      try {
        const result = await api.put(
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
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
      enabled: z.boolean().describe("Set to true to enable, false to disable"),
    },
    {
      title: "Enable or Disable Automation",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ automationId, enabled }) => {
      try {
        const result = await api.put(
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
