import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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

function getToolInputSchema(server: McpServer, toolName: string): any {
  const tools = (server as any)._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not registered`);
  return tool.inputSchema;
}

function getToolCallback(server: McpServer, toolName: string): Function {
  const tools = (server as any)._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not registered`);
  return (params: any) => tool.handler(params, {});
}

describe("Input Validation — Zod Schema Boundary Tests", () => {
  let server: McpServer;

  beforeEach(() => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
  });

  describe("Media tools", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);
    });

    describe("upload_media", () => {
      it("accepts valid input with all required fields", async () => {
        const callback = getToolCallback(server, "upload_media");
        const result = await callback({
          name: "Test",
          url: "https://example.com/test.mp3",
          mediaType: "audio",
        });
        expect(result.isError).toBeUndefined();
        expect(mockPost).toHaveBeenCalled();
      });

      it("accepts valid input with optional fields", async () => {
        const callback = getToolCallback(server, "upload_media");
        await callback({
          name: "Full Upload",
          url: "https://example.com/test.mp4",
          mediaType: "video",
          description: "A test video",
          sourceLanguage: "en-US",
          tags: "test,demo",
          folderId: "folder123",
        });
        expect(mockPost).toHaveBeenCalledWith("/v1/media/upload", expect.objectContaining({
          name: "Full Upload",
          mediaType: "video",
          description: "A test video",
          sourceLanguage: "en-US",
        }));
      });

      it("accepts custom fields array", async () => {
        const callback = getToolCallback(server, "upload_media");
        await callback({
          name: "With Fields",
          url: "https://example.com/test.mp3",
          mediaType: "audio",
          fields: [{ id: "field1", value: "value1" }],
        });
        expect(mockPost).toHaveBeenCalledWith("/v1/media/upload", expect.objectContaining({
          fields: [{ id: "field1", value: "value1" }],
        }));
      });
    });

    describe("list_media", () => {
      it("accepts empty params (all optional)", async () => {
        const callback = getToolCallback(server, "list_media");
        const result = await callback({});
        expect(result.isError).toBeUndefined();
      });

      it("accepts valid pagination params", async () => {
        const callback = getToolCallback(server, "list_media");
        await callback({ page: 0, pageSize: 50 });
        expect(mockGet).toHaveBeenCalledWith("/v1/media", {
          params: { page: 0, pageSize: 50 },
        });
      });

      it("accepts date range filters", async () => {
        const callback = getToolCallback(server, "list_media");
        await callback({ from: "2025-01-01", to: "2025-12-31" });
        expect(mockGet).toHaveBeenCalledWith("/v1/media", {
          params: { from: "2025-01-01", to: "2025-12-31" },
        });
      });

      it("accepts favorites filter", async () => {
        const callback = getToolCallback(server, "list_media");
        await callback({ isFavorites: true });
        expect(mockGet).toHaveBeenCalledWith("/v1/media", {
          params: { isFavorites: true },
        });
      });
    });

    describe("get_transcript", () => {
      it("passes mediaId in URL path", async () => {
        const callback = getToolCallback(server, "get_transcript");
        await callback({ mediaId: "media-123" });
        expect(mockGet).toHaveBeenCalledWith("/v1/media/transcript/media-123");
      });

      it("handles special characters in mediaId", async () => {
        const callback = getToolCallback(server, "get_transcript");
        await callback({ mediaId: "media_with-dashes.and.dots" });
        expect(mockGet).toHaveBeenCalledWith(
          "/v1/media/transcript/media_with-dashes.and.dots"
        );
      });
    });

    describe("update_media_metadata", () => {
      it("sends only provided optional fields", async () => {
        const callback = getToolCallback(server, "update_media_metadata");
        await callback({ mediaId: "abc", name: "New Name" });
        expect(mockPut).toHaveBeenCalledWith("/v1/media/abc", { name: "New Name" });
      });

      it("handles tags as array of strings", async () => {
        const callback = getToolCallback(server, "update_media_metadata");
        await callback({ mediaId: "abc", tags: ["tag1", "tag2"] });
        expect(mockPut).toHaveBeenCalledWith("/v1/media/abc", { tags: ["tag1", "tag2"] });
      });
    });

    describe("update_transcript_speakers", () => {
      it("sends speaker mappings correctly", async () => {
        const callback = getToolCallback(server, "update_transcript_speakers");
        await callback({
          mediaId: "abc",
          speakers: [
            { id: "speaker_0", name: "Alice" },
            { id: "speaker_1", name: "Bob" },
          ],
        });
        expect(mockPut).toHaveBeenCalledWith("/v1/media/speakers/abc", {
          speakers: [
            { id: "speaker_0", name: "Alice" },
            { id: "speaker_1", name: "Bob" },
          ],
        });
      });
    });

    describe("bulk_move_media", () => {
      it("sends folder and media IDs", async () => {
        const callback = getToolCallback(server, "bulk_move_media");
        await callback({
          folderId: "folder1",
          mediaIds: ["media1", "media2", "media3"],
        });
        expect(mockPut).toHaveBeenCalledWith("/v1/media/move", {
          folderId: "folder1",
          mediaIds: ["media1", "media2", "media3"],
        });
      });
    });

    describe("get_signed_upload_url", () => {
      it("passes params correctly", async () => {
        const callback = getToolCallback(server, "get_signed_upload_url");
        await callback({
          isVideo: true,
          filename: "meeting.mp4",
          mimeType: "video/mp4",
        });
        expect(mockGet).toHaveBeenCalledWith("/v1/media/upload/signedurl", {
          params: { isVideo: true, filename: "meeting.mp4", mimeType: "video/mp4" },
        });
      });
    });
  });

  describe("Prompt tools", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient);
    });

    it("ask_magic_prompt sends all params", async () => {
      const callback = getToolCallback(server, "ask_magic_prompt");
      await callback({
        prompt: "Summarize the key points",
        mediaIds: ["id1", "id2"],
        assistantType: "researcher",
      });
      expect(mockPost).toHaveBeenCalledWith("/v1/prompt", {
        prompt: "Summarize the key points",
        mediaIds: ["id1", "id2"],
        assistantType: "researcher",
      });
    });

    it("ask_magic_prompt works with prompt only (workspace-wide)", async () => {
      const callback = getToolCallback(server, "ask_magic_prompt");
      await callback({ prompt: "What common themes exist?" });
      expect(mockPost).toHaveBeenCalledWith("/v1/prompt", {
        prompt: "What common themes exist?",
      });
    });

    it("get_chat_history passes limit param", async () => {
      const callback = getToolCallback(server, "get_chat_history");
      await callback({ limit: 10 });
      expect(mockGet).toHaveBeenCalledWith("/v1/prompt/history", { params: { limit: 10 } });
    });
  });

  describe("Folder tools", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/folders.js");
      register(server, mockClient);
    });

    it("create_folder sends name and optional parent", async () => {
      const callback = getToolCallback(server, "create_folder");
      await callback({ name: "Research", parentFolderId: "parent123" });
      expect(mockPost).toHaveBeenCalledWith("/v1/folder", {
        name: "Research",
        parentFolderId: "parent123",
      });
    });

    it("update_folder sends only changed fields", async () => {
      const callback = getToolCallback(server, "update_folder");
      await callback({ folderId: "f1", name: "Renamed" });
      expect(mockPut).toHaveBeenCalledWith("/v1/folder/f1", { name: "Renamed" });
    });

    it("delete_folder calls correct endpoint", async () => {
      const callback = getToolCallback(server, "delete_folder");
      await callback({ folderId: "f1" });
      expect(mockDelete).toHaveBeenCalledWith("/v1/folder/f1");
    });

    it("create_folder_view passes body correctly", async () => {
      const callback = getToolCallback(server, "create_folder_view");
      await callback({
        folderId: "f1",
        name: "My View",
        filters: { mediaType: "audio" },
      });
      expect(mockPost).toHaveBeenCalledWith("/v1/folders/f1/views", {
        name: "My View",
        filters: { mediaType: "audio" },
      });
    });
  });

  describe("Clip tools", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/clips.js");
      register(server, mockClient);
    });

    it("create_clip sends full payload", async () => {
      const callback = getToolCallback(server, "create_clip");
      await callback({
        title: "Key Moment",
        mediaType: "video",
        timeRanges: [
          { mediaId: "m1", startTime: 10, endTime: 30 },
          { mediaId: "m1", startTime: 60, endTime: 90 },
        ],
      });
      expect(mockPost).toHaveBeenCalledWith("/v1/clips", {
        title: "Key Moment",
        mediaType: "video",
        timeRanges: [
          { mediaId: "m1", startTime: 10, endTime: 30 },
          { mediaId: "m1", startTime: 60, endTime: 90 },
        ],
      });
    });
  });

  describe("Search tools", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/analytics.js");
      register(server, mockClient);
    });

    it("search_media sends query with date filters", async () => {
      const callback = getToolCallback(server, "search_media");
      await callback({
        query: "pricing",
        startDate: "2025-01-01",
        endDate: "2025-06-30",
      });
      expect(mockPost).toHaveBeenCalledWith("/v1/analytics/search", {
        query: "pricing",
        startDate: "2025-01-01",
        endDate: "2025-06-30",
      });
    });

    it("search_media works with query only", async () => {
      const callback = getToolCallback(server, "search_media");
      await callback({ query: "action items" });
      expect(mockPost).toHaveBeenCalledWith("/v1/analytics/search", {
        query: "action items",
      });
    });
  });

  describe("Response format consistency", () => {
    it("success responses always have content array with text type", async () => {
      mockGet.mockResolvedValueOnce({ data: { items: [1, 2, 3] } });

      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "list_media");
      const result = await callback({});

      expect(result.content).toBeInstanceOf(Array);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(typeof result.content[0].text).toBe("string");
    });

    it("error responses always have isError true and content array", async () => {
      mockGet.mockRejectedValueOnce(new Error("boom"));

      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "get_transcript");
      const result = await callback({ mediaId: "x" });

      expect(result.isError).toBe(true);
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toMatch(/^Error:/);
    });

    it("success response text is valid JSON", async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: { id: "123", state: "processed" } },
      });

      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "get_media_status");
      const result = await callback({ mediaId: "123" });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });
});

