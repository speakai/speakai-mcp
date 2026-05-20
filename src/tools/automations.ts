import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  registerSpeakTool(server, 
    "list_automations",
    "List all automation rules configured in the workspace.",
    {},
    {
      title: "List Automations",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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

  registerSpeakTool(server, 
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
      openWorldHint: false,
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

  registerSpeakTool(server, 
    "create_automation",
    "Create a new automation rule for automatic media processing workflows.",
    {
      name: z.string().min(1).describe("Display name for the automation"),
      trigger: z
        .record(z.unknown())
        .describe(
          "Trigger object. Keys: `type` (e.g. \"folders\") and `folderIds` (array of folder IDs).",
        ),
      action: z
        .record(z.unknown())
        .describe(
          "Single action object (not an array). Keys: `type` (\"magic-prompt\" or \"translation\"). " +
            "For magic-prompt, include a `magicPrompt` object ({ prompt, title?, assistantType?, fieldIds?, ... }). " +
            "For translation, include a `translation` object ({ targetLanguage }).",
        ),
      description: z.string().optional().describe("Optional description"),
      isActive: z
        .boolean()
        .optional()
        .describe("Whether the automation is active (defaults to true)"),
      runType: z
        .string()
        .optional()
        .describe("Run type, e.g. \"instant\" (default) or \"scheduled\""),
      schedule: z
        .record(z.unknown())
        .optional()
        .describe("Schedule object for scheduled automations: { timePeriod, repeatAt }"),
    },
    {
      title: "Create Automation",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
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

  registerSpeakTool(server, 
    "update_automation",
    "Update an existing automation rule. This replaces the whole automation, so " +
      "fetch the current values with get_automation first and pass them all back.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
      name: z.string().min(1).describe("Display name for the automation"),
      trigger: z
        .record(z.unknown())
        .describe(
          "Trigger object. Keys: `type` (e.g. \"folders\") and `folderIds` (array of folder IDs).",
        ),
      action: z
        .record(z.unknown())
        .describe(
          "Single action object (not an array). Keys: `type` (\"magic-prompt\" or \"translation\"). " +
            "For magic-prompt, include a `magicPrompt` object ({ prompt, title?, assistantType?, fieldIds?, ... }). " +
            "For translation, include a `translation` object ({ targetLanguage }).",
        ),
      description: z.string().optional().describe("Optional description"),
      isActive: z
        .boolean()
        .optional()
        .describe("Whether the automation is active (defaults to true)"),
      runType: z
        .string()
        .optional()
        .describe("Run type, e.g. \"instant\" (default) or \"scheduled\""),
      schedule: z
        .record(z.unknown())
        .optional()
        .describe("Schedule object for scheduled automations: { timePeriod, repeatAt }"),
    },
    {
      title: "Update Automation",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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

  registerSpeakTool(server, 
    "toggle_automation_status",
    "Toggle an automation rule between active and inactive. This flips the current state — call get_automation first if you need to know which way it will flip.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
    },
    {
      title: "Toggle Automation Status",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ automationId }) => {
      try {
        const result = await api.put(
          `/v1/automations/status/${automationId}`
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
