import type {
  McpServer,
  RegisteredTool,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type ApiRefusal,
  formatAxiosError,
  formatRefusal,
  getApiRefusal,
  isFailedBody,
  noteToolFailure,
  runToolCall,
  type ToolCallContext,
} from "../client.js";
import type { ToolCallEvent } from "./index.js";

const toolCallListeners = new WeakMap<object, (event: ToolCallEvent) => void>();

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
  _meta?: Record<string, unknown>;
}

export function refusalResult(refusal: ApiRefusal): ToolResult {
  noteToolFailure(refusal, refusal);
  return {
    content: [{ type: "text", text: formatRefusal(refusal) }],
    structuredContent: { data: refusal },
    isError: true,
  };
}

function failedBodyResult(data: unknown): ToolResult | undefined {
  const refusal = getApiRefusal(data);
  if (refusal) return refusalResult(refusal);
  if (!isFailedBody(data)) return undefined;
  return {
    content: [{ type: "text", text: `Error: ${JSON.stringify(data, null, 2)}` }],
    structuredContent: { data },
    isError: true,
  };
}

export function ok(data: unknown): ToolResult {
  return (
    failedBodyResult(data) ?? {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { data },
    }
  );
}

export function err(error: unknown): ToolResult {
  noteToolFailure(error);
  const refusal = getApiRefusal(error);
  if (refusal) return refusalResult(refusal);
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
  handler: (args: z.infer<z.ZodObject<InputSchema>>, extra: Parameters<ToolCallback>[0]) => ToolResult | Promise<ToolResult>,
  toolMeta?: Record<string, unknown>
): RegisteredTool {
  // The SDK's registerTool and ToolCallback generics compare zod 3 and zod 4 shapes per tool and run tsc out of memory.
  const registerTool = server.registerTool.bind(server) as (name: string, config: object, cb: unknown) => RegisteredTool;
  return registerTool(
    name,
    {
      title: annotations.title,
      description,
      inputSchema,
      outputSchema: passthroughOutputSchema,
      annotations,
      ...(toolMeta ? { _meta: toolMeta } : {}),
    },
    async (args: z.infer<z.ZodObject<InputSchema>>, extra: Parameters<ToolCallback>[0]) =>
      runToolCall(name, async (context) => {
        const startedAt = performance.now();
        let result: ToolResult | undefined;
        try {
          result = normalizeToolResult(await handler(args, extra), context);
          return result;
        } finally {
          reportToolCall(server, name, startedAt, result, context);
        }
      })
  );
}

function normalizeToolResult(result: ToolResult, context: ToolCallContext): ToolResult {
  if (result.isError && context.refusal) {
    return refusalResult(context.refusal);
  }
  if (result.isError || result.structuredContent) {
    return result;
  }

  const textContent = result.content?.find(
    (item): item is Extract<ToolResultContent, { type: "text" }> => item.type === "text"
  );
  if (!textContent) {
    return { ...result, structuredContent: { data: null } };
  }

  let data: unknown;
  try {
    data = JSON.parse(textContent.text);
  } catch {
    return { ...result, structuredContent: { data: textContent.text } };
  }
  // Covers a client that bypassed instrumentSpeakClient and passed a refusal through as success.
  const refusal = getApiRefusal(data);
  if (refusal) return refusalResult(refusal);
  return { ...result, structuredContent: { data } };
}

export function setToolCallListener(server: object, listener: (event: ToolCallEvent) => void): void {
  toolCallListeners.set(server, listener);
}

function reportToolCall(
  server: object,
  tool: string,
  startedAt: number,
  result: ToolResult | undefined,
  context: ToolCallContext
): void {
  const listener = toolCallListeners.get(server);
  if (!listener) return;
  const ok = result !== undefined && !result.isError;
  const event: ToolCallEvent = { event: "mcp.tool.call", tool, ok, durationMs: Math.round(performance.now() - startedAt) };
  if (!ok && context.refusal) {
    event.refusal = typeof context.refusal.reason === "string" ? context.refusal.reason : "declined";
  }
  if (!ok && context.status !== undefined) event.status = context.status;
  try {
    listener(event);
  } catch {
    return;
  }
}
