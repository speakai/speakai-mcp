import type {
  McpServer,
  RegisteredTool,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatAxiosError } from "../client.js";

export const passthroughOutputSchema = {
  data: z.unknown().describe("Response payload from the Speak AI API"),
} as const;

// Shared by every tool whose endpoint accepts speakerHints (media upload,
// media metadata update, folder create/update, recorder create/update).
export const speakerHintsShape = {
  speakerHints: z
    .object({
      expectedSpeakers: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Expected number of speakers, helps label speakers correctly"),
      names: z
        .array(z.string().max(50))
        .max(10)
        .optional()
        .describe("Names of the people speaking, used to label speakers"),
    })
    .optional()
    .describe("Optional. Who is speaking in the recording(s); improves speaker labeling."),
} as const;

type ToolResultContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface ToolResult {
  content: ToolResultContent[];
  structuredContent?: { data: unknown };
  isError?: boolean;
}

export function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: { data },
  };
}

export function err(error: unknown): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${formatAxiosError(error)}` }],
    isError: true,
  };
}

type SpeakToolAnnotations = {
  title?: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export function registerSpeakTool<InputSchema extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: InputSchema,
  annotations: SpeakToolAnnotations,
  handler: ToolCallback<InputSchema>
): RegisteredTool {
  const { title, ...toolAnnotations } = annotations;

  return server.registerTool(
    name,
    {
      title,
      description,
      inputSchema,
      outputSchema: passthroughOutputSchema,
      annotations: toolAnnotations,
    },
    (async (...args: Parameters<ToolCallback<InputSchema>>) => {
      const result = await handler(...args);
      if (result.isError || result.structuredContent) {
        return result;
      }

      const textContent = result.content?.find(
        (item) => item.type === "text" && typeof item.text === "string"
      );
      if (!textContent) {
        return { ...result, structuredContent: { data: null } };
      }

      try {
        return { ...result, structuredContent: { data: JSON.parse(textContent.text) } };
      } catch {
        return { ...result, structuredContent: { data: textContent.text } };
      }
    }) as ToolCallback<InputSchema>
  );
}
