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

vi.mock("axios", () => ({
  default: {
    create: () => mockClient,
    isAxiosError: (e: any) => e?.isAxiosError === true,
  },
}));

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
      register(server, mockClient);

      mockGet.mockRejectedValueOnce(axiosError(401, { message: "Invalid API key" }));

      const callback = getToolCallback(server, "get_transcript");
      const result = await callback({ mediaId: "abc123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain("401");
    });

    it("handles 403 Forbidden gracefully", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      mockGet.mockRejectedValueOnce(axiosError(403, { message: "Insufficient permissions" }));

      const callback = getToolCallback(server, "get_media_insights");
      const result = await callback({ mediaId: "abc123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("403");
    });

    it("handles 404 Not Found gracefully", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      mockGet.mockRejectedValueOnce(axiosError(404, { message: "Media not found" }));

      const callback = getToolCallback(server, "get_media_status");
      const result = await callback({ mediaId: "nonexistent" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("404");
    });

    it("handles 429 Rate Limited gracefully", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

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
      register(server, mockClient);

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
      register(server, mockClient);

      mockGet.mockRejectedValueOnce(new Error("timeout of 60000ms exceeded"));

      const callback = getToolCallback(server, "get_transcript");
      const result = await callback({ mediaId: "abc123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("timeout");
    });

    it("handles DNS resolution failure", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      mockGet.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND api.speakai.co"));

      const callback = getToolCallback(server, "list_media");
      const result = await callback({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ENOTFOUND");
    });

    it("handles connection refused", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

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
      register(server, mockClient);

      mockGet.mockResolvedValueOnce({ data: null });

      const callback = getToolCallback(server, "get_transcript");
      const result = await callback({ mediaId: "abc123" });

      // JSON.stringify(null) = "null" — tool should not crash
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("null");
    });

    it("handles empty object response", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      mockGet.mockResolvedValueOnce({ data: {} });

      const callback = getToolCallback(server, "get_media_status");
      const result = await callback({ mediaId: "abc123" });

      expect(result.content[0].text).toBe("{}");
    });

    it("handles response with unexpected structure", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

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
      register(server, mockClient);

      mockGet.mockRejectedValueOnce(axiosError(500, { error: "db down" }));

      const callback = getToolCallback(server, "list_folders");
      const result = await callback({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });

    it("prompt tools handle errors", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient);

      mockPost.mockRejectedValueOnce(axiosError(503, { message: "Service unavailable" }));

      const callback = getToolCallback(server, "ask_magic_prompt");
      const result = await callback({ prompt: "test" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("503");
    });

    it("clip tools handle errors", async () => {
      const { register } = await import("../src/tools/clips.js");
      register(server, mockClient);

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
      register(server, mockClient);

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
