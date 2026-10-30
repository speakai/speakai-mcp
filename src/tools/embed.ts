import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";
import {
  EMBED_SESSION_LIMITS,
  EmbedSessionDeviceFilter,
  EmbedSessionSort,
  EmbedSessionTrafficFilter,
} from "@speakai/shared";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/);

const embedIdSchema = objectIdSchema.describe("The embed's _id (24 hex characters), as returned by create_embed or check_embed");

// Range filters shared by the session list and the summary.
const embedSessionRangeSchema = {
  from: z.string().optional().describe("Only sessions started on or after this time (ISO 8601 date)"),
  to: z.string().optional().describe("Only sessions started on or before this time (ISO 8601 date)"),
  traffic: z
    .enum(Object.values(EmbedSessionTrafficFilter) as [string, ...string[]])
    .optional()
    .describe("people leaves out bots, bots shows only bots (default all)"),
  includeOwner: z.boolean().optional().describe("Include sessions from people signed in to your own Speak AI workspace (default false)"),
};

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
            "Shared-dashboard branding: logo is the image shown in light mode and logoDark the one shown when the viewer is in dark mode (logoDark must be an uploaded logo; this MCP cannot upload images, any other URL is rejected with a 400, and it falls back to logo when unset). " +
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

  registerSpeakTool(server,
    "list_embed_sessions",
    "Viewing analytics for an embed the user owns: list the visits (sessions) to one embed, newest first by default. " +
      "Each visit shows when it started and was last active, whether it is still live, total and active time, media opened, time watched, questions asked, " +
      "traffic source and campaign tags, whether it was a bot, and the viewer's identity if they chose to share it. " +
      "Returns sessions with totalCount, page and pageSize. Use get_embed_session with a session's _id for its full timeline.",
    {
      embedId: embedIdSchema,
      ...embedSessionRangeSchema,
      page: z.number().int().min(0).optional().describe("0-based page index (default 0)"),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(EMBED_SESSION_LIMITS.maxListPageSize)
        .optional()
        .describe(`Sessions per page (default ${EMBED_SESSION_LIMITS.listPageSize}, max ${EMBED_SESSION_LIMITS.maxListPageSize})`),
      device: z
        .enum(Object.values(EmbedSessionDeviceFilter) as [string, ...string[]])
        .optional()
        .describe("Filter by device type (default all)"),
      country: z.string().optional().describe("Exact country name as shown in a session's client.country"),
      includeLegacy: z
        .boolean()
        .optional()
        .describe("Also include visits recorded before session tracking started (default false)"),
      mediaId: z.string().optional().describe("Only sessions that opened this media file"),
      sort: z
        .enum(Object.values(EmbedSessionSort) as [string, ...string[]])
        .optional()
        .describe(`Sort order (default ${EmbedSessionSort.STARTED_DESC})`),
    },
    {
      title: "List Embed Sessions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ embedId, ...params }) => {
      try {
        const result = await api.get(`/v1/embed/sessions/${embedId}`, { params });
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
    "get_embed_session_summary",
    "Owner analytics for an embed: totals across its visits for a date range. " +
      "Returns KPIs (sessions, unique and returning visitors, identified viewers, average active time, media opens, time watched, questions and sessions with questions), " +
      "sessions and visitors per day, top traffic sources, and a paged table of media with opens, unique viewers, plays, time watched, completion rate, questions and downloads.",
    {
      embedId: embedIdSchema,
      ...embedSessionRangeSchema,
      tz: z.string().max(100).optional().describe("IANA time zone used to group by day, e.g. America/Toronto (default UTC)"),
      mediaPage: z.number().int().min(0).optional().describe("0-based page of the media table (default 0)"),
      mediaPageSize: z
        .number()
        .int()
        .min(1)
        .max(EMBED_SESSION_LIMITS.maxMediaPageSize)
        .optional()
        .describe(`Media rows per page (default ${EMBED_SESSION_LIMITS.mediaPageSize}, max ${EMBED_SESSION_LIMITS.maxMediaPageSize})`),
    },
    {
      title: "Get Embed Session Summary",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ embedId, ...params }) => {
      try {
        const result = await api.get(`/v1/embed/sessions/${embedId}/summary`, { params });
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
    "get_embed_session",
    "Viewing analytics for an embed the user owns: one visit in full. Returns the visit with the media it opened, how much was watched, " +
      "the questions asked in chat, and a paged list of the visit's events. " +
      "Use eventsPage and eventsPageSize to read long timelines.",
    {
      embedId: embedIdSchema,
      id: objectIdSchema.describe("The session's _id (24 hex characters) from list_embed_sessions, not its sessionId"),
      eventsPage: z.number().int().min(0).optional().describe("0-based page of events (default 0)"),
      eventsPageSize: z
        .number()
        .int()
        .min(1)
        .max(EMBED_SESSION_LIMITS.maxEventsPageSize)
        .optional()
        .describe(`Events per page (default ${EMBED_SESSION_LIMITS.eventsPageSize}, max ${EMBED_SESSION_LIMITS.maxEventsPageSize})`),
    },
    {
      title: "Get Embed Session",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ embedId, id, ...params }) => {
      try {
        const result = await api.get(`/v1/embed/sessions/${embedId}/detail/${id}`, { params });
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
