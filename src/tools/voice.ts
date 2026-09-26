import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

// Voice agents and conversations, under /v1/voice; companyId is stamped server-side, no tenancy id is passed here.
const voiceInputSchema = {
  name: z.string().min(1).describe("Required on create. Trimmed, non-empty."),
  personality: z.string().describe("Required on create. Free text describing the agent's tone."),
  instructions: z.string().describe("Required on create. The agent's system instructions."),
  voice: z
    .object({
      provider: z.string().describe("TTS provider, e.g. elevenlabs or openai."),
      voiceId: z.string(),
      model: z.string().optional(),
    })
    .describe("Required on create."),
  llm: z
    .object({
      provider: z.string().optional().describe("Must be one of the voice-agent LLM providers if sent."),
      model: z.string().optional().describe("Must be one of the voice-agent model ids if sent."),
    })
    .optional(),
  avatar: z
    .object({
      avatarId: z
        .string()
        .describe("Must match a row in your company's avatar catalog (list_voice_avatars) or the shared system catalog."),
    })
    .optional()
    .describe("Set to attach a video avatar; avatarUrl/provider are derived server-side from the catalog row."),
  conversationMode: z.enum(["voice_only", "video_avatar"]).optional(),
  folderId: z.string().optional().describe("Folder to file this agent's conversations under."),
  enableWebSearch: z.boolean().optional().describe("Let the agent search the web mid-call, separate from any attached knowledge base."),
};

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "list_voice_agents",
    "List the voice agents in the company (newest first). Each agent includes its agentId, name, personality/instructions, and voice/stt/llm/avatar configuration. Use the returned agentId with get_voice_agent or to filter list_voice_conversations.",
    {},
    {
      title: "List Voice Agents",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/voice/agents");
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
    "get_voice_agent",
    "Fetch a single voice agent by its agentId. Returns the full agent configuration. A cross-company agentId returns 404.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
    },
    {
      title: "Get Voice Agent",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ agentId }) => {
      try {
        const result = await api.get(`/v1/voice/agents/${agentId}`);
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
    "list_voice_conversations",
    "List the company's voice conversations (newest first). Optionally filter to a single agent. Each conversation includes its conversationId, agentId, status, duration, transcript summary, and usage/costs. Use conversationId with get_voice_conversation for the full record.",
    {
      agentId: z.string().optional().describe("Filter conversations to a single agent (from list_voice_agents)"),
      page: z.number().int().min(1).optional().describe("1-based page index (default 1)"),
      limit: z.number().int().min(1).max(200).optional().describe("Results per page (default 50, max 200)"),
    },
    {
      title: "List Voice Conversations",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/voice/conversations", { params });
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
    "get_voice_conversation",
    "Fetch a single voice conversation by its conversationId, including transcript, usage, costs, and analysis. A cross-company conversationId returns 404.",
    {
      conversationId: z.string().min(1).describe("ID of the conversation (from list_voice_conversations)"),
    },
    {
      title: "Get Voice Conversation",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ conversationId }) => {
      try {
        const result = await api.get(`/v1/voice/conversations/${conversationId}`);
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
    "create_voice_agent",
    "Create a voice agent. Requires the OWNER or ADMIN role. name, personality, instructions, and voice (provider + voiceId) are required; everything else can be set now or later with update_voice_agent. Call list_voice_avatars or list_voices first to get valid ids.",
    voiceInputSchema,
    {
      title: "Create Voice Agent",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/voice/agents", body);
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
    "update_voice_agent",
    "Update a voice agent. Requires the OWNER or ADMIN role. Send only the fields you want to change; agentId, companyId, and userId are immutable and silently dropped if sent.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent to update (from list_voice_agents)"),
      ...Object.fromEntries(
        Object.entries(voiceInputSchema).map(([key, schema]) => [key, (schema as z.ZodTypeAny).optional()])
      ),
    },
    {
      title: "Update Voice Agent",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ agentId, ...body }) => {
      try {
        const result = await api.put(`/v1/voice/agents/${agentId}`, body);
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
    "list_voice_avatars",
    "List the video avatars available to attach to a voice agent (your company's own uploads plus the shared system catalog). Use the returned avatarId with create_voice_agent or update_voice_agent.",
    {},
    {
      title: "List Voice Avatars",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/voice/avatars");
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
    "list_voices",
    "List the text-to-speech voices available to a voice agent. Use the returned provider/voiceId with create_voice_agent or update_voice_agent's voice field. When an agent's llm.model is a Live (speech-to-speech) model, its usable voices are a fixed, smaller set scoped to that model instead of this full catalog.",
    {},
    {
      title: "List Voices",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/voice/voices");
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
    "delete_voice_agent",
    "Permanently delete a voice agent. Requires the OWNER or ADMIN role. Irreversible: also removes its questions, test suite, and share link; past conversations are kept for record-keeping but are no longer reachable from this agent.",
    { agentId: z.string().min(1).describe("ID of the voice agent to delete (from list_voice_agents)") },
    { title: "Delete Voice Agent", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ agentId }) => {
      try {
        const result = await api.delete(`/v1/voice/agents/${agentId}`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "create_voice_agent_from_prompt",
    "Create a new voice agent by describing it in plain English instead of filling in name/personality/instructions/voice yourself. Requires the OWNER or ADMIN role. Response always includes the new agentId, plus either the generated agent config, or needsFollowUp: true with a follow-up question if the prompt was too thin to act on — call generate_voice_agent_config again on that agentId with more detail (or manualInstructions) when that happens.",
    {
      prompt: z.string().min(1).describe("Plain-English description of the agent to build, e.g. \"a friendly dental clinic receptionist that books appointments and answers insurance questions\"."),
      name: z.string().optional().describe("Agent name. Defaults to one derived from the prompt if omitted."),
      manualInstructions: z.string().optional().describe("Skip generation and use this as the agent's instructions verbatim."),
    },
    { title: "Create Voice Agent From Prompt", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async (body) => {
      try {
        const result = await api.post("/v1/voice/agents/generation", body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "generate_voice_agent_config",
    "Run the same prompt-to-config generation as create_voice_agent_from_prompt, but against an existing agent instead of creating a new one. Requires the OWNER or ADMIN role. On success the generated config is persisted onto the agent immediately. If the prompt is too thin and manualInstructions was not sent, the response has needsFollowUp: true with a follow-up question instead — call this again with more detail.",
    {
      agentId: z.string().min(1).describe("ID of the existing voice agent to generate config for (from list_voice_agents)"),
      prompt: z.string().min(1).describe("Plain-English description of what the agent should do."),
      manualInstructions: z.string().optional().describe("Skip generation and set the agent's instructions to this verbatim."),
    },
    { title: "Generate Voice Agent Config", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    async ({ agentId, ...body }) => {
      try {
        const result = await api.post(`/v1/voice/agents/${agentId}/generation/generate`, body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "get_voice_agent_setup_guide",
    "Discovery + how-to helper for building and operating a Speak AI voice agent end to end. Returns the four configuration pieces every agent is built from, which tool covers each one, the recommended build order, and how testing/questions/knowledge-base/intelligence tools chain together after the agent exists. Call this before create_voice_agent or create_voice_agent_from_prompt if you are not already familiar with this tool surface.",
    {},
    { title: "Get Voice Agent Setup Guide", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async () => {
      const data = {
        overview:
          "A voice agent is a standalone resource: create it once, then it holds live spoken conversations, asking configured questions and answering from a knowledge base. It is built from four independent pieces, plus optional testing, sharing, and self-improvement layers.",
        buildOrder: [
          {
            step: 1,
            piece: "The agent record itself",
            tools: ["create_voice_agent", "create_voice_agent_from_prompt"],
            notes: "name, personality, instructions, and voice (provider+voiceId) are the only required fields. Call list_voices and list_voice_avatars first to get valid ids.",
          },
          {
            step: 2,
            piece: "Voice & avatar",
            tools: ["list_voices", "list_voice_avatars", "update_voice_agent"],
            notes: "Every agent needs a voice. It only needs an avatar if conversationMode is video_avatar.",
          },
          {
            step: 3,
            piece: "Instructions & behavior",
            tools: ["update_voice_agent", "generate_voice_agent_config"],
            notes: "personality/instructions are plain fields on the agent record; generate_voice_agent_config can (re)write them from a prompt instead of hand-authoring.",
          },
          {
            step: 4,
            piece: "Questions",
            tools: ["list_voice_question_templates", "create_voice_question", "reorder_voice_questions"],
            notes: "Optional. Attaches a question template to the agent so it collects structured data mid-call. See the Questions tool group.",
          },
          {
            step: 5,
            piece: "Knowledge base",
            tools: ["Knowledge Base tool group (separate from voice agents)"],
            notes: "Optional. A knowledge base collection is attached to the agent from the Knowledge Base API, not a voice-agent tool -- an agent has no documents of its own until one is attached.",
          },
        ],
        afterTheAgentExists: [
          {
            area: "Testing",
            tools: ["get_voice_test_suite", "update_voice_test_suite", "generate_voice_test_suite", "start_voice_test_run"],
            notes: "Scripted scenarios and a run history. The run lifecycle is live; the engine that drives a simulated conversation is not wired up yet, so a run stays queued.",
          },
          {
            area: "Feedback / self-improvement (Intelligence)",
            tools: [
              "list_voice_kb_gaps",
              "list_voice_faq_suggestions",
              "analyze_voice_instruction_gaps",
              "list_voice_agent_resources",
            ],
            notes: "What the agent surfaces from real calls: knowledge it lacked, questions callers repeat, and gaps in its own instructions. Nothing is written automatically -- every suggestion needs an explicit add/apply/dismiss call.",
          },
          {
            area: "Conversations & analytics",
            tools: ["list_voice_conversations", "get_voice_conversation"],
            notes: "Read call history and transcripts once the agent has taken calls.",
          },
        ],
        commonMistakes: [
          "Calling create_voice_agent with a made-up voiceId instead of one from list_voices -- the create call fails validation.",
          "Expecting start_voice_test_run to return real scores -- the execution engine isn't wired up yet, see the Testing tools' own descriptions.",
          "Looking for a knowledge-base tool in this group -- collections are managed by the separate Knowledge Base tool group and only attached here.",
        ],
      };
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}
