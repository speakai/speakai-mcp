#!/usr/bin/env node

// Public API — for use as a library (e.g., from speak-server)
export { registerAllTools } from "./tools/index.js";
export { createSpeakClient, formatAxiosError } from "./client.js";

/**
 * Entry point: detect whether we're running as CLI or MCP server.
 *
 * - `speak-mcp` (bare)                  → MCP STDIO server
 * - `speak-mcp list-media`              → CLI mode
 * - `speak-mcp config set-key`          → CLI mode
 * - `speak-mcp --help`                  → CLI help
 */
const args = process.argv.slice(2);

// Known CLI subcommands — if first arg matches one of these, run CLI mode
const cliCommands = [
  "config",
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
  "schedule-meeting",
  "help",
];

const isCliMode =
  args.length > 0 &&
  (args[0].startsWith("-") || cliCommands.includes(args[0]));

if (isCliMode) {
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
} else {
  // MCP STDIO server mode (bare invocation or piped input)
  import("@modelcontextprotocol/sdk/server/mcp.js").then(({ McpServer }) => {
    import("@modelcontextprotocol/sdk/server/stdio.js").then(
      ({ StdioServerTransport }) => {
        import("./tools/index.js").then(({ registerAllTools }) => {
          const server = new McpServer({
            name: "speak-ai",
            version: "1.0.0",
          });

          registerAllTools(server);

          const transport = new StdioServerTransport();
          server.connect(transport).then(() => {
            process.stderr.write(
              "[speak-mcp] Server started on stdio transport\n"
            );
          });
        });
      }
    );
  });
}
