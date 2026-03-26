import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";
import { AssistantType } from "@speakai/shared";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  // ── Chat (Magic Prompt) ─────────────────────────────────────────────

  server.tool(
    "ask_magic_prompt",
    [
      "Ask an AI-powered question about your media using Speak AI's Magic Prompt.",
      "Supports querying a single file, multiple files, entire folders, or your whole workspace.",
      "Pass mediaIds for specific files, folderIds for entire folders, or omit both to search across all media.",
      "Use assistantType to get specialized responses (e.g., 'researcher' for academic analysis, 'sales' for deal insights).",
      "To continue a conversation, pass the promptId from a previous response.",
      "Returns a promptId — save it to continue the conversation with follow-up questions.",
    ].join(" "),
    {
      prompt: z.string().min(1).describe("The question or prompt to ask about the media"),
      mediaIds: z
        .array(z.string())
        .optional()
        .describe("Array of media IDs to query. Omit along with folderIds to search across all media in your workspace."),
      folderIds: z
        .array(z.string())
        .optional()
        .describe("Array of folder IDs to scope the query to. Omit along with mediaIds to search across all media."),
      folderId: z
        .string()
        .optional()
        .describe("Single folder ID to scope the query to. Use folderIds for multiple folders."),
      assistantType: z
        .enum(Object.values(AssistantType) as [string, ...string[]])
        .optional()
        .describe("Assistant persona: 'general' (default), 'researcher' (academic), 'marketer' (content), 'sales' (deals), 'recruiter' (hiring). Use 'custom' with assistantTemplateId."),
      assistantTemplateId: z
        .string()
        .optional()
        .describe("Required when assistantType is 'custom'. ID of a custom assistant template from list_prompts."),
      promptId: z
        .string()
        .optional()
        .describe("ID of an existing conversation to continue. Pass this to maintain chat context across multiple questions."),
      speakers: z
        .array(z.string())
        .optional()
        .describe("Filter to specific speaker IDs from the transcript"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Filter media by tags"),
      startDate: z
        .string()
        .optional()
        .describe("Start date for date range filter (ISO 8601, e.g., '2025-01-01')"),
      endDate: z
        .string()
        .optional()
        .describe("End date for date range filter (ISO 8601, e.g., '2025-03-31')"),
      isIndividualPrompt: z
        .boolean()
        .optional()
        .describe("When true, processes each media file separately instead of combining context. Useful for comparing responses across files."),
    },
    async (params) => {
      try {
        const result = await api.post("/v1/prompt", params);
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
    "retry_magic_prompt",
    "Retry a failed or incomplete Magic Prompt response. Use when a previous ask_magic_prompt call returned an error or incomplete answer.",
    {
      promptId: z.string().min(1).describe("ID of the conversation containing the failed message"),
      messageId: z.string().min(1).describe("ID of the specific message to retry"),
    },
    async (body) => {
      try {
        const result = await api.post("/v1/prompt/retry", body);
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

  // ── Chat History & Messages ─────────────────────────────────────────

  server.tool(
    "get_chat_history",
    "Get a list of recent Magic Prompt conversations. Returns conversation summaries with promptIds that can be used to continue conversations via ask_magic_prompt or retrieve full messages via get_chat_messages.",
    {
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Number of recent conversations to return (default: 10)"),
    },
    async ({ limit }) => {
      try {
        const result = await api.get("/v1/prompt/history", {
          params: limit ? { limit } : undefined,
        });
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
    "get_chat_messages",
    "Get full message history for conversations. Can filter by promptId for a specific conversation, by media/folder, or search across all chat messages. Returns questions, answers, references, and metadata.",
    {
      promptId: z
        .string()
        .optional()
        .describe("Filter to a specific conversation by its ID"),
      folderId: z
        .string()
        .optional()
        .describe("Filter messages by folder ID"),
      mediaIds: z
        .string()
        .optional()
        .describe("Filter by media IDs (comma-separated)"),
      query: z
        .string()
        .optional()
        .describe("Search text in prompts and answers"),
      page: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Page number for pagination (0-based, default: 0)"),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Results per page (default: 25, max: 500)"),
    },
    async (params) => {
      try {
        const result = await api.get("/v1/prompt/messages", { params });
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
    "delete_chat_message",
    "Delete a specific chat message from conversation history.",
    {
      promptId: z.string().min(1).describe("ID of the message to delete"),
    },
    async ({ promptId }) => {
      try {
        const result = await api.delete(`/v1/prompt/message/${promptId}`);
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

  // ── Prompt Templates & Favorites ────────────────────────────────────

  server.tool(
    "list_prompts",
    "List all available Magic Prompt templates. Use template IDs with ask_magic_prompt's assistantTemplateId parameter when using assistantType 'custom'.",
    {},
    async () => {
      try {
        const result = await api.get("/v1/prompt");
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
    "get_favorite_prompts",
    "Get all prompts and answers that have been marked as favorites. Useful for finding saved insights and important AI-generated analysis.",
    {},
    async () => {
      try {
        const result = await api.get("/v1/prompt/favorites");
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
    "toggle_prompt_favorite",
    "Mark or unmark a chat message as a favorite for easy retrieval later.",
    {
      promptId: z.string().min(1).describe("ID of the conversation"),
      messageId: z.string().min(1).describe("ID of the specific message to favorite/unfavorite"),
      isFavorite: z.boolean().describe("true to mark as favorite, false to remove"),
    },
    async (body) => {
      try {
        const result = await api.post("/v1/prompt/favorites", body);
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
    "update_chat_title",
    "Update the title of a chat conversation for easier identification in history.",
    {
      promptId: z.string().min(1).describe("ID of the conversation to rename"),
      title: z.string().min(1).describe("New title for the conversation"),
    },
    async ({ promptId, title }) => {
      try {
        const result = await api.put(`/v1/prompt/${promptId}`, { title });
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

  // ── Chat Feedback & Stats ───────────────────────────────────────────

  server.tool(
    "submit_chat_feedback",
    "Submit feedback on a chat response (thumbs up/down). Helps improve AI answer quality.",
    {
      promptId: z.string().min(1).describe("ID of the conversation"),
      messageId: z.string().min(1).describe("ID of the message to rate"),
      score: z.number().describe("Feedback score: 1 for thumbs up, -1 for thumbs down"),
      reason: z.string().optional().describe("Optional explanation for the feedback"),
    },
    async (body) => {
      try {
        const result = await api.post("/v1/prompt/feedback", body);
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
    "get_chat_statistics",
    "Get usage statistics for Magic Prompt / chat. Returns metrics on prompt usage, optionally filtered by date range.",
    {
      startDate: z.string().optional().describe("Start date for stats (ISO 8601)"),
      endDate: z.string().optional().describe("End date for stats (ISO 8601)"),
    },
    async (params) => {
      try {
        const result = await api.get("/v1/prompt/statistics", { params });
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
    "export_chat_answer",
    "Export a Magic Prompt conversation or answer. Useful for saving AI-generated summaries, reports, or analysis results.",
    {
      promptId: z.string().min(1).describe("ID of the conversation to export"),
    },
    async (body) => {
      try {
        const result = await api.post("/v1/prompt/export", body);
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
