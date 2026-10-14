import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const mockPut = vi.fn();
const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: mockPut,
  patch: vi.fn(),
  delete: vi.fn(),
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
} as any;

vi.mock("axios", () => ({
  default: { create: () => mockClient, isAxiosError: () => false },
}));

function registered(server: McpServer, name: string) {
  const tool = (server as any)._registeredTools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool;
}

describe("embed brand meta", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockPut.mockResolvedValue({ data: { status: "success", data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    (await import("../src/tools/embed.js")).register(server, mockClient);
  });

  it("documents the brand meta keys on update_embed", () => {
    const meta = registered(server, "update_embed").inputSchema.shape.meta.description as string;
    for (const key of ["logoDark", "theme", "backgroundColor", "fontFamily", "titleColor"]) {
      expect(meta).toContain(key);
    }
    expect(meta).toContain("Google Fonts");
  });

  it("points create_embed users at update_embed for branding", () => {
    expect(registered(server, "create_embed").description).toContain("logoDark");
  });

  it("passes the brand meta keys through to the embed update endpoint", async () => {
    const meta = { logoDark: "s3://bucket/dark.png", theme: "dark", backgroundColor: "#0f111a", fontFamily: "Arimo" };
    await registered(server, "update_embed").handler({ embedId: "e1", meta }, {});
    expect(mockPut).toHaveBeenCalledWith("/v1/embed/e1", { meta });
  });
});
