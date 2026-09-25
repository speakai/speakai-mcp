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
}
