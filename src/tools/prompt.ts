import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer): void {
  server.tool(
    "list_prompts",
    "List all available Magic Prompt templates for AI-powered questions about your media.",
    {},
    async () => {
      try {
        const result = await speakClient.get("/v1/prompt");
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "ask_magic_prompt",
    "Ask an AI-powered question about a specific media file using Speak AI's Magic Prompt.",
    {
      mediaId: z.string().describe("Unique identifier of the media file to query"),
      prompt: z.string().describe("The question or prompt to ask about the media"),
      promptId: z
        .string()
        .optional()
        .describe("ID of a predefined prompt template to use"),
    },
    async (body) => {
      try {
        const result = await speakClient.post("/v1/prompt", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );
}
