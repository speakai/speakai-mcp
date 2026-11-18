import { McpServer } from "@modelcontextprotocol/server";
import axios, { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool, ok, err, type ToolResult } from "./_helpers.js";
import { speakClient } from "../client.js";

// Saved as the same "improvement" record the in-app suggestion box writes, so it reaches the team's Slack.
const SURFACE_PREFIX = "MCP";
const SURFACE_MAX = 200;
const APP_VERSION_MAX = 100;

/** Shown in the Slack post as the "Page" line, so the team can see the request came from an AI assistant. */
export function feedbackSurface(area?: string): string {
  const topic = area?.trim();
  return (topic ? `${SURFACE_PREFIX}: ${topic}` : SURFACE_PREFIX).slice(0, SURFACE_MAX);
}

/** Shown in the Slack post as the "App version" line: which AI app sent it, when the client said. */
export function feedbackAppVersion(clientInfo?: { name?: string; version?: string }): string {
  const client = [clientInfo?.name, clientInfo?.version].filter(Boolean).join(" ").trim();
  return (client ? `${SURFACE_PREFIX} via ${client}` : SURFACE_PREFIX).slice(0, APP_VERSION_MAX);
}

function hourlyLimitResult(nextAllowedAt: unknown): ToolResult {
  const when = typeof nextAllowedAt === "string" ? ` They can send more after ${nextAllowedAt}.` : "";
  return {
    content: [
      {
        type: "text",
        text:
          "Error: This person already sent feedback to Speak AI in the last hour, and the limit is one an hour." +
          when +
          " Do not retry now. Tell them, and offer to send it later or by email to success@speakai.co.",
      },
    ],
    structuredContent: { data: { status: "failed", reason: "FEEDBACK_HOURLY_LIMIT", nextAllowedAt } },
    isError: true,
  };
}

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "submit_feedback",
    "Send the person's feedback about Speak AI (a bug, something confusing, a missing feature, or praise) straight to the Speak AI team. " +
      "When to offer it: when the person is frustrated with Speak AI, hits a bug or a limit, asks for something Speak AI cannot do, " +
      "or says what they like or dislike about it. Offer once in a conversation, in one short sentence, and do not repeat the offer if they decline. " +
      "Rules: send only with the person's clear yes. Write it in their words, show them the exact text first, and leave out recording or transcript content " +
      "and anyone else's personal details unless they ask you to include them. " +
      "Limit: one message an hour for each person; a refusal returns when they can send again, so do not retry. " +
      "For feedback on a single AI Chat answer, use submit_chat_feedback instead.",
    {
      text: z
        .string()
        .trim()
        .min(10)
        .max(4000)
        .describe("The feedback in the person's own words, as they approved it. 10 to 4000 characters."),
      area: z
        .string()
        .trim()
        .max(150)
        .optional()
        .describe("The Speak AI feature or tool the feedback is about, for example \"transcripts\", \"meeting assistant\" or \"upload_and_analyze\"."),
    },
    {
      title: "Submit Feedback",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ text, area }) => {
      try {
        const result = await api.post(
          "/v1/feedback",
          {
            type: "improvement",
            trigger: "manual",
            surface: feedbackSurface(area),
            text,
            context: { appVersion: feedbackAppVersion(server.server.getClientVersion()) },
          },
          // The hourly limit answers 429 too; waiting and retrying only repeats the refusal.
          { skipRateLimitRetry: true }
        );
        return ok(result.data);
      } catch (error) {
        const hourlyLimit = axios.isAxiosError(error) && error.response?.status === 429 ? error.response.data?.nextAllowedAt : undefined;
        if (hourlyLimit !== undefined) return hourlyLimitResult(hourlyLimit);
        return err(error);
      }
    }
  );
}
