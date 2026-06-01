import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";

export declare function registerAllTools(server: McpServer, client?: AxiosInstance): void;

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
