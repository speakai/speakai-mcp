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

  it("registers all 168 MCP tools without errors", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    expect(() => registerAllTools(server, undefined, { localFileAccess: true, voiceTestRuns: true })).not.toThrow();

    const tools = getRegisteredTools(server);
    const toolNames = Object.keys(tools);
    expect(toolNames).toHaveLength(168);
  });

  it("never exposes local-disk or unfinished voice test-run tools on the hosted server", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server);

    const toolNames = Object.keys(getRegisteredTools(server));
    expect(toolNames).not.toContain("upload_local_file");
    for (const runTool of [
      "start_voice_test_run",
      "get_active_voice_test_run",
      "pause_voice_test_run",
      "resume_voice_test_run",
      "cancel_voice_test_run",
      "list_voice_test_runs",
      "get_voice_test_run",
      "apply_voice_test_recommendation",
      "get_voice_test_baseline",
      "get_voice_test_score_history",
    ]) {
      expect(toolNames).not.toContain(runTool);
    }
    expect(toolNames).toContain("get_voice_test_suite");
    expect(toolNames).toHaveLength(157);
  });

  it("registers all tools with unique names", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server, undefined, { localFileAccess: true, voiceTestRuns: true });

    const tools = getRegisteredTools(server);
    const names = Object.keys(tools);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("every tool has a non-empty description", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server, undefined, { localFileAccess: true, voiceTestRuns: true });

    const tools = getRegisteredTools(server);
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.description, `Tool ${name} missing description`).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it("every tool declares Apps SDK annotations and an output schema", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server, undefined, { localFileAccess: true, voiceTestRuns: true });

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
      expect(
        tool.annotations?.idempotentHint,
        `Tool ${name} missing idempotentHint`
      ).toBeTypeOf("boolean");
      if (tool.annotations?.readOnlyHint) {
        expect(tool.annotations?.destructiveHint, `Read-only tool ${name} cannot be destructive`).toBe(false);
      }
    }
  });

  it("only marks writes non-destructive when they are purely additive", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server, undefined, { localFileAccess: true, voiceTestRuns: true });

    const tools = getRegisteredTools(server);
    const additiveWrites = Object.entries(tools)
      .filter(([, tool]) => !tool.annotations?.readOnlyHint && !tool.annotations?.destructiveHint)
      .map(([name]) => name)
      .sort();

    expect(additiveWrites).toEqual([
      "add_voice_faq_suggestion",
      "add_voice_kb_gap",
      "analyze_voice_kb_gaps",
      "bulk_create_voice_agent_resources",
      "clone_folder",
      "create_field",
      "create_folder",
      "create_user_group",
      "create_voice_agent",
      "create_voice_agent_from_prompt",
      "create_voice_agent_resource",
      "create_voice_question",
      "create_voice_question_template",
      "duplicate_dashboard",
      "export_chat_answer",
      "export_multiple_media",
      "generate_voice_faq_suggestions",
      "provision_inbound_webhook",
      "start_voice_test_run",
    ].sort());
  });

  it("only marks tools open-world when they affect public or external systems", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server, undefined, { localFileAccess: true, voiceTestRuns: true });

    const tools = getRegisteredTools(server);
    const openWorldTools = Object.entries(tools)
      .filter(([, tool]) => tool.annotations?.openWorldHint === true)
      .map(([name]) => name)
      .sort();

    expect(openWorldTools).toEqual([
      "ask_ai_chat",
      "build_automation",
      "bulk_create_voice_agent_resources",
      "bulk_move_media",
      "bulk_update_automation_status",
      "clone_recorder",
      "create_automation",
      "create_clip",
      "create_dashboard",
      "create_embed",
      "create_recorder",
      "create_text_note",
      "create_voice_agent_resource",
      "create_webhook",
      "delete_automation",
      "delete_dashboard",
      "delete_media",
      "delete_recorder",
      "delete_scheduled_assistant",
      "delete_voice_agent",
      "delete_webhook",
      "provision_inbound_webhook",
      "reanalyze_media",
      "reanalyze_text",
      "remove_assistant_from_meeting",
      "retry_ai_chat",
      "run_automations",
      "schedule_meeting_event",
      "share_dashboard",
      "submit_chat_feedback",
      "test_automation",
      "toggle_automation_status",
      "update_automation",
      "update_dashboard",
      "update_embed",
      "update_media_metadata",
      "update_multiple_fields",
      "update_recorder_questions",
      "update_recorder_settings",
      "update_text_note",
      "update_voice_agent_resource",
      "update_webhook",
      "upload_and_analyze",
      "upload_and_analyze_batch",
      "upload_local_file",
      "upload_media",
    ].sort());
  });

  it("never describes an outside send or irreversible effect that the hints don't declare", async () => {
    // OpenAI's tool scan reads the description against the annotations. A write that says it sends
    // outside Speak AI, or changes a share link, embedded widget or phone number, must be open-world; one that says it bills, overwrites or permanently deletes
    // must be destructive. A match is ignored when its clause negates it, or names another tool, first.
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server, undefined, { localFileAccess: true, voiceTestRuns: true });

    const tools = getRegisteredTools(server);
    const names = Object.keys(tools);
    const OUTSIDE_SEND =
      /\b(sends?|sent|sending|posts?|posted|emails?|fires?|triggers?|notifies|calls?)\b[^;]{0,160}?\b(email|slack|webhook|automation|any address|third-party|external)|\bpublic (url|link|page)|\bshare link|\bembedded widget|\bphone numbers?\b|\bphone call|\bjoins? [^;]*?\bmeeting|\bcomposio\b/i;
    const IRREVERSIBLE = /\b(charges?|bills?|billed|credits?|permanently|overwrites?|replaces?)\b/i;
    const NEGATED = /\b(not|no|never|without|cannot)\b/i;

    // A match counts unless the clause negates it, or names another tool, before the match.
    const declares = (clause: string, pattern: RegExp, self: string) => {
      const match = pattern.exec(clause);
      if (!match) return null;
      const before = clause.slice(0, match.index);
      // A negation covers its list ("does not place calls, or use credits") but stops at a colon.
      if (NEGATED.test(before.slice(before.lastIndexOf(":") + 1))) return null;
      // Only another tool named in the same comma-separated phrase as the match makes it that tool's effect.
      const phrase = before.slice(before.lastIndexOf(",") + 1);
      if (names.some((other) => other !== self && new RegExp(`\\b${other}\\b`).test(phrase))) return null;
      return match[0];
    };

    const mismatches: string[] = [];
    for (const [name, tool] of Object.entries(tools)) {
      if (tool.annotations?.readOnlyHint) continue;
      // Split on sentence ends only, so event names such as media.created stay inside their clause.
      for (const clause of String(tool.description ?? "").split(/[.;](?=\s|$)/)) {
        const send = declares(clause, OUTSIDE_SEND, name);
        if (send && !tool.annotations?.openWorldHint) {
          mismatches.push(`${name}: describes "${send}" but openWorldHint is false`);
        }
        const effect = declares(clause, IRREVERSIBLE, name);
        if (effect && !tool.annotations?.destructiveHint) {
          mismatches.push(`${name}: describes "${effect}" but destructiveHint is false`);
        }
      }
    }
    expect(mismatches).toEqual([]);
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
    registerAllTools(server, undefined, { localFileAccess: true, voiceTestRuns: true });

    const tools = getRegisteredTools(server);
    const names = Object.keys(tools);

    // Verify key tools from each category exist
    const expectedTools = [
      // Media
      "upload_media", "list_media", "get_transcript", "get_media_insights",
      "get_media_status", "delete_media", "upload_local_file", "upload_and_analyze",
      "get_captions", "reanalyze_media", "toggle_media_favorite",
      // Chat
      "ask_ai_chat", "get_chat_history", "get_chat_messages",
      "retry_ai_chat", "export_chat_answer",
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
