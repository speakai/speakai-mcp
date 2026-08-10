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
    "Set analysisMediaId + analysisInput to have the model listen to the audio or watch the video instead of",
    "reading the transcript alone. That is a premium feature and costs credits per hour of media —",
    "call get_analysis_quote first to check eligibility and price.",
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
    analysisMediaId: z
      .string()
      .optional()
      .describe("Media to analyse as audio/video rather than transcript. Must also appear in mediaIds, and must be sent together with analysisInput. Premium feature."),
    analysisInput: z
      .enum(["audio", "video"])
      .optional()
      .describe("'audio' lets the model hear tone, pacing and delivery; 'video' also lets it see what is on screen. Omit for transcript-only, which is the default and costs nothing extra. 'transcript' is not a valid value here — omitting the field IS transcript-only."),
  };

  const askAiChatAnnotations = {
    title: "Ask AI Chat",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };

  /**
   * Audio-only analysis on a VIDEO extracts the audio track first. The "awaiting" state the
   * server offers exists only for automation runs; a direct POST blocks while it polls, for
   * up to five minutes, then answers from the transcript if it gives up. The default 60s
   * client timeout would abort a run the account is already being charged for.
   */
  const ANALYSIS_TIMEOUT_MS = 6 * 60 * 1000;

  const refuse = (message: string) => ({
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true as const,
  });

  /**
   * Report what the media pass actually did.
   *
   * The POST response carries only {promptId, messageId, state, answer, totalMedia,
   * references} — it never says whether the media was used. A run that downgrades to the
   * transcript (extraction failed or timed out) still returns a normal, confident-looking
   * answer. Reading it back is the only way to tell, and an assistant that cannot tell will
   * present a transcript answer as if the model had listened to the recording.
   *
   * Best-effort: a failure here must not lose the answer the caller already paid for.
   */
  const withAnalysisOutcome = async (payload: unknown, messageId?: string): Promise<unknown> => {
    if (!messageId) return payload;
    try {
      const res = await api.get("/v1/prompt/messages", { params: { messageId } });
      const messages = res.data?.data?.messages ?? res.data?.data ?? [];
      const list = Array.isArray(messages) ? messages : [];
      const match = list.find((m: { messageId?: string }) => m?.messageId === messageId) ?? list[0];
      const analysis = match?.analysis;
      if (!analysis) return payload;

      const downgraded = analysis.requested && analysis.used && analysis.requested !== analysis.used;
      return {
        ...(payload as Record<string, unknown>),
        analysis,
        ...(downgraded
          ? {
              analysisWarning:
                `Requested ${analysis.requested} analysis but the answer came from the ${analysis.used}. ` +
                (analysis.skippedReason ?? "No reason was given."),
            }
          : {}),
      };
    } catch {
      return payload;
    }
  };

  const askAiChatHandler = async (params: unknown) => {
    const body = (params ?? {}) as Record<string, unknown>;
    const analysisMediaId = typeof body.analysisMediaId === "string" ? body.analysisMediaId.trim() : "";
    const analysisInput = typeof body.analysisInput === "string" ? body.analysisInput.trim() : "";

    // The server enforces both of these with a Joi .custom() and answers 400. Checking here
    // turns a wasted round trip into an actionable message the model can fix on its own.
    if (Boolean(analysisMediaId) !== Boolean(analysisInput)) {
      return refuse(
        "analysisMediaId and analysisInput must be provided together. " +
          "Pass both to analyse audio/video, or neither for a transcript-only answer.",
      );
    }
    const mediaIds = Array.isArray(body.mediaIds) ? (body.mediaIds as unknown[]).map(String) : [];
    if (analysisMediaId && !mediaIds.includes(analysisMediaId)) {
      return refuse(
        `analysisMediaId "${analysisMediaId}" must also appear in mediaIds. ` +
          `mediaIds is currently ${mediaIds.length ? JSON.stringify(mediaIds) : "empty"}.`,
      );
    }

    try {
      // Two call shapes on purpose: a transcript-only request must reach axios exactly as it
      // always has, with no third argument, so nothing about the existing path shifts.
      const result = analysisInput
        ? await api.post("/v1/prompt", params, { timeout: ANALYSIS_TIMEOUT_MS })
        : await api.post("/v1/prompt", params);
      const payload = analysisInput
        ? await withAnalysisOutcome(result.data, result.data?.data?.messageId)
        : result.data;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
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

  registerSpeakTool(server,
    "get_analysis_quote",
    "Check whether a media file can be analysed as audio or video, and what it will cost, before running ask_ai_chat with analysisInput. " +
      "Returns { eligible, credits, seconds } and, when not eligible, a plain-English reason — an unavailable file is a normal result here, not an error. " +
      "This is the only check that accounts for both the account's premium opt-in and the server-wide switch, so call it before committing to an expensive run.",
    {
      mediaId: z.string().min(1).describe("Media file to price"),
      analysisInput: z
        .enum(["audio", "video"])
        .describe("'audio' to hear the recording, 'video' to also see it. Video costs substantially more because frames dominate."),
      modelId: z
        .string()
        .optional()
        .describe("Optional model id to price against. Omit for the workspace default."),
    },
    {
      title: "Get Analysis Quote",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/prompt/analysisQuote", { params });
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
    "retry_ai_chat",
    "Retry a failed or incomplete AI Chat response. Use when a previous ask_ai_chat call returned an error or incomplete answer.",
    {
      promptId: z.string().min(1).describe("ID of the conversation containing the failed message"),
      messageId: z.string().min(1).describe("ID of the specific message to retry"),
    },
    {
      title: "Retry AI Chat",
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
