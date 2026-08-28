/**
 * Tests for src/prompts.ts — prompt handler callbacks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("axios", () => ({
  default: {
    create: () => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    }),
    isAxiosError: () => false,
  },
}));

function getPromptCallback(server: McpServer, promptName: string): Function {
  const prompts = (server as any)._registeredPrompts;
  const prompt = prompts[promptName];
  if (!prompt) {
    throw new Error(`Prompt "${promptName}" not registered. Available: ${Object.keys(prompts).join(", ")}`);
  }
  return prompt.callback;
}

describe("Prompts", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { registerPrompts } = await import("../src/prompts.js");
    registerPrompts(server);
  });

  // ── analyze-meeting ───────────────────────────────────────────────

  describe("analyze-meeting", () => {
    it("returns a correctly structured message with URL and default name", async () => {
      const cb = getPromptCallback(server, "analyze-meeting");
      const result = await cb({ url: "https://example.com/meeting.mp3" });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[0].content.type).toBe("text");
      expect(result.messages[0].content.text).toContain("https://example.com/meeting.mp3");
      expect(result.messages[0].content.text).toContain("Meeting");
      expect(result.messages[0].content.text).toContain("upload_and_analyze");
    });

    it("uses the provided name when supplied", async () => {
      const cb = getPromptCallback(server, "analyze-meeting");
      const result = await cb({ url: "https://example.com/a.mp3", name: "Sprint Retro" });

      expect(result.messages[0].content.text).toContain("Sprint Retro");
    });

    it("includes key analysis sections in the text", async () => {
      const cb = getPromptCallback(server, "analyze-meeting");
      const result = await cb({ url: "https://example.com/a.mp3" });
      const text = result.messages[0].content.text;

      expect(text).toContain("Key discussion points");
      expect(text).toContain("Action items");
      expect(text).toContain("Decisions made");
      expect(text).toContain("sentiment");
    });
  });

  // ── research-across-media ─────────────────────────────────────────

  describe("research-across-media", () => {
    it("returns a correctly structured message with the topic", async () => {
      const cb = getPromptCallback(server, "research-across-media");
      const result = await cb({ topic: "customer feedback" });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[0].content.type).toBe("text");
      expect(result.messages[0].content.text).toContain("customer feedback");
      expect(result.messages[0].content.text).toContain("entire workspace");
    });

    it("scopes to a folder when folder param is provided", async () => {
      const cb = getPromptCallback(server, "research-across-media");
      const result = await cb({ topic: "onboarding", folder: "folder123" });

      expect(result.messages[0].content.text).toContain("folder folder123");
      expect(result.messages[0].content.text).not.toContain("entire workspace");
    });

    it("includes research methodology steps", async () => {
      const cb = getPromptCallback(server, "research-across-media");
      const result = await cb({ topic: "trends" });
      const text = result.messages[0].content.text;

      expect(text).toContain("search_media");
      expect(text).toContain("ask_ai_chat");
      expect(text).toContain("Common themes");
      expect(text).toContain("citations");
    });
  });

  // ── meeting-brief ─────────────────────────────────────────────────

  describe("meeting-brief", () => {
    it("returns a correctly structured message with default 7-day lookback", async () => {
      const cb = getPromptCallback(server, "meeting-brief");
      const result = await cb({});

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[0].content.type).toBe("text");
      expect(result.messages[0].content.text).toContain("last 7 days");
      expect(result.messages[0].content.text).toContain("all media");
    });

    it("uses custom days parameter", async () => {
      const cb = getPromptCallback(server, "meeting-brief");
      const result = await cb({ days: "14" });

      expect(result.messages[0].content.text).toContain("last 14 days");
    });

    it("scopes to a folder when provided", async () => {
      const cb = getPromptCallback(server, "meeting-brief");
      const result = await cb({ folder: "f99" });

      expect(result.messages[0].content.text).toContain("folder f99");
      expect(result.messages[0].content.text).not.toContain("all media");
    });

    it("includes the expected workflow steps", async () => {
      const cb = getPromptCallback(server, "meeting-brief");
      const result = await cb({});
      const text = result.messages[0].content.text;

      expect(text).toContain("list_media");
      expect(text).toContain("get_media_insights");
      expect(text).toContain("action items");
      expect(text).toContain("Key decisions");
    });

    it("computes a valid date range", async () => {
      const cb = getPromptCallback(server, "meeting-brief");
      const result = await cb({ days: "3" });
      const text = result.messages[0].content.text;

      // Should contain an ISO date string (YYYY-MM-DD format)
      const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/);
      expect(dateMatch).not.toBeNull();

      // The from-date should be in the past
      const fromDate = new Date(dateMatch![0]);
      expect(fromDate.getTime()).toBeLessThan(Date.now());
    });
  });
});
