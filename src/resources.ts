import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { AxiosInstance } from "axios";
import { speakClient } from "./client.js";
import { formatAxiosError } from "./client.js";

/**
 * Wraps an MCP resource handler so failures surface as real errors instead
 * of silently returning an empty resource. An auth failure or backend
 * outage should NOT look like an empty workspace — that masks bugs and
 * confuses both users and AI assistants.
 */
function asJsonContent(uri: string, data: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function reportError(label: string, err: unknown): never {
  const detail = formatAxiosError(err);
  throw new Error(`Speak AI resource '${label}' failed: ${detail}`);
}

export function registerResources(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  // ── Static Resources ────────────────────────────────────────────────

  server.registerResource(
    "media-library",
    "speakai://media",
    { description: "List of all media files in your Speak AI workspace" },
    async () => {
      try {
        const result = await api.get("/v1/media", {
          params: { page: 0, pageSize: 50, sortBy: "createdAt:desc", filterMedia: 2 },
        });
        return asJsonContent("speakai://media", result.data?.data);
      } catch (err) {
        reportError("media-library", err);
      }
    }
  );

  server.registerResource(
    "folders",
    "speakai://folders",
    { description: "List of all folders in your Speak AI workspace" },
    async () => {
      try {
        const result = await api.get("/v1/folder", {
          params: { page: 0, pageSize: 100, sortBy: "createdAt:desc" },
        });
        return asJsonContent("speakai://folders", result.data?.data);
      } catch (err) {
        reportError("folders", err);
      }
    }
  );

  server.registerResource(
    "supported-languages",
    "speakai://languages",
    { description: "List of supported transcription languages" },
    async () => {
      try {
        const result = await api.get("/v1/media/supportedLanguages");
        return asJsonContent("speakai://languages", result.data?.data);
      } catch (err) {
        reportError("supported-languages", err);
      }
    }
  );

  // ── Dynamic Resource Templates ──────────────────────────────────────

  server.registerResource(
    "transcript",
    new ResourceTemplate("speakai://media/{mediaId}/transcript", { list: undefined }),
    { description: "Full transcript for a specific media file" },
    async (uri, { mediaId }) => {
      try {
        const result = await api.get(`/v1/media/transcript/${mediaId}`);
        return asJsonContent(uri.href, result.data?.data);
      } catch (err) {
        reportError(`transcript(${mediaId})`, err);
      }
    }
  );

  server.registerResource(
    "insights",
    new ResourceTemplate("speakai://media/{mediaId}/insights", { list: undefined }),
    { description: "AI-generated insights for a specific media file" },
    async (uri, { mediaId }) => {
      try {
        const result = await api.get(`/v1/media/insight/${mediaId}`);
        return asJsonContent(uri.href, result.data?.data);
      } catch (err) {
        reportError(`insights(${mediaId})`, err);
      }
    }
  );
}
