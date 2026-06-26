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

  it("registers all 107 MCP tools without errors", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    expect(() => registerAllTools(server)).not.toThrow();

    const tools = getRegisteredTools(server);
    const toolNames = Object.keys(tools);
    expect(toolNames).toHaveLength(107);
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

  it("every tool declares Apps SDK annotations and an output schema", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server);

    const tools = getRegisteredTools(server);
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.outputSchema, `Tool ${name} missing outputSchema`).toBeTruthy();
      expect(
        tool.annotations?.readOnlyHint,
        `Tool ${name} missing readOnlyHint`
      ).toBeTypeOf("boolean");
      expect(
        tool.annotations?.openWorldHint,
        `Tool ${name} missing openWorldHint`
      ).toBeTypeOf("boolean");
      expect(
        tool.annotations?.destructiveHint,
        `Tool ${name} missing destructiveHint`
      ).toBeTypeOf("boolean");
    }
  });

  it("only marks tools open-world when they affect public or external systems", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server);

    const tools = getRegisteredTools(server);
    const openWorldTools = Object.entries(tools)
      .filter(([, tool]) => tool.annotations?.openWorldHint === true)
      .map(([name]) => name)
      .sort();

    expect(openWorldTools).toEqual([
      "clone_recorder",
      "create_embed",
      "create_recorder",
      "create_webhook",
      "delete_recorder",
      "delete_scheduled_assistant",
      "delete_webhook",
      "generate_recorder_url",
      "get_live_meeting_transcript",
      "remove_assistant_from_meeting",
      "schedule_meeting_event",
      "update_embed",
      "update_recorder_questions",
      "update_recorder_settings",
      "update_webhook",
    ].sort());
  });

  it("adds structuredContent to tool responses", async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ data: { data: [{ id: "media-1" }] } }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server, mockClient as any);

    const tools = getRegisteredTools(server);
    const result = await tools.list_media.handler({}, {});

    expect(result.structuredContent).toEqual({
      data: { data: [{ id: "media-1" }] },
    });
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

  describe("get_live_meeting_transcript", () => {
    const sentences = [
      { id: 1, text: "Hello.", instances: [{ startInSec: 0, endInSec: 1.2 }] },
      { id: 1, text: "How are you?", instances: [{ startInSec: 1.3, endInSec: 2.5 }] },
      { id: 1, text: "Doing well.", instances: [{ startInSec: 2.6, endInSec: 4.0 }] },
    ];

    it("resolves meetingAssistantEventId then returns sentences + isLive", async () => {
      const mockClient = {
        get: vi.fn().mockImplementation((url: string) => {
          if (url === "/v1/meeting-assistant/events") {
            return Promise.resolve({
              data: {
                events: [
                  {
                    meetingAssistantEventId: "evt_abc",
                    currentStatus: "inCallRecording",
                    title: "Demo call",
                    mediaId: { mediaId: "media_xyz" },
                  },
                ],
              },
            });
          }
          return Promise.resolve({
            data: { data: { name: "Demo call", insight: { transcript: sentences } } },
          });
        }),
        post: vi.fn(), put: vi.fn(), delete: vi.fn(),
      };
      const { registerAllTools } = await import("../src/tools/index.js");
      registerAllTools(server, mockClient as any);
      const tools = getRegisteredTools(server);

      const result = await tools.get_live_meeting_transcript.handler(
        { meetingAssistantEventId: "evt_abc" },
        {},
      );

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent.data).toMatchObject({
        mediaId: "media_xyz",
        isLive: true,
        meetingStatus: "inCallRecording",
        nextCursor: 4.0,
      });
      expect(result.structuredContent.data.newSentences).toHaveLength(3);
    });

    it("passes sinceEndInSec through to the transcript endpoint", async () => {
      const mockClient = {
        get: vi.fn().mockImplementation((url: string) => {
          if (url === "/v1/meeting-assistant/events") {
            return Promise.resolve({
              data: { events: [{ meetingAssistantEventId: "evt_abc", currentStatus: "inCallRecording", mediaId: "media_xyz" }] },
            });
          }
          return Promise.resolve({ data: { data: { insight: { transcript: [sentences[2]] } } } });
        }),
        post: vi.fn(), put: vi.fn(), delete: vi.fn(),
      };
      const { registerAllTools } = await import("../src/tools/index.js");
      registerAllTools(server, mockClient as any);
      const tools = getRegisteredTools(server);

      await tools.get_live_meeting_transcript.handler(
        { meetingAssistantEventId: "evt_abc", sinceEndInSec: 2.5 },
        {},
      );

      expect(mockClient.get).toHaveBeenCalledWith(
        "/v1/media/transcript/media_xyz",
        { params: { sinceEndInSec: 2.5 } },
      );
      expect(mockClient.get).toHaveBeenCalledWith(
        "/v1/meeting-assistant/events",
        { params: { pageSize: 50, sortBy: "startTime:desc" } },
      );
    });

    it("returns not_started when meeting has no linked media yet", async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue({
          data: { events: [{ meetingAssistantEventId: "evt_abc", currentStatus: "scheduled", mediaId: null }] },
        }),
        post: vi.fn(), put: vi.fn(), delete: vi.fn(),
      };
      const { registerAllTools } = await import("../src/tools/index.js");
      registerAllTools(server, mockClient as any);
      const tools = getRegisteredTools(server);

      const result = await tools.get_live_meeting_transcript.handler(
        { meetingAssistantEventId: "evt_abc" },
        {},
      );

      expect(result.structuredContent.data).toMatchObject({
        status: "not_started",
        meetingAssistantEventId: "evt_abc",
        meetingStatus: "scheduled",
      });
    });

    it("supports mediaId-only path without event lookup", async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue({
          data: { data: { name: "Direct media", insight: { transcript: sentences } } },
        }),
        post: vi.fn(), put: vi.fn(), delete: vi.fn(),
      };
      const { registerAllTools } = await import("../src/tools/index.js");
      registerAllTools(server, mockClient as any);
      const tools = getRegisteredTools(server);

      const result = await tools.get_live_meeting_transcript.handler(
        { mediaId: "media_xyz" },
        {},
      );

      expect(mockClient.get).toHaveBeenCalledTimes(1);
      expect(result.structuredContent.data).toMatchObject({
        mediaId: "media_xyz",
        isLive: false,
        meetingStatus: null,
        nextCursor: 4.0,
      });
    });

    it("errors when neither identifier is supplied", async () => {
      const { registerAllTools } = await import("../src/tools/index.js");
      registerAllTools(server, { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as any);
      const tools = getRegisteredTools(server);

      const result = await tools.get_live_meeting_transcript.handler({}, {});

      expect(result.isError).toBe(true);
    });

    it("echoes input cursor when no new sentences arrive", async () => {
      const mockClient = {
        get: vi.fn().mockImplementation((url: string) => {
          if (url === "/v1/meeting-assistant/events") {
            return Promise.resolve({
              data: { events: [{ meetingAssistantEventId: "evt_abc", currentStatus: "inCallRecording", mediaId: "media_xyz" }] },
            });
          }
          return Promise.resolve({ data: { data: { insight: { transcript: [] } } } });
        }),
        post: vi.fn(), put: vi.fn(), delete: vi.fn(),
      };
      const { registerAllTools } = await import("../src/tools/index.js");
      registerAllTools(server, mockClient as any);
      const tools = getRegisteredTools(server);

      const result = await tools.get_live_meeting_transcript.handler(
        { meetingAssistantEventId: "evt_abc", sinceEndInSec: 12.5 },
        {},
      );

      expect(result.structuredContent.data.nextCursor).toBe(12.5);
      expect(result.structuredContent.data.newSentences).toHaveLength(0);
    });
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
      "get_live_meeting_transcript",
    ];

    for (const name of expectedTools) {
      expect(names, `Missing tool: ${name}`).toContain(name);
    }
  });
});
