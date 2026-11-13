import type { McpServer } from "@modelcontextprotocol/server";
import { AxiosInstance } from "axios";

export interface RegisterOptions {
  /** Register tools that read the local disk. Only for servers on the user's own machine (stdio, CLI). */
  localFileAccess?: boolean;
  /** Register the voice test-run tools (start, pause, resume, cancel, results). Defaults to true; pass false to leave them off. */
  voiceTestRuns?: boolean;
  /** Register ask_ai_chat, retry_ai_chat and get_analysis_quote. Speak's assistant behind them can call other tools. */
  aiChat?: boolean;
  /** Register the same AI Chat tools with answer-only descriptions. For the hosted server: Speak runs chat from AI-assistant connections with read tools over the person's recordings only, and no actions in other apps. */
  aiChatAnswerOnly?: boolean;
  /** Register the automation tools, build_automation and the inbound-webhook tools. Automation steps can run actions in connected third-party apps, so the hosted server leaves this off. */
  automations?: boolean;
  /** Register get_voice_test_run and apply_voice_test_recommendation. The hosted server leaves this off. */
  voiceTestRunDetails?: boolean;
  /** Register the file list card (MCP Apps resource ui://speak/media-list) and show it for list_media and search_media. Off by default. */
  cards?: boolean;
  /** Receives one usage event per tool call. Events never carry tool arguments, results or user text. Off when not set. */
  onToolCall?: (event: ToolCallEvent) => void;
}

/** One tool call. `refusal` and `status` are set only when `ok` is false and the API gave them. */
export interface ToolCallEvent {
  event: "mcp.tool.call";
  tool: string;
  ok: boolean;
  /** The API's refusal reason, such as running out of credits. */
  refusal?: string;
  /** HTTP status of the failing API call. */
  status?: number;
  durationMs: number;
}

export declare function registerAllTools(
  server: McpServer,
  client?: AxiosInstance,
  options?: RegisterOptions
): void;

export declare function createSpeakClient(options: {
  baseUrl: string;
  apiKey: string;
  accessToken: string;
}): AxiosInstance;

export declare function formatAxiosError(error: unknown): string;

/**
 * Static manifest of every Speak MCP tool name exposed by `registerAllTools`.
 * Consumers (e.g. the API server's orchestrator bridge) can import this to route
 * or validate tool calls without spinning up an `McpServer` instance.
 */
export declare const SPEAK_MCP_TOOL_NAMES: readonly string[];

export type SpeakMcpToolName = (typeof SPEAK_MCP_TOOL_NAMES)[number];

/** Every tool's category (id, display name, tool names), generated from tools.json. */
export declare const SPEAK_MCP_TOOL_CATEGORIES: readonly {
  readonly id: string;
  readonly name: string;
  readonly tools: readonly string[];
}[];
export type SpeakMcpToolCategory = (typeof SPEAK_MCP_TOOL_CATEGORIES)[number];
