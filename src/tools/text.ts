import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  server.tool(
    "create_text_note",
    "Create a new text note in Speak AI for analysis. The content will be analyzed for insights, topics, and sentiment.",
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
        .describe("Webhook callback URL for completion notification"),
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
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/text/create", body);
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

  server.tool(
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
      openWorldHint: true,
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

  server.tool(
    "reanalyze_text",
    "Trigger a re-analysis of an existing text note to regenerate insights with the latest AI models.",
    {
      mediaId: z
        .string()
        .describe("Unique identifier of the text note to reanalyze"),
    },
    {
      title: "Re-analyze Text Note",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/text/reanalyze/${mediaId}`);
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

  server.tool(
    "update_text_note",
    "Update an existing text note's name, content, or metadata. Updating text content will trigger re-analysis.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the text note"),
      name: z.string().optional().describe("New name for the text note"),
      text: z
        .string()
        .optional()
        .describe("New text content (will trigger re-analysis)"),
      description: z.string().optional().describe("Updated description"),
      folderId: z.string().optional().describe("Move to a different folder"),
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
        const result = await api.put(
          `/v1/text/update/${mediaId}`,
          body
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
