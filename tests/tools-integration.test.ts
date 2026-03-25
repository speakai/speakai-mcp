import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Create a mock axios instance that tracks calls
const mockGet = vi.fn().mockResolvedValue({ data: { data: {} } });
const mockPost = vi.fn().mockResolvedValue({ data: { data: {} } });
const mockPut = vi.fn().mockResolvedValue({ data: { data: {} } });
const mockDelete = vi.fn().mockResolvedValue({ data: { data: {} } });

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
    isAxiosError: () => false,
  },
}));

function getToolCallback(server: McpServer, toolName: string): Function {
  const tools = (server as any)._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not registered`);
  return (params: any) => tool.handler(params, {});
}

describe("Tools Integration Tests", () => {
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
  });

  describe("Media tools", () => {
    it("upload_media calls POST /v1/media/upload", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "upload_media");
      await callback({
        name: "Test Recording",
        url: "https://example.com/test.mp3",
        mediaType: "audio",
      });

      expect(mockPost).toHaveBeenCalledWith("/v1/media/upload", {
        name: "Test Recording",
        url: "https://example.com/test.mp3",
        mediaType: "audio",
      });
    });

    it("list_media calls GET /v1/media with params", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "list_media");
      await callback({ mediaType: "audio", page: 1, pageSize: 10 });

      expect(mockGet).toHaveBeenCalledWith("/v1/media", {
        params: { mediaType: "audio", page: 1, pageSize: 10 },
      });
    });

    it("get_transcript calls GET /v1/media/transcript/:id", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "get_transcript");
      await callback({ mediaId: "abc123" });

      expect(mockGet).toHaveBeenCalledWith("/v1/media/transcript/abc123");
    });

    it("delete_media calls DELETE /v1/media/:id", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "delete_media");
      await callback({ mediaId: "abc123" });

      expect(mockDelete).toHaveBeenCalledWith("/v1/media/abc123");
    });

    it("get_media_status calls GET /v1/media/status/:id", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "get_media_status");
      await callback({ mediaId: "abc123" });

      expect(mockGet).toHaveBeenCalledWith("/v1/media/status/abc123");
    });
  });

  describe("Prompt/Chat tools", () => {
    it("ask_magic_prompt calls POST /v1/prompt with all params", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "ask_magic_prompt");
      await callback({
        prompt: "What were the action items?",
        mediaIds: ["id1", "id2"],
        assistantType: "researcher",
      });

      expect(mockPost).toHaveBeenCalledWith("/v1/prompt", {
        prompt: "What were the action items?",
        mediaIds: ["id1", "id2"],
        assistantType: "researcher",
      });
    });

    it("ask_magic_prompt works without mediaIds (workspace-wide)", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "ask_magic_prompt");
      await callback({ prompt: "What themes appear across all interviews?" });

      expect(mockPost).toHaveBeenCalledWith("/v1/prompt", {
        prompt: "What themes appear across all interviews?",
      });
    });

    it("get_chat_history calls GET /v1/prompt/history", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "get_chat_history");
      await callback({ limit: 5 });

      expect(mockGet).toHaveBeenCalledWith("/v1/prompt/history", {
        params: { limit: 5 },
      });
    });

    it("list_prompts calls GET /v1/prompt", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "list_prompts");
      await callback({});

      expect(mockGet).toHaveBeenCalledWith("/v1/prompt");
    });
  });

  describe("Search tools", () => {
    it("search_media calls POST /v1/analytics/search", async () => {
      const { register } = await import("../src/tools/analytics.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "search_media");
      await callback({ query: "pricing concerns", startDate: "2026-01-01" });

      expect(mockPost).toHaveBeenCalledWith("/v1/analytics/search", {
        query: "pricing concerns",
        startDate: "2026-01-01",
      });
    });
  });

  describe("Clips tools", () => {
    it("create_clip calls POST /v1/clips", async () => {
      const { register } = await import("../src/tools/clips.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "create_clip");
      await callback({
        title: "Key Moment",
        mediaType: "audio",
        timeRanges: [{ mediaId: "abc", startTime: 60, endTime: 90 }],
      });

      expect(mockPost).toHaveBeenCalledWith("/v1/clips", {
        title: "Key Moment",
        mediaType: "audio",
        timeRanges: [{ mediaId: "abc", startTime: 60, endTime: 90 }],
      });
    });

    it("delete_clip calls DELETE /v1/clips/:id", async () => {
      const { register } = await import("../src/tools/clips.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "delete_clip");
      await callback({ clipId: "clip123" });

      expect(mockDelete).toHaveBeenCalledWith("/v1/clips/clip123");
    });
  });

  describe("Error handling", () => {
    it("returns isError true when API call fails", async () => {
      mockGet.mockRejectedValueOnce(new Error("Network error"));

      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "get_transcript");
      const result = await callback({ mediaId: "bad-id" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });

    it("returns formatted JSON on success", async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: { mediaId: "abc", state: "processed" } },
      });

      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "get_media_status");
      const result = await callback({ mediaId: "abc" });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].type).toBe("text");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.mediaId).toBe("abc");
    });
  });
});
