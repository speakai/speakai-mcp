/**
 * Invariant test: `SPEAK_MCP_TOOL_NAMES` must match the exact set of tools
 * registered by `registerAllTools`. If a tool is added, removed, or renamed
 * in `src/tools/*.ts` without updating `src/tool-names.ts`, this test fails.
 *
 * Consumers (e.g. speak-server's orchestrator bridge) depend on this manifest
 * as a single source of truth, so drift here is a release blocker.
 */
import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const mockClient = {
  get: vi.fn().mockResolvedValue({ data: { data: {} } }),
  post: vi.fn().mockResolvedValue({ data: { data: {} } }),
  put: vi.fn().mockResolvedValue({ data: { data: {} } }),
  delete: vi.fn().mockResolvedValue({ data: { data: {} } }),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
} as any;

vi.mock("axios", () => ({
  default: {
    create: () => mockClient,
    isAxiosError: () => false,
    put: vi.fn().mockResolvedValue({}),
  },
}));

describe("SPEAK_MCP_TOOL_NAMES manifest", () => {
  it("matches the exact set of tools registered by registerAllTools", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    const { SPEAK_MCP_TOOL_NAMES } = await import("../src/tool-names.js");

    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerAllTools(server, mockClient);

    const registered = Object.keys((server as any)._registeredTools).sort();
    const manifest = [...SPEAK_MCP_TOOL_NAMES].sort();

    expect(manifest).toEqual(registered);
  });

  it("has no duplicate entries", async () => {
    const { SPEAK_MCP_TOOL_NAMES } = await import("../src/tool-names.js");
    const unique = new Set(SPEAK_MCP_TOOL_NAMES);
    expect(unique.size).toBe(SPEAK_MCP_TOOL_NAMES.length);
  });
});
