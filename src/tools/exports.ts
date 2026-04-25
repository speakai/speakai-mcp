import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  server.tool(
    "export_media",
    "Export a media file's transcript or insights in various formats (pdf, docx, srt, vtt, txt, csv).",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
      fileType: z
        .enum(["pdf", "docx", "srt", "vtt", "txt", "csv"])
        .describe("Desired export format"),
      isSpeakerNames: z
        .boolean()
        .optional()
        .describe("Include speaker names in export"),
      isSpeakerEmail: z
        .boolean()
        .optional()
        .describe("Include speaker emails in export"),
      isTimeStamps: z
        .boolean()
        .optional()
        .describe("Include timestamps in export"),
      isInsightVisualized: z
        .boolean()
        .optional()
        .describe("Include insight visualizations"),
      isRedacted: z
        .boolean()
        .optional()
        .describe("Apply PII redaction to export"),
      redactedCategories: z
        .array(z.string())
        .optional()
        .describe("Specific categories to redact"),
    },
    {
      title: "Export Media Transcript",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ mediaId, fileType, ...body }) => {
      try {
        const result = await api.post(
          `/v1/media/export/${mediaId}/${fileType}`,
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

  server.tool(
    "export_multiple_media",
    "Export multiple media files at once, optionally merged into a single file.",
    {
      mediaIds: z
        .array(z.string())
        .describe("Array of media IDs to export"),
      fileType: z
        .enum(["pdf", "docx", "srt", "vtt", "txt", "csv"])
        .describe("Desired export format"),
      isSpeakerNames: z
        .boolean()
        .optional()
        .describe("Include speaker names in export"),
      isSpeakerEmail: z
        .boolean()
        .optional()
        .describe("Include speaker emails in export"),
      isTimeStamps: z
        .boolean()
        .optional()
        .describe("Include timestamps in export"),
      isInsightVisualized: z
        .boolean()
        .optional()
        .describe("Include insight visualizations"),
      isRedacted: z
        .boolean()
        .optional()
        .describe("Apply PII redaction to export"),
      isMerged: z
        .boolean()
        .optional()
        .describe("Merge all exports into a single file"),
      folderId: z
        .string()
        .optional()
        .describe("Folder ID for the merged export"),
    },
    {
      title: "Export Multiple Media Files",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.post(
          "/v1/media/exportMultiple",
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
