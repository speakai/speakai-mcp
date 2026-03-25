import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";

import * as media from "./media.js";
import * as text from "./text.js";
import * as exports from "./exports.js";
import * as folders from "./folders.js";
import * as recorder from "./recorder.js";
import * as embed from "./embed.js";
import * as prompt from "./prompt.js";
import * as meeting from "./meeting.js";
import * as fields from "./fields.js";
import * as automations from "./automations.js";
import * as webhooks from "./webhooks.js";
import * as analytics from "./analytics.js";
import * as clips from "./clips.js";
import * as workflows from "./workflows.js";

const modules = [
  media,
  text,
  exports,
  folders,
  recorder,
  embed,
  prompt,
  meeting,
  fields,
  automations,
  webhooks,
  analytics,
  clips,
  workflows,
];

/**
 * Register all MCP tools on a server instance.
 * @param server - McpServer instance
 * @param client - Optional custom axios client (for server-side use with per-request auth).
 *                 If omitted, uses the default client from env vars (STDIO mode).
 */
export function registerAllTools(server: McpServer, client?: AxiosInstance): void {
  for (const mod of modules) {
    mod.register(server, client);
  }
}
