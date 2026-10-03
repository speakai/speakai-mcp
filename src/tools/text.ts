import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  registerSpeakTool(server, 
    "create_text_note",
    "Create a new text note in Speak AI for analysis. The content will be analyzed for insights, topics, and sentiment. Uses one text note from the plan allowance, or charges credits or account balance once the allowance is used up, and fails if the balance is insufficient. Sends the text.created and text.analyzed events to the workspace's webhooks and Slack channels if any are configured.",
    {
      name: z.string().min(1).describe("Title/name for the text note"),
      text: z.string().optional().describe("Full text content to analyze"),
      description: z.string().optional().describe("Description for the text note"),
      folderId: z
        .string()
        .optional()
        .describe("ID of the folder to place the note in"),
      tags: z
        .string()
        .optional()
        .describe("Comma-separated tags or array of tag strings"),
      callbackUrl: z
        .string()
        .optional()
        .describe("URL that replaces the workspace webhook's destination for this note's webhook events. It takes effect only when the workspace already has an active webhook for the event; on its own it does not create a webhook or send anything."),
      fields: z
        .array(
          z.object({
            id: z.string().min(1).describe("Custom field ID"),
            value: z.string().min(1).describe("Custom field value"),
          })
        )
        .optional()
        .describe("Custom field values to attach to the text note"),
    },
    {
      title: "Create Text Note",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (body) => {
      try {
        // The endpoint analyzes and counts words only from `rawText`; without it the note is saved unanalyzed.
        const payload = body.text !== undefined ? { ...body, rawText: body.text } : body;
        const result = await api.post("/v1/text/create", payload);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "get_text_insight",
    "Retrieve AI-generated insights for a text note, including topics, sentiment, summaries, and action items.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the text note"),
    },
    {
      title: "Get Text Note Insights",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/text/insight/${mediaId}`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "reanalyze_text",
    "Trigger a re-analysis of an existing text note to regenerate insights with the latest AI models. Overwrites the note's current insights and sentiment. Sends the text.reanalyzed event to the workspace's webhooks and Slack channels if any are configured.",
    {
      mediaId: z
        .string()
        .describe("Unique identifier of the text note to reanalyze"),
    },
    {
      title: "Re-analyze Text Note",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/media/reanalyze/${mediaId}`, {
          params: { isInsights: true, isSentiment: true, isFillerWords: true, isEmbeddings: true },
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "update_text_note",
    "Update an existing text note's name, content, or metadata. New text replaces the existing text. A note that has not been analyzed yet is analyzed after the update; an already analyzed note is not re-analyzed, so call reanalyze_text afterwards if its insights should reflect the new text. Sends the media.updated event to the workspace's webhooks and Slack channels if any are configured.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the text note"),
      name: z.string().optional().describe("New name for the text note"),
      text: z
        .string()
        .optional()
        .describe("New text content. Replaces the existing text of the note."),
      description: z.string().optional().describe("Updated description"),
      tags: z
        .string()
        .optional()
        .describe("Updated comma-separated tags"),
    },
    {
      title: "Update Text Note",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ mediaId, ...body }) => {
      try {
        // The endpoint keys its word-count/text update entirely off `rawText`;
        // sending `text` without it is silently treated as "clear the text".
        const payload = body.text !== undefined ? { ...body, rawText: body.text } : body;
        const result = await api.put(
          `/v1/text/update/${mediaId}`,
          payload
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
