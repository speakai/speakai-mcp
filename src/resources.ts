import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { speakClient } from "./client.js";

export function registerResources(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  // ── Static Resources ────────────────────────────────────────────────

  server.resource(
    "media-library",
    "speakai://media",
    { description: "List of all media files in your Speak AI workspace" },
    async () => {
      try {
        const result = await api.get("/v1/media", {
          params: { page: 0, pageSize: 50, sortBy: "createdAt:desc", filterMedia: 2 },
        });
        return {
          contents: [
            {
              uri: "speakai://media",
              mimeType: "application/json",
              text: JSON.stringify(result.data?.data, null, 2),
            },
          ],
        };
      } catch {
        return { contents: [] };
      }
    }
  );

  server.resource(
    "folders",
    "speakai://folders",
    { description: "List of all folders in your Speak AI workspace" },
    async () => {
      try {
        const result = await api.get("/v1/folder", {
          params: { page: 0, pageSize: 100, sortBy: "createdAt:desc" },
        });
        return {
          contents: [
            {
              uri: "speakai://folders",
              mimeType: "application/json",
              text: JSON.stringify(result.data?.data, null, 2),
            },
          ],
        };
      } catch {
        return { contents: [] };
      }
    }
  );

  server.resource(
    "supported-languages",
    "speakai://languages",
    { description: "List of supported transcription languages" },
    async () => {
      try {
        const result = await api.get("/v1/media/supportedLanguages");
        return {
          contents: [
            {
              uri: "speakai://languages",
              mimeType: "application/json",
              text: JSON.stringify(result.data?.data, null, 2),
            },
          ],
        };
      } catch {
        return { contents: [] };
      }
    }
  );

  // ── Dynamic Resource Templates ──────────────────────────────────────

  server.resource(
    "transcript",
    new ResourceTemplate("speakai://media/{mediaId}/transcript", { list: undefined }),
    { description: "Full transcript for a specific media file" },
    async (uri, { mediaId }) => {
      try {
        const result = await api.get(`/v1/media/transcript/${mediaId}`);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(result.data?.data, null, 2),
            },
          ],
        };
      } catch {
        return { contents: [] };
      }
    }
  );

  server.resource(
    "insights",
    new ResourceTemplate("speakai://media/{mediaId}/insights", { list: undefined }),
    { description: "AI-generated insights for a specific media file" },
    async (uri, { mediaId }) => {
      try {
        const result = await api.get(`/v1/media/insight/${mediaId}`);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(result.data?.data, null, 2),
            },
          ],
        };
      } catch {
        return { contents: [] };
      }
    }
  );
}
