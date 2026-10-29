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

export const fieldIdSchema = z
  .string()
  .min(1)
  .refine((value) => !/^[0-9a-fA-F]{24}$/.test(value), {
    message:
      "This looks like the field's database _id. Use the field `id` from list_fields or create_field (12 characters).",
  })
  .describe("Field `id` from list_fields or create_field (12 characters), never the database `_id`");

export const SHARED_DASHBOARD_CACHE_NOTE =
  "Shared dashboard links cache widget data, so field and media edits can take up to about 5 minutes to show " +
  "for date ranges that include today (15 at most) and up to about 17 minutes for past ranges (60 at most); " +
  "any dashboard update refreshes it at once.";

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
  return server.registerTool(
    name,
    {
      title: annotations.title,
      description,
      inputSchema,
      outputSchema: passthroughOutputSchema,
      annotations,
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
