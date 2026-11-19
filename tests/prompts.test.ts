/**
 * Tests for src/prompts.ts — prompt handler callbacks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";

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
  return (args: Record<string, unknown>) => prompt.handler(args, {});
}

const PROMPT_CALLS = [
  { name: "analyze-meeting", args: { url: "https://example.com/a.mp3" } },
  { name: "research-across-media", args: { topic: "pricing" } },
  { name: "meeting-brief", args: {} },
];

describe("Prompts", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { registerPrompts } = await import("../src/prompts.js");
    registerPrompts(server);
  });

  async function promptText(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await getPromptCallback(server, name)(args);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ role: "user", content: { type: "text" } });
    return result.messages[0].content.text;
  }

  it.each(PROMPT_CALLS)("$name only tells the model to call tools that exist", async ({ name, args }) => {
    const { SPEAK_MCP_TOOL_NAMES } = await import("../src/tool-names.js");
    const mentioned = (await promptText(name, args)).match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];

    expect(mentioned.length).toBeGreaterThan(0);
    expect(mentioned.filter((tool) => !(SPEAK_MCP_TOOL_NAMES as readonly string[]).includes(tool))).toEqual([]);
  });

  it.each(PROMPT_CALLS)("$name ends with one offer to send feedback with submit_feedback", async ({ name, args }) => {
    const { FEEDBACK_OFFER } = await import("../src/prompts.js");
    const text = await promptText(name, args);

    expect(text.endsWith(FEEDBACK_OFFER)).toBe(true);
    expect(text.indexOf(FEEDBACK_OFFER)).toBe(text.lastIndexOf(FEEDBACK_OFFER));
  });

  describe("analyze-meeting", () => {
    it.each([
      [{ url: "https://example.com/a.mp3" }, "Meeting"],
      [{ url: "https://example.com/a.mp3", name: "Sprint Retro" }, "Sprint Retro"],
    ])("passes the URL and name %o to upload_and_analyze", async (args, name) => {
      const text = await promptText("analyze-meeting", args);

      expect(text).toContain("https://example.com/a.mp3");
      expect(text).toContain(name);
    });
  });

  describe("research-across-media", () => {
    it.each([
      [{ topic: "customer feedback" }, "entire workspace", "folder"],
      [{ topic: "onboarding", folder: "folder123" }, "folder folder123", "entire workspace"],
    ])("scopes %o", async (args, scope, notScope) => {
      const text = await promptText("research-across-media", args);

      expect(text).toContain(args.topic);
      expect(text).toContain(scope);
      expect(text).not.toContain(notScope);
    });
  });

  describe("meeting-brief", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      [{}, 7, "2026-03-03", "Scope: all media"],
      [{ days: "14", folder: "f99" }, 14, "2026-02-24", "Scope: folder f99"],
    ])("looks back over %o", async (args, days, from, scope) => {
      const text = await promptText("meeting-brief", args);

      expect(text).toContain(`last ${days} days`);
      expect(text).toContain(`Date range: ${from} to today`);
      expect(text).toContain(`(from: ${from})`);
      expect(text).toContain(scope);
    });

    it.each(["two weeks", "", "0", "-3", "999999999999"])("falls back to 7 days for an unusable days value %j", async (days) => {
      const text = await promptText("meeting-brief", { days });

      expect(text).toContain("last 7 days");
      expect(text).toContain("Date range: 2026-03-03 to today");
    });
  });
});
