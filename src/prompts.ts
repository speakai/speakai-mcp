import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.prompt(
    "analyze-meeting",
    "Upload a meeting recording and get a full analysis — transcript, insights, action items, and key takeaways.",
    {
      url: z.string().describe("URL of the meeting recording"),
      name: z.string().optional().describe("Meeting name (optional)"),
    },
    async ({ url, name }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Please analyze this meeting recording:`,
              ``,
              `1. Upload "${name ?? "Meeting"}" from: ${url}`,
              `2. Wait for processing to complete`,
              `3. Get the full transcript and AI insights`,
              `4. Summarize:`,
              `   - Key discussion points`,
              `   - Action items with owners (if identifiable from speakers)`,
              `   - Decisions made`,
              `   - Open questions or follow-ups needed`,
              `   - Overall sentiment`,
              ``,
              `Use upload_and_analyze to handle the upload and processing in one step.`,
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.prompt(
    "research-across-media",
    "Search for themes, patterns, or topics across multiple recordings or your entire media library.",
    {
      topic: z.string().describe("The topic, theme, or question to research"),
      folder: z.string().optional().describe("Folder ID to scope the research (optional)"),
    },
    async ({ topic, folder }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Research this topic across my media library: "${topic}"`,
              ``,
              folder ? `Scope: folder ${folder}` : `Scope: entire workspace`,
              ``,
              `Steps:`,
              `1. Use search_media to find relevant media matching this topic`,
              `2. For the most relevant results, use ask_magic_prompt with the matching mediaIds to ask: "${topic}"`,
              `3. Synthesize findings across all results:`,
              `   - Common themes and patterns`,
              `   - Notable quotes or data points`,
              `   - Contradictions or differing perspectives`,
              `   - Trends over time (if date range is available)`,
              ``,
              `Present a research summary with citations (media name + timestamp where possible).`,
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.prompt(
    "meeting-brief",
    "Prepare a brief from recent meetings — pull transcripts, extract decisions, and summarize open items.",
    {
      days: z.string().optional().describe("Number of days to look back (default: 7)"),
      folder: z.string().optional().describe("Folder ID to scope to (optional)"),
    },
    async ({ days, folder }) => {
      const lookback = parseInt(days ?? "7");
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - lookback);

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Prepare a meeting brief from the last ${lookback} days.`,
                ``,
                folder ? `Scope: folder ${folder}` : `Scope: all media`,
                `Date range: ${fromDate.toISOString().split("T")[0]} to today`,
                ``,
                `Steps:`,
                `1. Use list_media to find recent recordings (from: ${fromDate.toISOString().split("T")[0]})`,
                `2. For each meeting, use get_media_insights to get summaries and action items`,
                `3. Compile a brief with:`,
                `   - Summary of each meeting (2-3 sentences)`,
                `   - All action items consolidated (grouped by owner if possible)`,
                `   - Key decisions made across meetings`,
                `   - Open questions or unresolved topics`,
                `   - Upcoming items that were mentioned`,
                ``,
                `Format as a clean, scannable document.`,
              ].join("\n"),
            },
          },
        ],
      };
    }
  );
}
