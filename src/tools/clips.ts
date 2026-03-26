import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";
import { ClipState, MediaType } from "@speakai/shared";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  server.tool(
    "create_clip",
    [
      "Create a highlight clip from one or more media files by specifying time ranges.",
      `Clips are processed asynchronously (states: ${Object.values(ClipState).join(", ")}) — use get_clips to check status.`,
      "Maximum total clip duration is 30 minutes.",
      "Use multiple timeRanges to stitch segments from different media files together.",
    ].join(" "),
    {
      title: z.string().min(1).describe("Title for the clip"),
      mediaType: z.enum([MediaType.AUDIO, MediaType.VIDEO] as [string, ...string[]]).describe("Output media type"),
      timeRanges: z
        .array(
          z.object({
            mediaId: z.string().min(1).describe("Source media file ID"),
            startTime: z.number().min(0).describe("Start time in seconds"),
            endTime: z.number().min(0).describe("End time in seconds (must be > startTime)"),
          })
        )
        .min(1)
        .describe("Array of time ranges to include in the clip. Each specifies a source media and start/end times."),
      description: z.string().optional().describe("Description of the clip"),
      tags: z.array(z.string()).optional().describe("Tags for the clip"),
      mergeStrategy: z
        .enum(["CONCATENATE"])
        .optional()
        .describe("How to merge multiple segments (default: CONCATENATE)"),
    },
    async (body) => {
      try {
        const result = await api.post("/v1/clips", body);
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
    "get_clips",
    "List clips, optionally filtered by folder or media files. If clipId is provided, returns a single clip with its download URL (when processed).",
    {
      clipId: z.string().optional().describe("Get a specific clip by ID"),
      folderId: z.string().optional().describe("Filter clips by folder ID"),
      mediaIds: z
        .array(z.string())
        .optional()
        .describe("Filter clips by source media file IDs"),
    },
    async ({ clipId, ...params }) => {
      try {
        const url = clipId ? `/v1/clips/${clipId}` : "/v1/clips";
        const result = await api.get(url, { params });
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
    "update_clip",
    "Update a clip's title, description, or tags.",
    {
      clipId: z.string().min(1).describe("ID of the clip to update"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      tags: z.array(z.string()).optional().describe("New tags"),
    },
    async ({ clipId, ...body }) => {
      try {
        const result = await api.put(`/v1/clips/${clipId}`, body);
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
    "delete_clip",
    "Permanently delete a clip and its associated media file.",
    {
      clipId: z.string().min(1).describe("ID of the clip to delete"),
    },
    async ({ clipId }) => {
      try {
        const result = await api.delete(`/v1/clips/${clipId}`);
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
