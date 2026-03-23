import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer): void {
  // 1. Get signed upload URL
  server.tool(
    "get_signed_upload_url",
    "Get a pre-signed S3 URL for direct media file upload. Use this before uploading a file directly to Speak AI storage.",
    {
      isVideo: z
        .boolean()
        .describe("Set true for video files, false for audio files"),
      filename: z.string().describe("Original filename including extension"),
      mimeType: z
        .string()
        .describe('MIME type of the file, e.g. "audio/mp4" or "video/mp4"'),
    },
    async ({ isVideo, filename, mimeType }) => {
      try {
        const result = await speakClient.get("/v1/media/upload/signedurl", {
          params: { isVideo, filename, mimeType },
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

  // 2. Upload media
  server.tool(
    "upload_media",
    "Upload a media file to Speak AI by providing a publicly accessible URL. Speak AI will fetch and process the file asynchronously.",
    {
      name: z.string().describe("Display name for the media file"),
      url: z
        .string()
        .describe("Publicly accessible URL of the media file (or pre-signed S3 URL)"),
      mediaType: z
        .enum(["audio", "video"])
        .describe('Type of media: "audio" or "video"'),
      description: z.string().optional().describe("Description of the media file"),
      sourceLanguage: z
        .string()
        .optional()
        .describe('BCP-47 language code for transcription, e.g. "en-US" or "he-IL"'),
      tags: z
        .string()
        .optional()
        .describe("Comma-separated tags for the media"),
      folderId: z
        .string()
        .optional()
        .describe("ID of the folder to place the media in"),
      callbackUrl: z
        .string()
        .optional()
        .describe("Webhook callback URL for this specific upload"),
      fields: z
        .array(
          z.object({
            id: z.string().describe("Custom field ID"),
            value: z.string().describe("Custom field value"),
          })
        )
        .optional()
        .describe("Custom field values to attach to the media"),
    },
    async (body) => {
      try {
        const result = await speakClient.post("/v1/media/upload", body);
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

  // 3. List media
  server.tool(
    "list_media",
    "List all media files in the workspace with optional filtering, pagination, and sorting.",
    {
      mediaType: z
        .enum(["audio", "video", "text"])
        .optional()
        .describe('Filter by media type: "audio", "video", or "text"'),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Page number for pagination (default: 1)"),
      pageSize: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Number of results per page (default: 20)"),
      sortBy: z
        .string()
        .optional()
        .describe('Sort field and direction, e.g. "createdAt:desc" or "name:asc"'),
      filterMedia: z
        .number()
        .int()
        .optional()
        .describe("Filter: 0=Uploaded, 1=Assigned, 2=Both (default: 2)"),
      filterName: z
        .string()
        .optional()
        .describe("Filter media by partial name match"),
      folderId: z
        .string()
        .optional()
        .describe("Filter media within a specific folder"),
      from: z
        .string()
        .optional()
        .describe("Start date for date range filter (ISO 8601)"),
      to: z
        .string()
        .optional()
        .describe("End date for date range filter (ISO 8601)"),
      isFavorites: z
        .boolean()
        .optional()
        .describe("Filter to only show favorited media"),
    },
    async (params) => {
      try {
        const result = await speakClient.get("/v1/media", { params });
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

  // 4. Get media insights
  server.tool(
    "get_media_insights",
    "Retrieve AI-generated insights for a media file, including topics, sentiment, action items, and summaries.",
    {
      mediaId: z.string().describe("Unique identifier of the media file"),
    },
    async ({ mediaId }) => {
      try {
        const result = await speakClient.get(`/v1/media/insight/${mediaId}`);
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

  // 5. Get transcript
  server.tool(
    "get_transcript",
    "Retrieve the full transcript for a media file, including speaker labels and timestamps.",
    {
      mediaId: z.string().describe("Unique identifier of the media file"),
    },
    async ({ mediaId }) => {
      try {
        const result = await speakClient.get(`/v1/media/transcript/${mediaId}`);
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

  // 6. Update transcript speakers
  server.tool(
    "update_transcript_speakers",
    "Update or rename speaker labels in a media transcript.",
    {
      mediaId: z.string().describe("Unique identifier of the media file"),
      speakers: z
        .array(
          z.object({
            id: z.string().describe("Speaker identifier from the transcript"),
            name: z.string().describe("Display name to assign to the speaker"),
          })
        )
        .describe("Array of speaker ID to name mappings"),
    },
    async ({ mediaId, speakers }) => {
      try {
        const result = await speakClient.put(
          `/v1/media/speakers/${mediaId}`,
          speakers
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

  // 7. Get media status
  server.tool(
    "get_media_status",
    "Check the processing status of a media file (e.g. pending, transcribing, completed, failed).",
    {
      mediaId: z.string().describe("Unique identifier of the media file"),
    },
    async ({ mediaId }) => {
      try {
        const result = await speakClient.get(`/v1/media/status/${mediaId}`);
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

  // 8. Update media metadata
  server.tool(
    "update_media_metadata",
    "Update metadata fields (name, description, tags, status) for an existing media file.",
    {
      mediaId: z.string().describe("Unique identifier of the media file"),
      name: z.string().optional().describe("New display name for the media"),
      description: z.string().optional().describe("Description or notes for the media"),
      folderId: z
        .string()
        .optional()
        .describe("Move media to this folder ID"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Array of tags to assign to the media"),
      status: z
        .string()
        .optional()
        .describe("Media status value"),
      remark: z
        .string()
        .optional()
        .describe("Internal remark or note"),
      manageBy: z
        .string()
        .optional()
        .describe("User ID to assign management of this media to"),
    },
    async ({ mediaId, ...body }) => {
      try {
        const result = await speakClient.put(`/v1/media/${mediaId}`, body);
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

  // 9. Delete media
  server.tool(
    "delete_media",
    "Permanently delete a media file and all associated transcripts and insights.",
    {
      mediaId: z.string().describe("Unique identifier of the media file to delete"),
    },
    async ({ mediaId }) => {
      try {
        const result = await speakClient.delete(`/v1/media/${mediaId}`);
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
