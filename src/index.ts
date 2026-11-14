#!/usr/bin/env node

// Public API — for use as a library (e.g., from the API server)
export { registerAllTools } from "./tools/index.js";
export type { RegisterOptions, ToolCallEvent } from "./tools/index.js";
export { registerResources } from "./resources.js";
export { registerPrompts } from "./prompts.js";
export { createSpeakClient, formatAxiosError } from "./client.js";
export { SPEAK_MCP_TOOL_NAMES, type SpeakMcpToolName } from "./tool-names.js";
export { SPEAK_MCP_TOOL_CATEGORIES, type SpeakMcpToolCategory } from "./tool-categories.js";

/**
 * Entry point: detect whether we're running as CLI or MCP server.
 *
 * - `speakai-mcp` (bare)                  → MCP STDIO server
 * - `speakai-mcp list-media`              → CLI mode
 * - `speakai-mcp config set-key`          → CLI mode
 * - `speakai-mcp --help`                  → CLI help
 */
const args = process.argv.slice(2);

// Known CLI subcommands — if first arg matches one of these, run CLI mode
const cliCommands = [
  "config",
  "init",
  "list-media",
  "ls",
  "get-transcript",
  "transcript",
  "get-insights",
  "insights",
  "upload",
  "export",
  "status",
  "create-text",
  "list-folders",
  "folders",
  "ask",
  "chat-history",
  "search",
  "delete",
  "update",
  "create-folder",
  "favorites",
  "stats",
  "languages",
  "captions",
  "reanalyze",
  "clips",
  "clip",
  "schedule-meeting",
  "list-meeting-events",
  "live-transcript",
  "move",
  "tools",
  "call",
  "help",
];

const isCliMode =
  args.length > 0 &&
  (args[0].startsWith("-") || cliCommands.includes(args[0]));

// Importing the package as a library must never read the host's stdin or write to its stdout.
const isEntryPoint = typeof module !== "undefined" && require.main === module;

if (isEntryPoint && isCliMode) {
  // CLI mode — resolve config before importing client
  import("./cli/config.js").then(({ resolveApiKey, resolveBaseUrl }) => {
    resolveApiKey();
    resolveBaseUrl();
    import("./cli/index.js").then(({ createCli }) => {
      const program = createCli();
      program.parseAsync(process.argv).catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      });
    });
  });
} else if (isEntryPoint) {
  // MCP STDIO server mode (bare invocation or piped input)
  Promise.all([
    import("@modelcontextprotocol/server"),
    import("@modelcontextprotocol/server/stdio"),
    import("./tools/index.js"),
    import("./resources.js"),
    import("./prompts.js"),
  ]).then(([{ McpServer }, { serveStdio }, { registerAllTools }, { registerResources }, { registerPrompts }]) => {
    serveStdio(() => {
      const server = new McpServer({
        name: "speak-ai",
        version: "1.0.0",
      });

      registerAllTools(server, undefined, { localFileAccess: true, voiceTestRuns: true, aiChat: true, automations: true, voiceTestRunDetails: true, cards: process.env.SPEAK_MCP_CARDS === "true" });
      registerResources(server);
      registerPrompts(server);
      return server;
    });
    process.stderr.write("[speakai-mcp] Server started on stdio transport\n");
  });
}
