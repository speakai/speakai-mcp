/**
 * Tests for src/resources.ts — resource handler callbacks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const mockGet = vi.fn();

const mockClient = {
  get: mockGet,
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
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

/**
 * Extract a resource callback from the server internals.
 * Static resources are in _registeredResources keyed by URI.
 * Dynamic (template) resources are in _registeredResourceTemplates keyed by name.
 */
function getResourceCallback(server: McpServer, key: string): Function {
  const resources = (server as any)._registeredResources;
  if (resources[key]) {
    return resources[key].readCallback;
  }
  const templates = (server as any)._registeredResourceTemplates;
  if (templates && templates[key]) {
    return templates[key].readCallback;
  }
  const allKeys = [
    ...Object.keys(resources),
    ...Object.keys(templates ?? {}),
  ];
  throw new Error(`Resource "${key}" not registered. Available: ${allKeys.join(", ")}`);
}

describe("Resources", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: { items: [] } } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { registerResources } = await import("../src/resources.js");
    registerResources(server, mockClient);
  });

  // ── Static resources ──────────────────────────────────────────────

  describe("media-library", () => {
    it("calls GET /v1/media with correct params and returns formatted content", async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: { items: [{ id: "m1", name: "Recording" }] } },
      });

      const cb = getResourceCallback(server, "speakai://media");
      const result = await cb(new URL("speakai://media"), {});

      expect(mockGet).toHaveBeenCalledWith("/v1/media", {
        params: { page: 0, pageSize: 50, sortBy: "createdAt:desc", filterMedia: 2 },
      });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("speakai://media");
      expect(result.contents[0].mimeType).toBe("application/json");

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.items[0].id).toBe("m1");
    });

    it("throws an error so MCP clients can distinguish failure from empty workspace", async () => {
      mockGet.mockRejectedValueOnce(new Error("fail"));

      const cb = getResourceCallback(server, "speakai://media");
      await expect(cb(new URL("speakai://media"), {})).rejects.toThrow(/media-library/);
    });
  });

  describe("folders", () => {
    it("calls GET /v1/folder with correct params and returns formatted content", async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: { folders: [{ id: "f1" }] } },
      });

      const cb = getResourceCallback(server, "speakai://folders");
      const result = await cb(new URL("speakai://folders"), {});

      expect(mockGet).toHaveBeenCalledWith("/v1/folder", {
        params: { page: 0, pageSize: 100, sortBy: "createdAt:desc" },
      });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("speakai://folders");
      expect(result.contents[0].mimeType).toBe("application/json");
    });

    it("throws an error so MCP clients can distinguish failure from empty workspace", async () => {
      mockGet.mockRejectedValueOnce(new Error("fail"));

      const cb = getResourceCallback(server, "speakai://folders");
      await expect(cb(new URL("speakai://folders"), {})).rejects.toThrow(/folders/);
    });
  });

  describe("supported-languages", () => {
    it("calls GET /v1/media/supportedLanguages and returns formatted content", async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: [{ code: "en-US", name: "English" }] },
      });

      const cb = getResourceCallback(server, "speakai://languages");
      const result = await cb(new URL("speakai://languages"), {});

      expect(mockGet).toHaveBeenCalledWith("/v1/media/supportedLanguages");
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("speakai://languages");
      expect(result.contents[0].mimeType).toBe("application/json");
    });

    it("throws an error so MCP clients can distinguish failure from empty workspace", async () => {
      mockGet.mockRejectedValueOnce(new Error("fail"));

      const cb = getResourceCallback(server, "speakai://languages");
      await expect(cb(new URL("speakai://languages"), {})).rejects.toThrow(/supported-languages/);
    });
  });

  // ── Dynamic resource templates ────────────────────────────────────

  describe("transcript", () => {
    it("calls GET /v1/media/transcript/:mediaId and returns formatted content", async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: { text: "Hello world", segments: [] } },
      });

      const cb = getResourceCallback(server, "transcript");
      const uri = new URL("speakai://media/m1/transcript");
      const result = await cb(uri, { mediaId: "m1" });

      expect(mockGet).toHaveBeenCalledWith("/v1/media/transcript/m1");
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("speakai://media/m1/transcript");
      expect(result.contents[0].mimeType).toBe("application/json");

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.text).toBe("Hello world");
    });

    it("throws an error so MCP clients can distinguish failure from missing transcript", async () => {
      mockGet.mockRejectedValueOnce(new Error("fail"));

      const cb = getResourceCallback(server, "transcript");
      await expect(cb(new URL("speakai://media/m1/transcript"), { mediaId: "m1" })).rejects.toThrow(/transcript\(m1\)/);
    });
  });

  describe("insights", () => {
    it("calls GET /v1/media/insight/:mediaId and returns formatted content", async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: { topics: ["AI"], sentiment: "positive" } },
      });

      const cb = getResourceCallback(server, "insights");
      const uri = new URL("speakai://media/m1/insights");
      const result = await cb(uri, { mediaId: "m1" });

      expect(mockGet).toHaveBeenCalledWith("/v1/media/insight/m1");
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("speakai://media/m1/insights");
      expect(result.contents[0].mimeType).toBe("application/json");

      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.topics).toEqual(["AI"]);
    });

    it("throws an error so MCP clients can distinguish failure from missing insights", async () => {
      mockGet.mockRejectedValueOnce(new Error("fail"));

      const cb = getResourceCallback(server, "insights");
      await expect(cb(new URL("speakai://media/m1/insights"), { mediaId: "m1" })).rejects.toThrow(/insights\(m1\)/);
    });
  });
});
