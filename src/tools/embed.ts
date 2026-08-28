import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  registerSpeakTool(server, 
    "create_embed",
    "Create an embeddable player/transcript widget for a media file or a set of folders. Provide `mediaId` for a single-media embed, or `folderIds` for a folder/library embed.",
    {
      mediaId: z
        .string()
        .optional()
        .describe("Media file to embed (for a single-media embed)"),
      folderIds: z
        .array(z.string())
        .optional()
        .describe("Folder IDs to embed (for a folder/library embed)"),
    },
    {
      title: "Create Embed Widget",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
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

  registerSpeakTool(server, 
    "update_embed",
    "Update an existing embed widget — appearance/feature toggles via `meta`, plus scope and privacy.",
    {
      embedId: z.string().min(1).describe("Unique identifier of the embed"),
      mediaId: z.string().optional().describe("Media file the embed points to"),
      folderIds: z
        .array(z.string())
        .optional()
        .describe("Folder IDs the embed covers"),
      privacyMode: z.string().optional().describe("Privacy mode for the embed"),
      embedType: z.string().optional().describe("Embed type"),
      meta: z
        .record(z.unknown())
        .optional()
        .describe(
          "Embed appearance & feature toggles: { backgroundImg, logo, primaryColor, titleColor, chatWelcomeMessage, assistantTemplateId, isTitle, isDescription, isRemarks, isDataVizDownloadable, isSEOIndexing, isPromptAsk, isPromptHistory, isMediaExport, callToActionButtons:[{ url, label }], features:[{ name, isActive, isCustom? }] }",
        ),
    },
    {
      title: "Update Embed Widget",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
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

  registerSpeakTool(server, 
    "check_embed",
    "Check if an embed exists for a media file and retrieve its configuration.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
    },
    {
      title: "Check Embed Exists",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get("/v1/embed", { params: { mediaId } });
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

  registerSpeakTool(server, 
    "get_embed_iframe_url",
    "Get the iframe URL for embedding a media player/transcript on a webpage.",
    {
      mediaId: z.string().min(1).describe("Unique identifier of the media file"),
    },
    {
      title: "Get Embed Iframe URL",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
