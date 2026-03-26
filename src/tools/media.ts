import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";
import { MediaType, MediaState } from "@speakai/shared";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  // 1. Get signed upload URL
  server.tool(
    "get_signed_upload_url",
    "Get a pre-signed S3 URL for direct file upload to Speak AI storage. After getting the URL, PUT your file to it, then call upload_media with the S3 URL. For a simpler workflow, use upload_local_file instead which handles all steps automatically.",
    {
      isVideo: z
        .boolean()
        .describe("Set true for video files, false for audio files"),
      filename: z.string().min(1).describe("Original filename including extension"),
      mimeType: z
        .string()
        .describe('MIME type of the file, e.g. "audio/mp4" or "video/mp4"'),
    },
    async ({ isVideo, filename, mimeType }) => {
      try {
        const result = await api.get("/v1/media/upload/signedurl", {
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
    "Upload media from a publicly accessible URL. Processing is asynchronous — after uploading, use get_media_status to poll until state is 'processed' (typically 1-3 minutes for audio under 60 min), then use get_transcript and get_media_insights to retrieve results. For a single call that handles everything, use upload_and_analyze instead. For local files, use upload_local_file.",
    {
      name: z.string().min(1).describe("Display name for the media file"),
      url: z
        .string()
        .describe("Publicly accessible URL of the media file (or pre-signed S3 URL)"),
      mediaType: z
        .enum([MediaType.AUDIO, MediaType.VIDEO] as [string, ...string[]])
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
            id: z.string().min(1).describe("Custom field ID"),
            value: z.string().min(1).describe("Custom field value"),
          })
        )
        .optional()
        .describe("Custom field values to attach to the media"),
    },
    async (body) => {
      try {
        const result = await api.post("/v1/media/upload", body);
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
    "List and search media files in the workspace with filtering, pagination, and sorting. Use filterName for text search, mediaType to filter by audio/video/text, folderId for folder-specific results, and from/to for date ranges. Returns mediaIds you can pass to get_transcript, get_media_insights, or ask_magic_prompt. For deep full-text search across transcripts, use search_media instead.",
    {
      mediaType: z
        .enum([MediaType.AUDIO, MediaType.VIDEO, MediaType.TEXT] as [string, ...string[]])
        .optional()
        .describe('Filter by media type: "audio", "video", or "text"'),
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
        .describe("Number of results per page (default: 20, max: 500)"),
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
        const result = await api.get("/v1/media", { params });
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
    "Retrieve AI-generated insights for a processed media file — topics, sentiment, keywords, action items, summaries, and more. The media must be in 'processed' state (check with get_media_status first). For asking custom questions about a media file, use ask_magic_prompt instead.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/media/insight/${mediaId}`);
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
    "Retrieve the full transcript for a processed media file with speaker labels and timestamps. The media must be in 'processed' state. Use update_transcript_speakers to rename speaker labels after reviewing. For subtitle-formatted output, use get_captions instead.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/media/transcript/${mediaId}`);
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
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
      speakers: z
        .array(
          z.object({
            id: z.string().min(1).describe("Speaker identifier from the transcript"),
            name: z.string().min(1).describe("Display name to assign to the speaker"),
          })
        )
        .describe("Array of speaker ID to name mappings"),
    },
    async ({ mediaId, speakers }) => {
      try {
        const result = await api.put(
          `/v1/media/speakers/${mediaId}`,
          { speakers }
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
    "Check the processing status of a media file. States: pending → transcribing → analyzing → processed (or failed). Poll this after upload_media until state is 'processed', then use get_transcript and get_media_insights to retrieve results.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/media/status/${mediaId}`);
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
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
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
        const result = await api.put(`/v1/media/${mediaId}`, body);
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
      mediaId: z.string().min(1).describe("Unique identifier of the media file to delete"),
    },
    async ({ mediaId }) => {
      try {
        const result = await api.delete(`/v1/media/${mediaId}`);
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

  // 10. Get captions
  server.tool(
    "get_captions",
    "Get captions for a media file. Captions are separate from full transcripts and are formatted for display/subtitles.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/media/caption/${mediaId}`);
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

  // 11. List supported languages
  server.tool(
    "list_supported_languages",
    "List all languages supported for transcription. Use the language codes when uploading media with a specific sourceLanguage.",
    {},
    async () => {
      try {
        const result = await api.get("/v1/media/supportedLanguages");
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

  // 12. Get media statistics
  server.tool(
    "get_media_statistics",
    "Get workspace-level media statistics — total counts, processing status breakdown, storage usage, etc.",
    {},
    async () => {
      try {
        const result = await api.get("/v1/media/statistics");
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

  // 13. Toggle favorite
  server.tool(
    "toggle_media_favorite",
    "Mark or unmark a media file as a favorite for quick access.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
    },
    async (body) => {
      try {
        const result = await api.post("/v1/media/favorites", body);
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

  // 14. Re-analyze media
  server.tool(
    "reanalyze_media",
    "Re-run AI analysis on a media file using the latest models. Use this after Speak AI has updated its analysis capabilities or if the original analysis was incomplete.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file to re-analyze"),
    },
    async ({ mediaId }) => {
      try {
        const result = await api.post(`/v1/media/reanalyze/${mediaId}`, {});
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
