import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_APP_MIME_TYPE, MEDIA_LIST_CARD_URI } from "./card-data.js";
import { MEDIA_LIST_CARD_HTML } from "./view.js";

const MEDIA_LIST_CARD_RESOURCE_META = {
  ui: {
    csp: { connectDomains: [], resourceDomains: [] },
    prefersBorder: false,
  },
};

export function registerMediaListCard(server: McpServer): void {
  server.registerResource(
    "speak-media-list-card",
    MEDIA_LIST_CARD_URI,
    {
      title: "Speak file list card",
      description: "Shows up to 3 Speak files from list_media or search_media in the chat.",
      mimeType: MCP_APP_MIME_TYPE,
      _meta: MEDIA_LIST_CARD_RESOURCE_META,
    },
    async () => ({
      contents: [
        {
          uri: MEDIA_LIST_CARD_URI,
          mimeType: MCP_APP_MIME_TYPE,
          text: MEDIA_LIST_CARD_HTML,
          _meta: MEDIA_LIST_CARD_RESOURCE_META,
        },
      ],
    })
  );
}
