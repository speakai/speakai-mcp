import { McpServer } from "@modelcontextprotocol/server";
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
import * as labels from "./labels.js";
import * as comments from "./comments.js";
import * as automations from "./automations.js";
import * as webhooks from "./webhooks.js";
import * as analytics from "./analytics.js";
import * as clips from "./clips.js";
import * as workflows from "./workflows.js";
import * as users from "./users.js";
import * as dashboards from "./dashboards.js";
import * as voice from "./voice.js";
import * as voiceTesting from "./voice-testing.js";
import * as voiceQuestions from "./voice-questions.js";
import * as voiceIntelligence from "./voice-intelligence.js";
import * as billing from "./billing.js";
import { instrumentSpeakClient } from "../client.js";
import { registerMediaListCard } from "../ui/media-list/index.js";
import { setToolCallListener } from "./_helpers.js";

export interface ToolCallEvent {
  event: "mcp.tool.call";
  tool: string;
  ok: boolean;
  refusal?: string;
  status?: number;
  durationMs: number;
}

export interface RegisterOptions {
  localFileAccess?: boolean;
  voiceTestRuns?: boolean;
  aiChat?: boolean;
  aiChatAnswerOnly?: boolean;
  automations?: boolean;
  voiceTestRunDetails?: boolean;
  onToolCall?: (event: ToolCallEvent) => void;
  cards?: boolean;
}

type ToolModule = {
  register(server: McpServer, client?: AxiosInstance, options?: RegisterOptions): void;
};

const modules: ToolModule[] = [
  media,
  text,
  exports,
  folders,
  recorder,
  embed,
  prompt,
  meeting,
  fields,
  labels,
  comments,
  automations,
  webhooks,
  analytics,
  clips,
  workflows,
  users,
  dashboards,
  voice,
  voiceTesting,
  voiceQuestions,
  voiceIntelligence,
  billing,
];

/**
 * Register all MCP tools on a server instance.
 * @param server - McpServer instance
 * @param client - Optional custom axios client (for server-side use with per-request auth).
 *                 If omitted, uses the default client from env vars (STDIO mode).
 * @param options - Set localFileAccess only where the server runs on the user's machine. The voice
 *                  test-run tools register unless voiceTestRuns is false. Set aiChat to register Speak's
 *                  AI Chat tools, whose assistant can call other tools. Set aiChatAnswerOnly instead to
 *                  register them with answer-only descriptions, for the hosted server, where Speak runs the
 *                  chat for AI-assistant connections with read tools over the person's recordings only.
 *                  Set automations to register the automation tools, whose steps can run actions in
 *                  connected third-party apps; the hosted server leaves it off. Set voiceTestRunDetails to register get_voice_test_run and
 *                  apply_voice_test_recommendation; the hosted server leaves it off. Set onToolCall to receive
 *                  one usage event per tool call (tool name, outcome, refusal reason, HTTP status, duration;
 *                  never arguments or results). Nothing is logged when it is not set.
 *                  Set cards to register the file list card (ui://speak/media-list) and show it for
 *                  list_media and search_media in chat apps that support MCP Apps.
 */
export function registerAllTools(
  server: McpServer,
  client?: AxiosInstance,
  options: RegisterOptions = {}
): void {
  if (client) instrumentSpeakClient(client);
  if (options.onToolCall) setToolCallListener(server, options.onToolCall);
  for (const mod of modules) {
    mod.register(server, client, options);
  }
  if (options.cards) registerMediaListCard(server);
}
