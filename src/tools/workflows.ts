import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";
import { MediaType, MediaState } from "@speakai/shared";
import * as fs from "fs";
import * as path from "path";
import { getMimeType, isVideoFile, detectMediaType } from "../media-utils.js";

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutes max

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  server.tool(
    "upload_and_analyze",
    [
      "Upload media from a URL, wait for processing to complete, then return the transcript and AI insights — all in one call.",
      "This is a convenience tool that combines upload_media + polling get_media_status + get_transcript + get_media_insights.",
      "Processing typically takes 1-3 minutes for audio under 60 minutes.",
      "Use this when you want the full analysis result without managing the polling loop yourself.",
    ].join(" "),
    {
      url: z.string().describe("Publicly accessible URL of the media file"),
      name: z.string().optional().describe("Display name for the media (defaults to filename from URL)"),
      mediaType: z.enum([MediaType.AUDIO, MediaType.VIDEO] as [string, ...string[]]).optional().describe("Media type (default: audio)"),
      sourceLanguage: z.string().optional().describe("BCP-47 language code (e.g., 'en-US', 'he-IL')"),
      folderId: z.string().optional().describe("Folder ID to place the media in"),
      tags: z.string().optional().describe("Comma-separated tags"),
    },
    async (params) => {
      try {
        // 1. Upload
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

        if (!mediaId) {
          return {
            content: [{ type: "text", text: `Error: Upload succeeded but no mediaId returned.\n${JSON.stringify(uploadRes.data, null, 2)}` }],
            isError: true,
          };
        }

        // 2. Poll until processed
        let state = uploadRes.data?.data?.state;
        let attempts = 0;
        while (state !== MediaState.PROCESSED && state !== MediaState.FAILED && attempts < MAX_POLL_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          const statusRes = await api.get(`/v1/media/status/${mediaId}`);
          state = statusRes.data?.data?.state;
          attempts++;
        }

        if (state === MediaState.FAILED) {
          return {
            content: [{ type: "text", text: `Error: Processing failed for media ${mediaId}` }],
            isError: true,
          };
        }

        if (state !== MediaState.PROCESSED) {
          return {
            content: [{ type: "text", text: `Timeout: Media ${mediaId} is still processing (state: ${state}). Use get_media_status to check later.` }],
            isError: true,
          };
        }

        // 3. Fetch transcript + insights in parallel
        const [transcriptRes, insightsRes] = await Promise.all([
          api.get(`/v1/media/transcript/${mediaId}`),
          api.get(`/v1/media/insight/${mediaId}`),
        ]);

        const result = {
          mediaId,
          state: "processed",
          transcript: transcriptRes.data?.data,
          insights: insightsRes.data?.data,
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
