import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";
import { MediaType } from "@speakai/shared";
import * as fs from "fs";
import * as path from "path";
import { getMimeType, isVideoFile, detectMediaType } from "../media-utils.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  server.tool(
    "upload_and_analyze",
    "Upload media and return media_id immediately. After this returns, poll get_media_status until state is 'processed' (typically 1-3 min for under 60min audio), then call get_media_insights for AI summaries. This async pattern is required for remote MCP transports — long blocking calls die at proxy idle timeouts.",
    {
      url: z.string().describe("Publicly accessible URL of the media file"),
      name: z.string().optional().describe("Display name for the media (defaults to filename from URL)"),
      mediaType: z.enum([MediaType.AUDIO, MediaType.VIDEO] as [string, ...string[]]).optional().describe("Media type (default: audio)"),
      sourceLanguage: z.string().optional().describe("BCP-47 language code (e.g., 'en-US', 'he-IL')"),
      folderId: z.string().optional().describe("Folder ID to place the media in"),
      tags: z.string().optional().describe("Comma-separated tags"),
    },
    {
      title: "Upload and Analyze Media",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (params) => {
      try {
        // Upload only — do not block on processing.
        // Remote MCP transports (Claude.ai web, ChatGPT) sit behind proxies
        // (CloudFront / ALB / Anthropic edge) whose idle timeouts kill long
        // synchronous calls before processing finishes. Return media_id and
        // let the caller poll get_media_status.
        const uploadBody: Record<string, unknown> = {
          name: params.name ?? params.url.split("/").pop()?.split("?")[0] ?? "Upload",
          url: params.url,
          mediaType: params.mediaType ?? "audio",
        };
        if (params.sourceLanguage) uploadBody.sourceLanguage = params.sourceLanguage;
        if (params.folderId) uploadBody.folderId = params.folderId;
        if (params.tags) uploadBody.tags = params.tags;

        const uploadRes = await api.post("/v1/media/upload", uploadBody);
        const mediaId = uploadRes.data?.data?.mediaId;
        const state = uploadRes.data?.data?.state ?? "pending";

        if (!mediaId) {
          return {
            content: [{ type: "text", text: `Error: Upload succeeded but no mediaId returned.\n${JSON.stringify(uploadRes.data, null, 2)}` }],
            isError: true,
          };
        }

        const result = {
          mediaId,
          state,
          message: "Upload accepted. Processing has started in the background.",
          nextSteps: [
            `1. Poll get_media_status with mediaId="${mediaId}" every 10-30 seconds.`,
            `2. When state is "processed" (typically 1-3 min for audio under 60 min), call get_media_insights for the AI summary and get_transcript for the full transcript.`,
            `3. If state becomes "failed", processing did not complete — surface the error to the user.`,
          ],
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
    "upload_local_file",
    [
      "Upload a local file to Speak AI for transcription and analysis.",
      "Reads the file from disk, gets a pre-signed S3 URL, uploads the file, then creates the media entry.",
      "Works with any audio or video file on the local filesystem.",
      "After upload, use get_media_status to poll for completion, then get_transcript and get_media_insights.",
    ].join(" "),
    {
      filePath: z.string().describe("Absolute path to the local audio or video file"),
      name: z.string().optional().describe("Display name (defaults to filename)"),
      mediaType: z.enum([MediaType.AUDIO, MediaType.VIDEO] as [string, ...string[]]).optional().describe("Media type (auto-detected from extension if omitted)"),
      sourceLanguage: z.string().optional().describe("BCP-47 language code (e.g., 'en-US')"),
      folderId: z.string().optional().describe("Folder ID to place the media in"),
      tags: z.string().optional().describe("Comma-separated tags"),
    },
    {
      title: "Upload Local File",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (params) => {
      try {
        const filePath = params.filePath;
        if (!fs.existsSync(filePath)) {
          return {
            content: [{ type: "text", text: `Error: File not found: ${filePath}` }],
            isError: true,
          };
        }

        const filename = path.basename(filePath);
        const isVideo = isVideoFile(filePath);
        const mediaType = params.mediaType ?? detectMediaType(filePath);
        const mimeType = getMimeType(filePath);

        // 1. Get signed upload URL
        const signedRes = await api.get("/v1/media/upload/signedurl", {
          params: { isVideo, filename, mimeType },
        });
        const signedData = signedRes.data?.data;
        const uploadUrl = signedData?.signedUrl ?? signedData?.url;
        const s3Key = signedData?.key ?? signedData?.s3Key;

        if (!uploadUrl) {
          return {
            content: [{ type: "text", text: `Error: Could not get signed upload URL.\n${JSON.stringify(signedRes.data, null, 2)}` }],
            isError: true,
          };
        }

        // 2. Upload file to S3
        const fileBuffer = fs.readFileSync(filePath);
        const axios = (await import("axios")).default;
        await axios.put(uploadUrl, fileBuffer, {
          headers: {
            "Content-Type": mimeType,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        // 3. Create media entry
        const createBody: Record<string, unknown> = {
          name: params.name ?? filename,
          url: uploadUrl.split("?")[0], // S3 URL without query params
          mediaType,
        };
        if (s3Key) createBody.s3Key = s3Key;
        if (params.sourceLanguage) createBody.sourceLanguage = params.sourceLanguage;
        if (params.folderId) createBody.folderId = params.folderId;
        if (params.tags) createBody.tags = params.tags;

        const createRes = await api.post("/v1/media/upload", createBody);
        const data = createRes.data?.data;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mediaId: data?.mediaId,
                  state: data?.state,
                  message: `File uploaded successfully. Use get_media_status to poll until state is 'processed', then use get_transcript and get_media_insights.`,
                },
                null,
                2
              ),
            },
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
