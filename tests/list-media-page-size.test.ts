import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AxiosInstance } from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register } from "../src/tools/media.js";
import { LIST_MEDIA_DEFAULT_PAGE_SIZE } from "../src/tools/media.js";

function getToolCallback(server: McpServer, toolName: string): Function {
  const tools = (server as any)._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not registered`);
  return (params: any) => tool.handler(params, {});
}

describe("list_media page size", () => {
  let server: McpServer;
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGet = vi.fn().mockResolvedValue({ data: { mediaList: [] } });
    server = new McpServer({ name: "test", version: "0.0.0" });
    register(server, { get: mockGet } as unknown as AxiosInstance);
  });

  it("defaults to 25 rather than letting the API apply its own", () => {
    expect(LIST_MEDIA_DEFAULT_PAGE_SIZE).toBe(25);
  });

  it("sends the default when the model omits pageSize", async () => {
    const callback = getToolCallback(server, "list_media");
    await callback({});
    expect(mockGet).toHaveBeenCalledWith("/v1/media", { params: { pageSize: 25 } });
  });

  it("honours an explicit pageSize, including the maximum", async () => {
    const callback = getToolCallback(server, "list_media");
    await callback({ pageSize: 500 });
    expect(mockGet).toHaveBeenCalledWith("/v1/media", { params: { pageSize: 500 } });
  });

  it("does not cap when transcripts are requested", async () => {
    const callback = getToolCallback(server, "list_media");
    await callback({ pageSize: 500, include: ["transcription"] });
    expect(mockGet).toHaveBeenCalledWith("/v1/media", {
      params: { pageSize: 500, requestTypes: "transcription" },
    });
  });

  it("applies the default alongside other filters", async () => {
    const callback = getToolCallback(server, "list_media");
    await callback({ isFavorites: true });
    expect(mockGet).toHaveBeenCalledWith("/v1/media", {
      params: { isFavorites: true, pageSize: 25 },
    });
  });
});
