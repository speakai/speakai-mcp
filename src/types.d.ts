import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";

export declare function registerAllTools(server: McpServer, client?: AxiosInstance): void;

export declare function createSpeakClient(options: {
  baseUrl: string;
  apiKey: string;
  accessToken: string;
}): AxiosInstance;

export declare function formatAxiosError(error: unknown): string;
