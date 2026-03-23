import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  server.tool(
    "create_embed",
    "Create an embeddable player/transcript widget for a media file.",
    {
      mediaId: z.string().describe("Unique identifier of the media file"),
      settings: z.record(z.unknown()).optional().describe("Embed configuration settings"),
    },
    async (body) => {
      try {
        const result = await api.post("/v1/embed", body);
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
    "update_embed",
    "Update settings for an existing embed widget.",
    {
      embedId: z.string().describe("Unique identifier of the embed"),
      settings: z.record(z.unknown()).optional().describe("Updated embed settings"),
    },
    async ({ embedId, ...body }) => {
      try {
        const result = await api.put(`/v1/embed/${embedId}`, body);
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
    "check_embed",
    "Check if an embed exists for a media file and retrieve its configuration.",
    {
      mediaId: z.string().describe("Unique identifier of the media file"),
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/embed/${mediaId}`);
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
    "get_embed_iframe_url",
    "Get the iframe URL for embedding a media player/transcript on a webpage.",
    {
      mediaId: z.string().describe("Unique identifier of the media file"),
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get("/v1/embed/iframe", {
          params: { mediaId },
        });
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
