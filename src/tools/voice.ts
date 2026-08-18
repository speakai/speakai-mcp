import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

// Voice agents and conversations. These routes live under /v1/voice on the
// Speak server and are scoped to the API key holder's company (companyId is
// stamped server-side from the authenticated context, so no tenancy id is
// passed here). Read-only surface: list/get for agents and conversations.
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
}