describe("Negative Input Validation — Zod Schema Rejection", () => {
  let server: McpServer;

  beforeEach(() => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
  });

  describe("Media tools — schema rejects invalid inputs", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);
    });

    it("upload_media schema rejects empty name", () => {
      const schema = getToolInputSchema(server, "upload_media");
      const result = schema.safeParse({ name: "", url: "https://x.com/a.mp3", mediaType: "audio" });
      expect(result.success).toBe(false);
    });

    it("upload_media schema rejects invalid mediaType enum", () => {
      const schema = getToolInputSchema(server, "upload_media");
      const result = schema.safeParse({ name: "test", url: "https://x.com/a.mp3", mediaType: "image" });
      expect(result.success).toBe(false);
    });

    it("list_media schema rejects negative page number", () => {
      const schema = getToolInputSchema(server, "list_media");
      const result = schema.safeParse({ page: -1 });
      expect(result.success).toBe(false);
    });

    it("list_media schema rejects pageSize over 500", () => {
      const schema = getToolInputSchema(server, "list_media");
      const result = schema.safeParse({ pageSize: 501 });
      expect(result.success).toBe(false);
    });

    it("list_media schema rejects pageSize of 0", () => {
      const schema = getToolInputSchema(server, "list_media");
      const result = schema.safeParse({ pageSize: 0 });
      expect(result.success).toBe(false);
    });

    it("list_media schema rejects non-integer page", () => {
      const schema = getToolInputSchema(server, "list_media");
      const result = schema.safeParse({ page: 1.5 });
      expect(result.success).toBe(false);
    });

    it("get_transcript schema rejects empty mediaId", () => {
      const schema = getToolInputSchema(server, "get_transcript");
      const result = schema.safeParse({ mediaId: "" });
      expect(result.success).toBe(false);
    });

    it("bulk_move_media schema rejects empty mediaIds array", () => {
      const schema = getToolInputSchema(server, "bulk_move_media");
      const result = schema.safeParse({ folderId: "f1", mediaIds: [] });
      expect(result.success).toBe(false);
    });

    it("bulk_move_media schema rejects empty folderId", () => {
      const schema = getToolInputSchema(server, "bulk_move_media");
      const result = schema.safeParse({ folderId: "", mediaIds: ["m1"] });
      expect(result.success).toBe(false);
    });

    it("update_transcript_speakers schema rejects empty speaker id", () => {
      const schema = getToolInputSchema(server, "update_transcript_speakers");
      const result = schema.safeParse({
        mediaId: "abc",
        speakers: [{ id: "", name: "Alice" }],
      });
      expect(result.success).toBe(false);
    });

    it("update_transcript_speakers schema rejects empty speaker name", () => {
      const schema = getToolInputSchema(server, "update_transcript_speakers");
      const result = schema.safeParse({
        mediaId: "abc",
        speakers: [{ id: "s0", name: "" }],
      });
      expect(result.success).toBe(false);
    });

    it("upload_media schema accepts valid input", () => {
      const schema = getToolInputSchema(server, "upload_media");
      const result = schema.safeParse({ name: "test", url: "https://x.com/a.mp3", mediaType: "audio" });
      expect(result.success).toBe(true);
    });

    it("list_media schema accepts empty object (all optional)", () => {
      const schema = getToolInputSchema(server, "list_media");
      const result = schema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("Folder tools — schema rejects invalid inputs", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/folders.js");
      register(server, mockClient);
    });

    it("create_folder schema rejects empty name", () => {
      const schema = getToolInputSchema(server, "create_folder");
      const result = schema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });

    it("delete_folder schema rejects empty folderId", () => {
      const schema = getToolInputSchema(server, "delete_folder");
      const result = schema.safeParse({ folderId: "" });
      expect(result.success).toBe(false);
    });

    it("list_folders schema rejects pageSize over 500", () => {
      const schema = getToolInputSchema(server, "list_folders");
      const result = schema.safeParse({ pageSize: 999 });
      expect(result.success).toBe(false);
    });
  });

  describe("Export tools — schema rejects invalid inputs", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/exports.js");
      register(server, mockClient);
    });

    it("export_media schema rejects invalid fileType", () => {
      const schema = getToolInputSchema(server, "export_media");
      const result = schema.safeParse({ mediaId: "abc", fileType: "mp3" });
      expect(result.success).toBe(false);
    });

    it("export_media schema accepts valid fileTypes", () => {
      for (const ft of ["pdf", "docx", "srt", "vtt", "txt", "csv"]) {
        const schema = getToolInputSchema(server, "export_media");
        const result = schema.safeParse({ mediaId: "abc", fileType: ft });
        expect(result.success, `fileType '${ft}' should be valid`).toBe(true);
      }
    });

    it("export_media schema rejects empty mediaId", () => {
      const schema = getToolInputSchema(server, "export_media");
      const result = schema.safeParse({ mediaId: "", fileType: "pdf" });
      expect(result.success).toBe(false);
    });
  });

  describe("Webhook tools — schema rejects invalid inputs", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/webhooks.js");
      register(server, mockClient);
    });

    it("create_webhook schema rejects non-URL string", () => {
      const schema = getToolInputSchema(server, "create_webhook");
      const result = schema.safeParse({ url: "not-a-url" });
      expect(result.success).toBe(false);
    });

    it("create_webhook schema accepts valid HTTPS URL", () => {
      const schema = getToolInputSchema(server, "create_webhook");
      const result = schema.safeParse({ url: "https://example.com/webhook" });
      expect(result.success).toBe(true);
    });

    it("delete_webhook schema rejects empty webhookId", () => {
      const schema = getToolInputSchema(server, "delete_webhook");
      const result = schema.safeParse({ webhookId: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("Prompt tools — schema rejects invalid inputs", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient);
    });

    it("ask_magic_prompt schema rejects empty prompt", () => {
      const schema = getToolInputSchema(server, "ask_magic_prompt");
      const result = schema.safeParse({ prompt: "" });
      expect(result.success).toBe(false);
    });

    it("retry_magic_prompt schema rejects empty promptId", () => {
      const schema = getToolInputSchema(server, "retry_magic_prompt");
      const result = schema.safeParse({ promptId: "", messageId: "msg1" });
      expect(result.success).toBe(false);
    });

    it("get_chat_history schema rejects negative limit", () => {
      const schema = getToolInputSchema(server, "get_chat_history");
      const result = schema.safeParse({ limit: -5 });
      expect(result.success).toBe(false);
    });

    it("get_chat_history schema rejects zero limit", () => {
      const schema = getToolInputSchema(server, "get_chat_history");
      const result = schema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });
  });
});
