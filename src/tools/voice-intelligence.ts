import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

// A voice agent's self-improvement surface (knowledge gaps, FAQ suggestions, instruction gaps) and its knowledge-base resources, under /v1/voice.
const resourceBodySchema = {
  url: z.string().url(),
  title: z.string().max(200),
  description: z.string().max(1000),
  action: z.enum(["link", "presentation"]),
  contentType: z.enum(["video", "pdf", "image"]).optional(),
};

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "list_voice_kb_gaps",
    "List a voice agent's pending knowledge-base gaps — questions callers asked that the agent answered with low confidence or an explicit \"I don't know,\" surfaced automatically after calls. Up to the 50 most recent pending gaps, newest first.",
    { agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)") },
    { title: "List Voice KB Gaps", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ agentId }) => {
      try {
        const result = await api.get(`/v1/voice/knowledge-base/${agentId}/gaps`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "analyze_voice_kb_gaps",
    "Trigger knowledge-base gap analysis over a voice agent's recent calls. Requires the OWNER or ADMIN role. Runs in the background and returns immediately — new gaps appear in list_voice_kb_gaps once analysis finishes, not synchronously with this response.",
    { agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)") },
    { title: "Analyze Voice KB Gaps", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ agentId }) => {
      try {
        const result = await api.post(`/v1/voice/knowledge-base/${agentId}/gaps/analyze`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "add_voice_kb_gap",
    "Write a knowledge-base gap's answer into the voice agent's attached knowledge base as a new document, and mark the gap added. Requires the OWNER or ADMIN role. Fails with 409 if the gap was already added or dismissed, or if the agent has no knowledge base collection to write into.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      gapId: z.string().min(1).describe("ID of the gap (from list_voice_kb_gaps)"),
      answer: z.string().optional().describe("Overrides the gap's suggested answer."),
      title: z.string().optional().describe("Overrides the gap's suggested title."),
    },
    { title: "Add Voice KB Gap", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ agentId, gapId, ...body }) => {
      try {
        const result = await api.post(`/v1/voice/knowledge-base/${agentId}/gaps/${gapId}/add`, body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "dismiss_voice_kb_gap",
    "Mark a voice agent's knowledge-base gap dismissed without writing anything to the knowledge base. Requires the OWNER or ADMIN role.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      gapId: z.string().min(1).describe("ID of the gap (from list_voice_kb_gaps)"),
    },
    { title: "Dismiss Voice KB Gap", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ agentId, gapId }) => {
      try {
        const result = await api.delete(`/v1/voice/knowledge-base/${agentId}/gaps/${gapId}`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "list_voice_faq_suggestions",
    "List a voice agent's pending FAQ suggestions — questions multiple callers asked in similar form, clustered and drafted into a reusable question/answer pair. Up to the 20 largest clusters, largest first.",
    { agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)") },
    { title: "List Voice FAQ Suggestions", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ agentId }) => {
      try {
        const result = await api.get(`/v1/voice/knowledge-base/${agentId}/faqs`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "generate_voice_faq_suggestions",
    "Trigger FAQ clustering over a voice agent's recent calls. Requires the OWNER or ADMIN role. Runs in the background and returns immediately — new suggestions appear in list_voice_faq_suggestions once generation finishes, not synchronously with this response.",
    { agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)") },
    { title: "Generate Voice FAQ Suggestions", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ agentId }) => {
      try {
        const result = await api.post(`/v1/voice/knowledge-base/${agentId}/faqs/generate`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "add_voice_faq_suggestion",
    "Write an FAQ suggestion's question/answer into the voice agent's attached knowledge base as a new document, and mark the suggestion added. Requires the OWNER or ADMIN role. Fails with 409 if the suggestion was already added or dismissed, or if the agent has no knowledge base collection to write into.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      suggestionId: z.string().min(1).describe("ID of the suggestion (from list_voice_faq_suggestions)"),
      question: z.string().optional().describe("Overrides the suggested question."),
      answer: z.string().optional().describe("Overrides the suggested answer."),
    },
    { title: "Add Voice FAQ Suggestion", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ agentId, suggestionId, ...body }) => {
      try {
        const result = await api.post(`/v1/voice/knowledge-base/${agentId}/faqs/${suggestionId}/add`, body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "update_voice_faq_suggestion",
    "Edit a still-pending FAQ suggestion's question and/or answer before adding it. Requires the OWNER or ADMIN role. Fails with 400 if the suggestion was already added or dismissed.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      suggestionId: z.string().min(1).describe("ID of the suggestion (from list_voice_faq_suggestions)"),
      question: z.string().optional(),
      answer: z.string().optional(),
    },
    { title: "Update Voice FAQ Suggestion", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ agentId, suggestionId, ...body }) => {
      try {
        const result = await api.put(`/v1/voice/knowledge-base/${agentId}/faqs/${suggestionId}`, body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "dismiss_voice_faq_suggestion",
    "Mark a voice agent's FAQ suggestion dismissed without writing anything to the knowledge base. Requires the OWNER or ADMIN role.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      suggestionId: z.string().min(1).describe("ID of the suggestion (from list_voice_faq_suggestions)"),
    },
    { title: "Dismiss Voice FAQ Suggestion", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ agentId, suggestionId }) => {
      try {
        const result = await api.delete(`/v1/voice/knowledge-base/${agentId}/faqs/${suggestionId}`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "list_voice_agent_resources",
    "List the knowledge documents/links a voice agent searches during calls — separate from KB gaps and FAQ suggestions, which are the self-improvement layer that surfaces what an agent is missing, not the content itself.",
    {
      agentId: z.string().optional(),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).optional(),
      search: z.string().optional().describe("Search by title/description."),
    },
    { title: "List Voice Agent Resources", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (params) => {
      try {
        const result = await api.get("/v1/voice/agent-resources", { params });
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "create_voice_agent_resource",
    "Add one document/link to a voice agent's knowledge base. Requires the OWNER or ADMIN role. The server fetches and embeds the content in the background (status moves from pending to completed).",
    { agentId: z.string().min(1), ...resourceBodySchema },
    { title: "Create Voice Agent Resource", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (body) => {
      try {
        const result = await api.post("/v1/voice/agent-resources", body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "bulk_create_voice_agent_resources",
    "Add up to 100 documents/links to a voice agent's knowledge base in one call. Requires the OWNER or ADMIN role. Each is fetched and embedded independently in the background. Use this instead of calling create_voice_agent_resource in a loop.",
    {
      agentId: z.string().min(1),
      resources: z
        .array(z.object(resourceBodySchema))
        .min(1)
        .max(100)
        .describe("1 to 100 entries, each shaped like create_voice_agent_resource's body minus agentId."),
    },
    { title: "Bulk Create Voice Agent Resources", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (body) => {
      try {
        const result = await api.post("/v1/voice/agent-resources/bulk", body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "update_voice_agent_resource",
    "Partially update a voice agent resource — send at least one field. Requires the OWNER or ADMIN role. agentId cannot be changed. Changing url, title, or description re-triggers embedding.",
    {
      resourceId: z.string().min(1).describe("ID of the resource to update (from list_voice_agent_resources)"),
      url: z.string().url().optional(),
      title: z.string().max(200).optional(),
      description: z.string().max(1000).optional(),
      action: z.enum(["link", "presentation"]).optional(),
      contentType: z.enum(["video", "pdf", "image"]).optional(),
    },
    { title: "Update Voice Agent Resource", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ resourceId, ...body }) => {
      try {
        const result = await api.put(`/v1/voice/agent-resources/${resourceId}`, body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "delete_voice_agent_resource",
    "Soft-delete a voice agent resource — it stops appearing in lists and the agent stops searching it, but the document is not physically removed. Requires the OWNER or ADMIN role.",
    { resourceId: z.string().min(1).describe("ID of the resource to delete (from list_voice_agent_resources)") },
    { title: "Delete Voice Agent Resource", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ resourceId }) => {
      try {
        const result = await api.delete(`/v1/voice/agent-resources/${resourceId}`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "analyze_voice_instruction_gaps",
    "Advisory only — compares a voice agent's current instructions against anchors/original intent/recent call summaries you supply and suggests up to 3 patches. Requires the OWNER or ADMIN role. Nothing is written; pass a suggestion's suggestedPatch to apply_voice_instruction_gap to actually apply it.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      anchors: z.array(z.string()).optional().describe("Specific requirements the instructions must cover. Defaults to empty."),
      originalPrompt: z.string().optional().describe("The original generation prompt, for context."),
      conversationSummaries: z.array(z.string()).optional().describe("Recent call summaries, to ground suggestions in what actually came up. Defaults to empty."),
    },
    { title: "Analyze Voice Instruction Gaps", readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ agentId, ...body }) => {
      try {
        const result = await api.post(`/v1/voice/agents/${agentId}/generation/gaps/analyze`, body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "apply_voice_instruction_gap",
    "Insert a suggested instruction patch into a voice agent's instructions and persist the result. Requires the OWNER or ADMIN role. suggestedPatch is typically taken directly from analyze_voice_instruction_gaps.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      suggestedPatch: z.string().min(1),
      insertAfterSection: z.string().optional().nullable().describe("Insert after this named section heading; omit or null to append at the end."),
    },
    { title: "Apply Voice Instruction Gap", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ agentId, ...body }) => {
      try {
        const result = await api.post(`/v1/voice/agents/${agentId}/generation/gaps/apply`, body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );
}
