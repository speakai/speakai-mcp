import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mock axios to prevent real HTTP calls during registration
vi.mock("axios", () => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return {
    default: { create: () => instance, isAxiosError: () => false },
    ...instance,
  };
});

function getRegisteredTools(server: McpServer): Record<string, any> {
  return (server as any)._registeredTools;
}

describe("MCP Server Smoke Tests", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
  });

  it("registers all 81 MCP tools without errors", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    expect(() => registerAllTools(server)).not.toThrow();

    const tools = getRegisteredTools(server);
    const toolNames = Object.keys(tools);
    expect(toolNames).toHaveLength(81);
  });

  it("registers all tools with unique names", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server);

    const tools = getRegisteredTools(server);
    const names = Object.keys(tools);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("every tool has a non-empty description", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server);

    const tools = getRegisteredTools(server);
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.description, `Tool ${name} missing description`).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it("registers all 5 MCP resources without errors", async () => {
    const { registerResources } = await import("../src/resources.js");
    expect(() => registerResources(server)).not.toThrow();
  });

  it("registers all 3 MCP prompts without errors", async () => {
    const { registerPrompts } = await import("../src/prompts.js");
    expect(() => registerPrompts(server)).not.toThrow();
  });

  it("exports public API correctly", async () => {
    const exports = await import("../src/index.js");
    expect(exports.registerAllTools).toBeTypeOf("function");
    expect(exports.registerResources).toBeTypeOf("function");
    expect(exports.registerPrompts).toBeTypeOf("function");
    expect(exports.createSpeakClient).toBeTypeOf("function");
    expect(exports.formatAxiosError).toBeTypeOf("function");
  });

  it("includes expected tool categories", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server);

    const tools = getRegisteredTools(server);
    const names = Object.keys(tools);

    // Verify key tools from each category exist
    const expectedTools = [
      // Media
      "upload_media", "list_media", "get_transcript", "get_media_insights",
      "get_media_status", "delete_media", "upload_local_file", "upload_and_analyze",
      "get_captions", "reanalyze_media", "toggle_media_favorite",
      // Chat
      "ask_magic_prompt", "get_chat_history", "get_chat_messages",
      "retry_magic_prompt", "export_chat_answer",
      // Search
      "search_media",
      // Clips
      "create_clip", "get_clips", "delete_clip",
      // Folders
      "list_folders", "create_folder", "delete_folder",
      // Webhooks
      "create_webhook", "list_webhooks",
      // Meeting
      "schedule_meeting_event",
    ];

    for (const name of expectedTools) {
      expect(names, `Missing tool: ${name}`).toContain(name);
    }
  });
});
