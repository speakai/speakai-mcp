#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";
import { createSpeakClient, formatAxiosError } from "./client.js";

// Public API — for use as a library (e.g., from speak-server)
export { registerAllTools } from "./tools/index.js";
export { createSpeakClient, formatAxiosError } from "./client.js";

const server = new McpServer({
  name: "speak-ai",
  version: "1.0.0",
});

registerAllTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[speak-mcp] Server started on stdio transport\n");
}

main().catch((err) => {
  process.stderr.write(`[speak-mcp] Fatal error: ${err}\n`);
  process.exit(1);
});
