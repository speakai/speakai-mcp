import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";

export interface RegisterOptions {
  /** Register tools that read the local disk. Only for servers on the user's own machine (stdio, CLI). */
  localFileAccess?: boolean;
  /** Register the voice test-run tools (start, pause, resume, cancel, results). Defaults to true; pass false to leave them off. */
  voiceTestRuns?: boolean;
  /** Register ask_ai_chat, retry_ai_chat and get_analysis_quote. Speak's assistant behind them can call other tools, so the hosted server leaves this off. */
  aiChat?: boolean;
  /** Register the automation tools, build_automation and the inbound-webhook tools. Automation steps can run actions in connected third-party apps, so the hosted server leaves this off. */
  automations?: boolean;
  /** Register get_voice_test_run and apply_voice_test_recommendation. The hosted server leaves this off. */
  voiceTestRunDetails?: boolean;
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
 * Consumers (e.g. speak-server's orchestrator bridge) can import this to route
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
