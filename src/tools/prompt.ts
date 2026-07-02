import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";
import { AssistantType } from "@speakai/shared";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  // ── Chat (AI Chat) ──────────────────────────────────────────────────

  const askAiChatDescription = [
    "Ask an AI-powered question about your media using Speak AI's AI Chat.",
    "Supports querying a single file, multiple files, entire folders, or your whole workspace.",
    "Pass mediaIds for specific files, folderIds for entire folders, or omit both to search across all media.",
    "Use assistantType to get specialized responses (e.g., 'researcher' for academic analysis, 'sales' for deal insights).",
    "To continue a conversation, pass the promptId from a previous response.",
    "Returns a promptId — save it to continue the conversation with follow-up questions.",
  ].join(" ");

  const askAiChatInputSchema = {
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
    fieldId: z
      .string()
      .optional()
      .describe("Scope the prompt to a single custom field"),
    fieldIds: z
      .array(z.string())
      .max(10)
      .optional()
      .describe("Scope the prompt to multiple custom fields (max 10)"),
    filters: z
      .record(z.unknown())
      .optional()
      .describe("Advanced filter object to scope which media the prompt runs over"),
  };

  const askAiChatAnnotations = {
    title: "Ask AI Chat",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };

  const askAiChatHandler = async (params: unknown) => {
    try {
      const result = await api.post("/v1/prompt", params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${formatAxiosError(err)}` }],
        isError: true,
      };
    }
  };

  registerSpeakTool(
    server,
    "ask_ai_chat",
    askAiChatDescription,
    askAiChatInputSchema,
    askAiChatAnnotations,
    askAiChatHandler
  );

  // Backward-compat alias — keeps existing clients calling the old name working.
  registerSpeakTool(
    server,
    "ask_magic_prompt",
    `[Deprecated — use ask_ai_chat] ${askAiChatDescription}`,
    askAiChatInputSchema,
    askAiChatAnnotations,
    askAiChatHandler
  );

  registerSpeakTool(server, 
    "retry_magic_prompt",
    "Retry a failed or incomplete AI Chat response. Use when a previous ask_ai_chat call returned an error or incomplete answer.",
    {
      promptId: z.string().min(1).describe("ID of the conversation containing the failed message"),
      messageId: z.string().min(1).describe("ID of the specific message to retry"),
    },
    {
      title: "Retry AI Question",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
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

  registerSpeakTool(server, 
    "get_chat_history",
    "Get a list of recent AI Chat conversations. Returns conversation summaries with promptIds that can be used to continue conversations via ask_ai_chat or retrieve full messages via get_chat_messages.",
    {
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Number of recent conversations to return (default: 10)"),
    },
    {
      title: "Get Chat History",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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

  registerSpeakTool(server, 
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
    {
      title: "Get Chat Messages",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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

  registerSpeakTool(server, 
    "delete_chat_message",
    "Delete a specific chat message from conversation history.",
    {
      promptId: z.string().min(1).describe("ID of the message to delete"),
    },
    {
      title: "Delete Chat Message",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
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

  registerSpeakTool(server, 
    "list_prompts",
    "List all available AI Chat templates. Use template IDs with ask_ai_chat's assistantTemplateId parameter when using assistantType 'custom'.",
    {},
    {
      title: "List Prompt Templates",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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

  registerSpeakTool(server, 
    "get_favorite_prompts",
    "Get all prompts and answers that have been marked as favorites. Useful for finding saved insights and important AI-generated analysis.",
    {},
    {
      title: "Get Favorite Prompts",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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

  registerSpeakTool(server, 
    "toggle_prompt_favorite",
    "Mark or unmark a chat message as a favorite for easy retrieval later.",
    {
      promptId: z.string().min(1).describe("ID of the conversation"),
      messageId: z.string().min(1).describe("ID of the specific message to favorite/unfavorite"),
      isFavorite: z.boolean().describe("true to mark as favorite, false to remove"),
    },
    {
      title: "Toggle Prompt Favorite",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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

  registerSpeakTool(server, 
    "update_chat_title",
    "Update the title of a chat conversation for easier identification in history.",
    {
      promptId: z.string().min(1).describe("ID of the conversation to rename"),
      title: z.string().min(1).describe("New title for the conversation"),
    },
    {
      title: "Rename Chat",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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

  registerSpeakTool(server, 
    "submit_chat_feedback",
    "Submit feedback on a chat response (thumbs up/down). Helps improve AI answer quality.",
    {
      promptId: z.string().min(1).describe("ID of the conversation"),
      messageId: z.string().min(1).describe("ID of the message to rate"),
      score: z
        .union([z.literal(1), z.literal(-1)])
        .describe("Feedback score: 1 for thumbs up, -1 for thumbs down"),
      reason: z.string().optional().describe("Optional explanation for the feedback"),
    },
    {
      title: "Submit Chat Feedback",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
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

  registerSpeakTool(server, 
    "get_chat_statistics",
    "Get usage statistics for AI Chat / chat. Returns metrics on prompt usage, optionally filtered by date range.",
    {
      startDate: z.string().optional().describe("Start date for stats (ISO 8601)"),
      endDate: z.string().optional().describe("End date for stats (ISO 8601)"),
    },
    {
      title: "Get Chat Statistics",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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

  registerSpeakTool(server, 
    "export_chat_answer",
    "Export a specific AI Chat answer. Useful for saving AI-generated summaries, reports, or analysis results.",
    {
      promptId: z.string().min(1).describe("ID of the conversation to export"),
      messageId: z.string().min(1).describe("ID of the specific message/answer to export"),
      fileType: z
        .enum(["txt", "docx", "pdf", "md"])
        .describe("Export file format"),
    },
    {
      title: "Export Chat Answer",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
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
