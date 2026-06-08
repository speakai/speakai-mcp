import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";
import { MediaType, MediaState } from "@speakai/shared";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  // 1. Get signed upload URL
  registerSpeakTool(server, 
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
    {
      title: "Get Signed Upload URL",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
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
  registerSpeakTool(server, 
    "upload_media",
    "Upload media from a URL — a direct/public file URL, a pre-signed S3 URL, or a shareable social/video link (YouTube, Instagram, TikTok, X, Facebook, Reddit, SoundCloud, and similar) which Speak resolves to the underlying media automatically. Processing is asynchronous — after uploading, use get_media_status to poll until state is 'processed' (typically 1-3 minutes for audio under 60 min), then use get_transcript and get_media_insights to retrieve results. For a single call that handles everything, use upload_and_analyze instead. For local files, use upload_local_file. (Vimeo links are not yet supported.)",
    {
      name: z.string().min(1).describe("Display name for the media file"),
      url: z
        .string()
        .describe("Direct/public media file URL, pre-signed S3 URL, or a shareable social/video page link (e.g. an Instagram reel or TikTok URL) — page links are resolved to the underlying media server-side."),
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
    {
      title: "Upload Media from URL",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
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
  registerSpeakTool(server, 
    "list_media",
    "List and search media files in the workspace with filtering, pagination, and sorting. Use filterName for text search, mediaType to filter by audio/video/text, folderId for folder-specific results, and from/to for date ranges. Use the include param to embed additional data (transcripts, speakers, keywords) inline with each result, avoiding N+1 API calls. Returns mediaIds you can pass to get_transcript, get_media_insights, or ask_magic_prompt. For deep full-text search across transcripts, use search_media instead.",
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
      include: z
        .array(
          z.enum([
            "transcription",
            "keywords",
            "speakers",
            "sentiment",
            "custom",
            "fields",
          ] as [string, ...string[]])
        )
        .optional()
        .describe(
          "Additional data to include with each media item. Without this, only metadata is returned. Use 'transcription' to include full transcripts inline, 'speakers' for speaker details, 'keywords' for extracted keywords, etc. Avoids N+1 API calls when you need data for multiple files."
        ),
    },
    {
      title: "List Media Files",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ include, ...params }) => {
      try {
        const queryParams: Record<string, unknown> = { ...params };
        if (include?.length) {
          queryParams.requestTypes = include.join(",");
        }
        const result = await api.get("/v1/media", { params: queryParams });
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
  registerSpeakTool(server, 
    "get_media_insights",
    "Retrieve AI-generated insights for a processed media file — topics, sentiment, keywords, action items, summaries, and more. The media must be in 'processed' state (check with get_media_status first). For asking custom questions about a media file, use ask_magic_prompt instead.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
    },
    {
      title: "Get Media Insights",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
  registerSpeakTool(server, 
    "get_transcript",
    "Retrieve the full transcript for a media file with speaker labels and timestamps. Works on processed media and also returns the partial, in-progress transcript while a meeting bot is still recording (LIVE_TRANSCRIPT state). To fetch only the new sentences added since your previous call during a live meeting, use get_live_meeting_transcript instead. Use update_transcript_speakers to rename speaker labels after reviewing. For subtitle-formatted output, use get_captions instead.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
    },
    {
      title: "Get Transcript",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
  registerSpeakTool(server, 
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
    {
      title: "Rename Transcript Speakers",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ mediaId, speakers }) => {
      try {
        const result = await api.put(
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
  registerSpeakTool(server, 
    "get_media_status",
    "Check the processing status of a media file. States: pending → transcribing → analyzing → processed (or failed). Poll this after upload_media until state is 'processed', then use get_transcript and get_media_insights to retrieve results.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
    },
    {
      title: "Get Media Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
  registerSpeakTool(server, 
    "update_media_metadata",
    "Update metadata fields (name, description, tags, status) for an existing media file.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
      name: z.string().describe("Display name for the media (required — the server replaces the metadata)"),
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
    {
      title: "Update Media Metadata",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
  registerSpeakTool(server, 
    "delete_media",
    "Permanently delete a media file and all associated transcripts and insights.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file to delete"),
    },
    {
      title: "Delete Media File",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
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
  registerSpeakTool(server, 
    "get_captions",
    "Get captions for a media file. Captions are separate from full transcripts and are formatted for display/subtitles.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
    },
    {
      title: "Get Captions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
  registerSpeakTool(server, 
    "list_supported_languages",
    "List all languages supported for transcription. Use the language codes when uploading media with a specific sourceLanguage.",
    {},
    {
      title: "List Supported Languages",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
  registerSpeakTool(server, 
    "get_media_statistics",
    "Get workspace-level media statistics — total counts, processing status breakdown, storage usage, etc.",
    {},
    {
      title: "Get Media Statistics",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
  registerSpeakTool(server, 
    "toggle_media_favorite",
    "Mark or unmark media files as favorites for quick access.",
    {
      mediaIds: z
        .array(z.string().min(1))
        .min(1)
        .describe("Media file IDs to update"),
      isFavorite: z
        .boolean()
        .describe("true to mark as favorite, false to unmark"),
    },
    {
      title: "Toggle Media Favorite",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
  registerSpeakTool(server, 
    "reanalyze_media",
    "Re-run AI analysis on a media file using the latest models. Choose which parts to re-run via the flags below.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file to re-analyze"),
      isInsights: z.boolean().optional().describe("Re-run insights analysis"),
      isSentiment: z.boolean().optional().describe("Re-run sentiment analysis"),
      isFillerWords: z.boolean().optional().describe("Re-run filler-word detection"),
      isEmbeddings: z.boolean().optional().describe("Re-generate embeddings"),
    },
    {
      title: "Re-analyze Media",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ mediaId, ...params }) => {
      try {
        const result = await api.get(`/v1/media/reanalyze/${mediaId}`, { params });
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

  // 15. Bulk update transcript speakers across multiple media
  registerSpeakTool(server, 
    "bulk_update_transcript_speakers",
    "Update or rename speaker labels across multiple media files in a single operation. Applies the same speaker mappings to every specified media file. Use this instead of calling update_transcript_speakers repeatedly when renaming speakers across a project or folder.",
    {
      mediaIds: z
        .array(z.string().min(1))
        .min(1)
        .max(500)
        .describe("Array of media IDs to update speakers for (max 500 per call)"),
      speakers: z
        .array(
          z.object({
            id: z.string().min(1).describe("Speaker identifier from the transcript"),
            name: z.string().min(1).describe("Display name to assign to the speaker"),
          })
        )
        .describe("Array of speaker ID to name mappings to apply to all specified media files"),
    },
    {
      title: "Bulk Rename Speakers Across Files",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ mediaIds, speakers }) => {
      const results: { mediaId: string; success: boolean; error?: string }[] = [];

      for (const mediaId of mediaIds) {
        try {
          await api.put(`/v1/media/speakers/${mediaId}`, speakers);
          results.push({ mediaId, success: true });
        } catch (err) {
          results.push({ mediaId, success: false, error: formatAxiosError(err) });
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { summary: { total: mediaIds.length, succeeded, failed }, results },
              null,
              2
            ),
          },
        ],
        isError: failed === mediaIds.length,
      };
    }
  );

  // 16. Bulk move media to folder
  registerSpeakTool(server, 
    "bulk_move_media",
    "Move multiple media files to a folder in a single operation. Use this for batch reorganization instead of updating media one by one.",
    {
      folderId: z.string().min(1).describe("Target folder ID to move media into"),
      mediaIds: z
        .array(z.string().min(1))
        .min(1)
        .describe("Array of media IDs to move"),
    },
    {
      title: "Bulk Move Media Files",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.put("/v1/media/move", body);
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
