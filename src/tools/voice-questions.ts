import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

// Questions a voice agent asks mid-call, under /v1/voice/questions and /v1/voice/question-templates.
const validationSchema = z.object({
  pattern: z.string().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  allowedValues: z.array(z.string()).optional(),
});

const customConfigSchema = z.object({
  displayLabel: z.string().optional(),
  question: z.string().optional().describe("The prompt text the agent speaks to ask this question."),
  confirmationText: z.string().optional(),
  validationPrompt: z.string().optional(),
  validation: validationSchema.optional(),
});

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "list_voice_questions",
    "List the questions configured on a voice agent, in the order it asks them. Each is an agent-level instance of a question template with its own required/attempts/no-response settings and optional field mapping.",
    {
      agentId: z.string().min(1).describe("Required. Returns 404 if the agent does not exist or does not belong to your company."),
      enabledOnly: z.boolean().optional(),
    },
    { title: "List Voice Questions", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (params) => {
      try {
        const result = await api.get("/v1/voice/questions", { params });
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "get_voice_question",
    "Fetch a single voice agent question by its fieldId, scoped to your company.",
    { fieldId: z.string().min(1).describe("ID of the question (from list_voice_questions)") },
    { title: "Get Voice Question", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fieldId }) => {
      try {
        const result = await api.get(`/v1/voice/questions/${fieldId}`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "create_voice_question",
    "Attach a question template to a voice agent. Requires the OWNER or ADMIN role. agentId and templateId are both required and must belong to your company (or, for templateId, be a public system template) — 404 if either isn't found.",
    {
      agentId: z.string().min(1),
      templateId: z.string().min(1).describe("From list_voice_question_templates."),
      customConfig: customConfigSchema.optional().describe("Agent-level override of the template's defaultConfig; only the keys you send are overridden."),
      required: z.boolean().optional(),
      maxPromptAttempts: z.number().min(1).max(3).optional(),
      noResponseBehavior: z.enum(["move_to_next_question", "end_conversation"]).optional(),
      triggerCondition: z.string().optional(),
      order: z.number().optional(),
      enabled: z.boolean().optional(),
      mappedFieldId: z.string().optional().nullable().describe("ID of an existing company Field to write this question's collected answer onto after each call."),
    },
    { title: "Create Voice Question", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async (body) => {
      try {
        const result = await api.post("/v1/voice/questions", body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "update_voice_question",
    "Partially update a voice agent question — only the fields you send are changed. Requires the OWNER or ADMIN role. agentId and templateId are fixed after create; sending them is silently dropped.",
    {
      fieldId: z.string().min(1).describe("ID of the question to update (from list_voice_questions)"),
      customConfig: customConfigSchema.optional(),
      required: z.boolean().optional(),
      maxPromptAttempts: z.number().min(1).max(3).optional(),
      noResponseBehavior: z.enum(["move_to_next_question", "end_conversation"]).optional(),
      triggerCondition: z.string().optional(),
      order: z.number().optional(),
      enabled: z.boolean().optional(),
      mappedFieldId: z.string().optional().nullable(),
    },
    { title: "Update Voice Question", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fieldId, ...body }) => {
      try {
        const result = await api.put(`/v1/voice/questions/${fieldId}`, body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "delete_voice_question",
    "Permanently remove a question from a voice agent and decrement the underlying template's usageCount. Requires the OWNER or ADMIN role. The template itself is not deleted and can be attached to another agent later.",
    { fieldId: z.string().min(1).describe("ID of the question to remove (from list_voice_questions)") },
    { title: "Delete Voice Question", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ fieldId }) => {
      try {
        const result = await api.delete(`/v1/voice/questions/${fieldId}`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "reorder_voice_questions",
    "Set the order a voice agent asks its questions in. Requires the OWNER or ADMIN role. Bulk-writes the order value on each listed question (written directly, not resequenced), then returns the agent's full question list in its new order. Entries whose fieldId doesn't belong to agentId are silently skipped.",
    {
      agentId: z.string().min(1),
      fieldOrders: z.array(z.object({ fieldId: z.string().min(1), order: z.number() })).min(1).describe("The new order for some or all of the agent's questions."),
    },
    { title: "Reorder Voice Questions", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (body) => {
      try {
        const result = await api.put("/v1/voice/questions/reorder", body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "list_voice_question_templates",
    "List the question templates visible to your company: Speak's shared system templates, plus your own company's templates. Use the returned templateId with create_voice_question.",
    { category: z.enum(["contact", "booking", "qualification", "payment", "custom"]).optional() },
    { title: "List Voice Question Templates", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (params) => {
      try {
        const result = await api.get("/v1/voice/question-templates", { params });
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "create_voice_question_template",
    "Create a company-scoped question template — the \"custom question\" a user names themselves rather than picking from Speak's shared library. Requires the OWNER or ADMIN role. The server stamps companyId and forces isSystemTemplate to false, so this template is only ever visible to your company.",
    {
      name: z.string().min(1),
      description: z.string().min(1),
      category: z.enum(["contact", "booking", "qualification", "payment", "custom"]),
      fieldType: z.enum(["email", "phone", "date", "time", "datetime", "text", "number", "boolean", "choice", "url"]),
      defaultConfig: z
        .object({
          displayLabel: z.string(),
          question: z.string().describe("The prompt text the agent speaks to ask this."),
          confirmationText: z.string().optional(),
          validationPrompt: z.string().optional(),
          validation: validationSchema.optional(),
        })
        .describe("displayLabel and question are both required within this object."),
      isPublic: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
    },
    { title: "Create Voice Question Template", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async (body) => {
      try {
        const result = await api.post("/v1/voice/question-templates", body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );
}
