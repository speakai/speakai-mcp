import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

// Shared write-schema fields for create/update. The server (speak-server
// @speak-automations) validates these with Joi `automationCreateUpdate` and
// runs them through the V2 graph engine — see the `steps` note below.
const STEPS_DESCRIPTION =
  "Ordered array of graph steps (1-20). Each step is an object: " +
  "{ stepId: string (unique within the array), stepType: one of " +
  "\"magic-prompt\" | \"translation\" | \"filter\" | \"composio-action\" | \"speak-upload\", " +
  "dependsOn?: string[] (stepIds this step runs after) } plus ONE payload key matching stepType:\n" +
  "- magic-prompt -> magicPrompt: { prompt (required unless fieldIds given), title?, " +
  "assistantType? (\"general\"|\"researcher\"|\"marketer\"|\"sales\"|\"recruiter\"|\"custom\", default \"general\"), " +
  "assistantTemplateId? (required if assistantType=\"custom\"), fieldIds?: string[] (max 10, for field extraction) }\n" +
  "- translation -> translation: { targetLanguage: BCP-47 code, e.g. \"es\" }\n" +
  "- filter -> filter: { logic: \"AND\"|\"OR\", rules: [{ field, op: \"eq\"|\"neq\"|\"contains\"|\"ncontains\"|\"startsWith\"|\"gt\"|\"lt\"|\"exists\", value? }] }\n" +
  "- composio-action -> composio: { app, action, connectedAccountId?, argsTemplate? } (Composio is currently behind a server flag and may be unavailable)\n" +
  "- speak-upload -> speakUpload: { folderId, sourceMode: \"url\"|\"file\", sourceUrl? (required when sourceMode=\"url\"), name?, fieldsMap?, language? }";

const TRIGGER_DESCRIPTION =
  "Trigger object. For folder-based automations: { type: \"folders\", folderIds: string[] } " +
  "(at least one folder is required). Note: only \"folders\" is currently supported for multi-step " +
  "automations via the API — \"tags\"/\"keywords\" are rejected, and \"composio\"/\"webhook\" triggers " +
  "(provider, app, triggerSlug, webhookId, childKey, connectedAccountId) are gated by server flags.";

const writeSchema = {
  name: z.string().min(1).max(150).describe("Display name for the automation"),
  trigger: z.record(z.unknown()).describe(TRIGGER_DESCRIPTION),
  steps: z
    .array(z.record(z.unknown()))
    .min(1)
    .max(20)
    .describe(STEPS_DESCRIPTION),
  description: z.string().max(1000).optional().describe("Optional description"),
  isActive: z
    .boolean()
    .optional()
    .describe("Whether the automation is active (defaults to true)"),
  runType: z
    .enum(["instant", "schedule"])
    .optional()
    .describe("Run type: \"instant\" (default, runs on trigger) or \"schedule\" (cron)"),
  schedule: z
    .record(z.unknown())
    .optional()
    .describe(
      "Required when runType=\"schedule\": { timePeriod: \"today\"|\"yesterday\"|\"last7days\"|\"last14days\"|\"thisWeek\", repeatAt: string }",
    ),
} as const;

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "list_automations",
    "List automation rules in the workspace, with paging and filters.",
    {
      page: z.number().int().min(0).optional().describe("0-based page index"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Results per page"),
      sortBy: z.string().optional().describe("Sort expression, e.g. \"createdAt:desc\""),
      query: z.string().optional().describe("Free-text search over automation names"),
      folderIds: z.string().optional().describe("Comma-separated folder ids to filter by"),
      isActive: z.boolean().optional().describe("Filter by active state"),
      runType: z.enum(["instant", "schedule"]).optional().describe("Filter by run type"),
    },
    {
      title: "List Automations",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/automations", { params });
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
    "list_automation_names",
    "List automations as lightweight { name, id } pairs — useful for pickers without fetching full configs.",
    {},
    {
      title: "List Automation Names",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/automations/list");
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
    "Get detailed information about a specific automation rule, including its trigger and step graph.",
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
    "get_automation_runs",
    "Get the run history (executions) for an automation, with paging and optional status filter.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
      page: z.number().int().min(0).optional().describe("0-based page index"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Results per page"),
      status: z
        .enum(["pending", "running", "completed", "failed", "killed"])
        .optional()
        .describe("Filter runs by status"),
    },
    {
      title: "Get Automation Runs",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ automationId, ...params }) => {
      try {
        const result = await api.get(`/v1/automations/${automationId}/runs`, { params });
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
    "Create a new automation rule using the V2 graph model (trigger + ordered steps). " +
      "Fetch valid step/trigger options with list_automation_triggers / list_automation_actions if unsure.",
    writeSchema,
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

  registerSpeakTool(server,
    "update_automation",
    "Update an existing automation rule. This replaces the whole automation (name, trigger, and steps), " +
      "so fetch the current values with get_automation first and pass them all back with your changes.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
      ...writeSchema,
    },
    {
      title: "Update Automation",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ automationId, ...body }) => {
      try {
        const result = await api.put(`/v1/automations/${automationId}`, body);
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
      openWorldHint: true,
    },
    async ({ automationId }) => {
      try {
        const result = await api.put(`/v1/automations/status/${automationId}`);
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
    "bulk_update_automation_status",
    "Activate or deactivate multiple automations at once.",
    {
      automationIds: z
        .array(z.string().min(1))
        .min(1)
        .max(100)
        .describe("Automation ids to update"),
      isActive: z.boolean().describe("true to activate, false to deactivate, for all listed automations"),
    },
    {
      title: "Bulk Update Automation Status",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.put("/v1/automations/bulk/status", body);
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
    "bulk_assign_automation_folders",
    "Set the folder scope for multiple automations at once. Pass an empty folderIds array to remove the folder restriction (run on all folders).",
    {
      automationIds: z
        .array(z.string().min(1))
        .min(1)
        .max(100)
        .describe("Automation ids to update"),
      folderIds: z
        .array(z.string().min(1))
        .max(50)
        .describe("Folder ids to scope the automations to. Empty array = all folders."),
    },
    {
      title: "Bulk Assign Automation Folders",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.put("/v1/automations/bulk/folders", body);
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
    "run_automations",
    "Manually run one or more automations against one or more media items now (outside the normal trigger).",
    {
      mediaIds: z.array(z.string().min(1)).min(1).describe("Media ids to run the automations against"),
      automationIds: z.array(z.string().min(1)).min(1).describe("Automation ids to run"),
    },
    {
      title: "Run Automations",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/automations/run", body);
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
    "delete_automation",
    "Permanently delete an automation rule.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation to delete"),
    },
    {
      title: "Delete Automation",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ automationId }) => {
      try {
        const result = await api.delete(`/v1/automations/${automationId}`);
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
    "list_automation_apps",
    "List the apps available in the automation catalog (e.g. Speak native + connected integrations). Use to discover what triggers/actions exist before building an automation.",
    {},
    {
      title: "List Automation Apps",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/automations/catalog/apps");
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
    "list_automation_triggers",
    "List the trigger types available in the automation catalog. Optionally filter by app.",
    {
      app: z.string().min(1).max(100).optional().describe("Filter triggers to a specific app slug"),
    },
    {
      title: "List Automation Triggers",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/automations/catalog/triggers", { params });
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
    "list_automation_actions",
    "List the action/step types available in the automation catalog. Optionally filter by app.",
    {
      app: z.string().min(1).max(100).optional().describe("Filter actions to a specific app slug"),
    },
    {
      title: "List Automation Actions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/automations/catalog/actions", { params });
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
