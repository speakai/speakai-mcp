import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Create a mock axios instance that tracks calls
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

const mockClient = {
  get: mockGet,
  post: mockPost,
  put: mockPut,
  delete: mockDelete,
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
} as any;

vi.mock("axios", async (importOriginal) => {
  const actual = (await importOriginal<typeof import("axios")>()).default;
  return {
    default: {
      create: () => mockClient,
      isAxiosError: (e: any) => e?.isAxiosError === true,
      AxiosError: actual.AxiosError,
    },
  };
});

function getToolCallback(server: McpServer, toolName: string): Function {
  const tools = (server as any)._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not registered`);
  return (params: any) => tool.handler(params, {});
}

// Helper to create an axios-like error with a response
function axiosError(status: number, data: any = {}, headers: Record<string, string> = {}) {
  const err: any = new Error(`Request failed with status code ${status}`);
  err.isAxiosError = true;
  err.response = { status, data, headers };
  return err;
}

describe("Error Handling & Resilience", () => {
  let server: McpServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
  });

  describe("HTTP error responses", () => {
    it("handles 401 Unauthorized gracefully", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockGet.mockRejectedValueOnce(axiosError(401, { message: "Invalid API key" }));

      const callback = getToolCallback(server, "get_transcript");
      const result = await callback({ mediaId: "abc123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain("401");
    });

    it("handles 403 Forbidden gracefully", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockGet.mockRejectedValueOnce(axiosError(403, { message: "Insufficient permissions" }));

      const callback = getToolCallback(server, "get_media_insights");
      const result = await callback({ mediaId: "abc123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("403");
    });

    it("handles 404 Not Found gracefully", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockGet.mockRejectedValueOnce(axiosError(404, { message: "Media not found" }));

      const callback = getToolCallback(server, "get_media_status");
      const result = await callback({ mediaId: "nonexistent" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("404");
    });

    it("handles 429 Rate Limited gracefully", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockPost.mockRejectedValueOnce(
        axiosError(429, { message: "Rate limit exceeded" }, { "retry-after": "5" })
      );

      const callback = getToolCallback(server, "upload_media");
      const result = await callback({
        name: "Test",
        url: "https://example.com/test.mp3",
        mediaType: "audio",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("429");
    });

    it("handles 500 Internal Server Error gracefully", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockGet.mockRejectedValueOnce(axiosError(500, { message: "Internal server error" }));

      const callback = getToolCallback(server, "list_media");
      const result = await callback({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("500");
    });
  });

  describe("Network errors", () => {
    it("handles connection timeout", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockGet.mockRejectedValueOnce(new Error("timeout of 60000ms exceeded"));

      const callback = getToolCallback(server, "get_transcript");
      const result = await callback({ mediaId: "abc123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("timeout");
    });

    it("handles DNS resolution failure", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockGet.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND api.speakai.co"));

      const callback = getToolCallback(server, "list_media");
      const result = await callback({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ENOTFOUND");
    });

    it("handles connection refused", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockGet.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:443"));

      const callback = getToolCallback(server, "get_media_insights");
      const result = await callback({ mediaId: "abc123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ECONNREFUSED");
    });
  });

  describe("Malformed API responses", () => {
    it("handles null response data without crashing", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockGet.mockResolvedValueOnce({ data: null });

      const callback = getToolCallback(server, "get_transcript");
      const result = await callback({ mediaId: "abc123" });

      // JSON.stringify(null) = "null" — tool should not crash
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("null");
    });

    it("handles empty object response", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockGet.mockResolvedValueOnce({ data: {} });

      const callback = getToolCallback(server, "get_media_status");
      const result = await callback({ mediaId: "abc123" });

      expect(result.content[0].text).toBe("{}");
    });

    it("handles response with unexpected structure", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockGet.mockResolvedValueOnce({ data: { unexpected: "shape" } });

      const callback = getToolCallback(server, "list_media");
      const result = await callback({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.unexpected).toBe("shape");
    });
  });

  describe("Error across tool categories", () => {
    it("folder tools handle errors", async () => {
      const { register } = await import("../src/tools/folders.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockGet.mockRejectedValueOnce(axiosError(500, { error: "db down" }));

      const callback = getToolCallback(server, "list_folders");
      const result = await callback({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });

    it("prompt tools handle errors", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient, { aiChat: true, automations: true, voiceTestRunDetails: true });

      mockPost.mockRejectedValueOnce(axiosError(503, { message: "Service unavailable" }));

      const callback = getToolCallback(server, "ask_ai_chat");
      const result = await callback({ prompt: "test" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("503");
    });

    it("clip tools handle errors", async () => {
      const { register } = await import("../src/tools/clips.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockPost.mockRejectedValueOnce(axiosError(400, { message: "Invalid time range" }));

      const callback = getToolCallback(server, "create_clip");
      const result = await callback({
        title: "Test",
        mediaType: "audio",
        timeRanges: [{ mediaId: "abc", startTime: 90, endTime: 60 }],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("400");
    });

    it("search tools handle errors", async () => {
      const { register } = await import("../src/tools/analytics.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      mockPost.mockRejectedValueOnce(new Error("Network error"));

      const callback = getToolCallback(server, "search_media");
      const result = await callback({ query: "test" });

      expect(result.isError).toBe(true);
    });
  });
});

describe("formatAxiosError", () => {
  it("formats axios error with status and JSON body", async () => {
    const { formatAxiosError } = await import("../src/client.js");
    const err: any = new Error("fail");
    err.isAxiosError = true;
    err.response = { status: 422, data: { message: "Validation failed" } };

    const result = formatAxiosError(err);
    // Our mock makes isAxiosError return true for objects with isAxiosError flag
    expect(result).toContain("422");
    expect(result).toContain("Validation failed");
  });

  it("formats plain Error", async () => {
    const { formatAxiosError } = await import("../src/client.js");
    const result = formatAxiosError(new Error("Something broke"));
    expect(result).toBe("Something broke");
  });

  it("formats non-Error values", async () => {
    const { formatAxiosError } = await import("../src/client.js");
    expect(formatAxiosError("string error")).toBe("string error");
    expect(formatAxiosError(42)).toBe("42");
    expect(formatAxiosError(null)).toBe("null");
    expect(formatAxiosError(undefined)).toBe("undefined");
  });
});

describe("Credit refusals", () => {
  const CHECKOUT_URL = "https://checkout.example.com/session/abc";
  const refusal = {
    status: "failed",
    code: 402,
    message: "Insufficient credits",
    reason: "OUT_OF_CREDITS",
    billing: { plan: "trial", creditsRemaining: 0, creditsNeeded: 12, canManageBilling: true },
    options: [{ id: "top_up", recommended: true, amount: 10, currency: "usd", credits: 100, url: CHECKOUT_URL }],
    checkoutUrl: CHECKOUT_URL,
    userMessage: "You are out of credits. Add credits to keep going.",
  };

  type Reply = { status: number; data: unknown };

  // A real axios instance whose adapter answers in place of the network.
  async function fakeApi(reply: (config: any) => Reply) {
    const realAxios = (await vi.importActual<typeof import("axios")>("axios")).default;
    const seen: any[] = [];
    const instance = realAxios.create({
      adapter: async (config) => {
        seen.push(config);
        const { status, data } = reply(config);
        const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
        if (status >= 400) {
          throw new realAxios.AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", config, {}, response);
        }
        return response;
      },
    });
    const server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server, instance, { aiChat: true });
    return { server, instance, seen };
  }

  function expectRefusal(result: any) {
    expect(result.isError).toBe(true);
    expect(result.content[0].text.split("\n")).toEqual([refusal.userMessage, `Continue here: ${CHECKOUT_URL}`]);
    expect(result.structuredContent.data).toMatchObject({ reason: "OUT_OF_CREDITS", billing: { creditsRemaining: 0 } });
  }

  it.each([
    { tool: "upload_media", args: { name: "Call", url: "https://example.com/a.mp3" }, status: 200 },
    { tool: "upload_media", args: { name: "Call", url: "https://example.com/a.mp3" }, status: 402 },
    { tool: "ask_ai_chat", args: { prompt: "Summarise" }, status: 200 },
    { tool: "ask_ai_chat", args: { prompt: "Summarise" }, status: 402 },
    { tool: "upload_and_analyze", args: { url: "https://example.com/a.mp3" }, status: 200 },
    { tool: "create_text_note", args: { name: "Note", text: "Hello" }, status: 403 },
  ])("$tool turns an HTTP $status refusal into a tool error and names itself in a header", async ({ tool, args, status }) => {
    const { server, seen } = await fakeApi(() => ({ status, data: refusal }));

    const result = await getToolCallback(server, tool)(args);

    expectRefusal(result);
    expect(seen.length).toBeGreaterThan(0);
    for (const config of seen) expect(config.headers.get("x-speakai-mcp-tool")).toBe(tool);
  });

  it("keeps a plain failed body as an error, and sends no tool header outside a tool call", async () => {
    const { server, instance, seen } = await fakeApi(() => ({ status: 200, data: { status: "failed", message: "Media is locked" } }));

    const result = await getToolCallback(server, "get_transcript")({ mediaId: "m1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Media is locked");

    await expect(instance.get("/v1/anything")).rejects.toThrow("Media is locked");
    expect(seen[1].headers.get("x-speakai-mcp-tool")).toBeUndefined();
  });

  it("upload_and_analyze_batch keeps the uploads made before a refusal and stops sending the rest", async () => {
    let calls = 0;
    const { server, seen } = await fakeApi(() =>
      ++calls === 1 ? { status: 200, data: { status: "success", data: { mediaId: "m1", state: "pending" } } } : { status: 402, data: refusal }
    );
    const urls = ["https://example.com/1.mp3", "https://example.com/2.mp3", "https://example.com/3.mp3"];

    const partial = await getToolCallback(server, "upload_and_analyze_batch")({ urls, concurrency: 1 });
    expect(partial.isError).toBeUndefined();
    const body = JSON.parse(partial.content[0].text);
    expect(body).toMatchObject({ uploaded: 1, failed: 1, notSent: [urls[2]], refusal: { reason: "OUT_OF_CREDITS" } });
    expect(body.nextSteps[0]).toContain(refusal.userMessage);
    expect(seen).toHaveLength(2);

    const none = await getToolCallback(server, "upload_and_analyze_batch")({ urls, concurrency: 1 });
    expectRefusal(none);
  });

  it("surfaces a refusal that a client without the response check passes through as success", async () => {
    const server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
    const { register } = await import("../src/tools/media.js");
    register(server, mockClient);
    mockPost.mockResolvedValueOnce({ data: refusal });

    expectRefusal(await getToolCallback(server, "upload_media")({ name: "Call", url: "https://example.com/a.mp3" }));
  });

  it("ok() and err() report failed bodies and refusals as errors", async () => {
    const { ok, err } = await import("../src/tools/_helpers.js");

    expect(ok({ status: "failed", message: "nope" }).isError).toBe(true);
    expect(ok({ status: "success", data: {} }).isError).toBeUndefined();
    expectRefusal(ok(refusal));
    expectRefusal(err(axiosError(402, refusal)));

    const reasonOnly = err(axiosError(402, { status: "failed", message: "Trial ended", reason: "TRIAL_ENDED" }));
    expect(reasonOnly.isError).toBe(true);
    expect(reasonOnly.content[0].text).toBe("Trial ended");
  });

  it("get_billing_status explains a missing route instead of failing opaquely", async () => {
    const { server } = await fakeApi(() => ({ status: 404, data: "Cannot GET /v1/subscription/billing-status" }));

    const result = await getToolCallback(server, "get_billing_status")({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not available from this Speak AI server yet");
  });
});
