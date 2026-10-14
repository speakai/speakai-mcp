import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  registerSpeakTool(server, 
    "create_embed",
    "Create an embeddable player/transcript widget for a media file or a set of folders. Provide `mediaId` for a single-media embed, or `folderIds` for a folder/library embed. If an embed already exists for that media or folder set, it is returned instead. A single-media embed is viewable by anyone with the link while the media's privacy mode is public (the default); a folder embed is created with an auto-generated password. Use update_embed to change privacy or the password, or to show labels and comments (meta isLabels, isComments; off by default), or to brand a shared dashboard (meta logo, logoDark, theme, backgroundColor, primaryColor, titleColor, fontFamily).",
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
      destructiveHint: true,
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
    "Update an existing embed widget: appearance/feature toggles via `meta`, and privacy. " +
      "Passing `mediaId` with `privacyMode` sets that privacy mode on the media file itself; a public mode makes " +
      "the media viewable by anyone with the embed link. " +
      "Setting `privacyMode` clears any existing password unless a new one is supplied in the same call.",
    {
      embedId: z.string().min(1).describe("Unique identifier of the embed"),
      mediaId: z.string().optional().describe("Media file whose privacy mode is set to privacyMode. Does not change which media the embed points to."),
      privacyMode: z
        .string()
        .optional()
        .describe(
          "Privacy mode for the embed. Changing this clears the existing password unless `password` is also supplied in the same call.",
        ),
      password: z
        .string()
        .optional()
        .describe("Password to protect the embed with when privacyMode is private. Only applied when privacyMode is also sent."),
      meta: z
        .record(z.unknown())
        .optional()
        .describe(
          "Embed appearance & feature toggles: { backgroundImg, logo, logoDark, theme, backgroundColor, fontFamily, primaryColor, titleColor, chatWelcomeMessage, assistantTemplateId, isTitle, isDescription, isRemarks, isDataVizDownloadable, isSEOIndexing, isPromptAsk, isPromptHistory, isMediaExport, isLabels, isComments, callToActionButtons:[{ url, label }], features:[{ name, isActive, isCustom? }] }. " +
            "features entry { name: \"fieldsFocus\", isActive: false } turns off the fields-first media page: by default, when a media page is opened from a shared dashboard and the media has custom fields, the page shrinks the player to about 22% and leads with the fields. " +
            "Shared-dashboard branding: logo is the image shown in light mode and logoDark the one shown when the viewer is in dark mode (logoDark must already live in Speak storage and this MCP cannot upload images; any other URL is rejected with a 400, and it falls back to logo when unset). " +
            "theme is \"light\" or \"dark\" and forces that theme for every viewer, hiding their toggle; \"\" lets the viewer choose. " +
            "backgroundColor is a hex colour (#rgb or #rrggbb) for the page background; pair it with theme so text stays readable. " +
            "primaryColor is a hex accent used for nav, links, card chips and play buttons. " +
            "titleColor is a hex colour for the dashboard title and is ignored when its contrast on the page background is below 3:1. " +
            "fontFamily is a Google Fonts family name (letters, digits and spaces, max 60 chars, for example \"Arimo\"; anything else is rejected with a 400); it overrides the account font for this embed, and \"\" falls back to the account font. " +
            "Send \"\" for any of these keys to clear it. " +
            "isPromptAsk must be on for the chat button of a shared dashboard (and a notes widget openChat action) to work. " +
            "isLabels and isComments show the media's labels and comments read-only on media and folder embeds; both are off by default and embed viewers can never write them.",
        ),
    },
    {
      title: "Update Embed Widget",
      readOnlyHint: false,
      destructiveHint: true,
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
