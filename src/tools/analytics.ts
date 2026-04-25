import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";
import { FilterFieldName, FilterOperator, FilterCondition } from "@speakai/shared";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  server.tool(
    "search_media",
    [
      "Deep search across all media transcripts, insights, and metadata.",
      "Returns matching media with sentiment data, tags, and content excerpts.",
      "Use this to find specific topics, keywords, or themes across your entire library.",
      "For filtering by media type, folder, tags, or speakers, use the filterList parameter.",
      "Results are scoped by date range — defaults to current month if not specified.",
    ].join(" "),
    {
      query: z.string().min(1).describe("Search query — searches across transcripts, insights, and metadata"),
      startDate: z
        .string()
        .optional()
        .describe("Start date for search range (ISO 8601). Defaults to start of current month."),
      endDate: z
        .string()
        .optional()
        .describe("End date for search range (ISO 8601). Defaults to now."),
      filterList: z
        .array(
          z.object({
            fieldName: z.enum(Object.values(FilterFieldName) as [string, ...string[]]).describe("Field to filter on"),
            fieldOperator: z.enum(Object.values(FilterOperator) as [string, ...string[]]).describe("Filter operator"),
            fieldValue: z.array(z.string()).describe("Values to filter by"),
            fieldCondition: z.enum(Object.values(FilterCondition) as [string, ...string[]]).describe("Condition linking multiple filters"),
          })
        )
        .optional()
        .describe("Advanced filters for narrowing search results by tags, speakers, media type, sentiment, folder, etc."),
    },
    {
      title: "Search Media Library",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (params) => {
      try {
        const result = await api.post("/v1/analytics/search", params);
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
