/**
 * Endpoint-correctness tests for all tool modules that previously had zero coverage.
 * Each tool gets at least one happy-path test verifying the correct HTTP method + URL.
 */
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
    put: vi.fn().mockResolvedValue({}),
  },
}));

// Mock fs for upload_local_file tests
vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue(Buffer.from("fake-audio-data")),
}));

function getToolCallback(server: McpServer, toolName: string): Function {
  const tools = (server as any)._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not registered`);
  return (params: any) => tool.handler(params, {});
}

function getToolNames(server: McpServer): string[] {
  return Object.keys((server as any)._registeredTools);
}

describe("Automations tools", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/automations.js");
    register(server, mockClient);
  });

  it("list_automations calls GET /v1/automations", async () => {
    const cb = getToolCallback(server, "list_automations");
    await cb({});
    expect(mockGet).toHaveBeenCalledWith("/v1/automations");
  });

  it("get_automation calls GET /v1/automations/:id", async () => {
    const cb = getToolCallback(server, "get_automation");
    await cb({ automationId: "auto1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/automations/auto1");
  });

  it("create_automation calls POST /v1/automations/", async () => {
    const cb = getToolCallback(server, "create_automation");
    await cb({ name: "My Rule", trigger: { type: "upload" } });
    expect(mockPost).toHaveBeenCalledWith("/v1/automations/", {
      name: "My Rule",
      trigger: { type: "upload" },
    });
  });

  it("update_automation calls PUT /v1/automations/:id", async () => {
    const cb = getToolCallback(server, "update_automation");
    await cb({ automationId: "auto1", name: "Updated" });
    expect(mockPut).toHaveBeenCalledWith("/v1/automations/auto1", { name: "Updated" });
  });

  it("toggle_automation_status calls PUT /v1/automations/status/:id", async () => {
    const cb = getToolCallback(server, "toggle_automation_status");
    await cb({ automationId: "auto1", enabled: false });
    expect(mockPut).toHaveBeenCalledWith("/v1/automations/status/auto1", { enabled: false });
  });

  it("handles error on list_automations", async () => {
    mockGet.mockRejectedValueOnce(new Error("fail"));
    const cb = getToolCallback(server, "list_automations");
    const result = await cb({});
    expect(result.isError).toBe(true);
  });
});

describe("Embed tools", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/embed.js");
    register(server, mockClient);
  });

  it("create_embed calls POST /v1/embed", async () => {
    const cb = getToolCallback(server, "create_embed");
    await cb({ mediaId: "m1", settings: { autoplay: true } });
    expect(mockPost).toHaveBeenCalledWith("/v1/embed", {
      mediaId: "m1",
      settings: { autoplay: true },
    });
  });

  it("update_embed calls PUT /v1/embed/:id", async () => {
    const cb = getToolCallback(server, "update_embed");
    await cb({ embedId: "e1", settings: { theme: "dark" } });
    expect(mockPut).toHaveBeenCalledWith("/v1/embed/e1", { settings: { theme: "dark" } });
  });

  it("check_embed calls GET /v1/embed/:mediaId", async () => {
    const cb = getToolCallback(server, "check_embed");
    await cb({ mediaId: "m1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/embed/m1");
  });

  it("get_embed_iframe_url calls GET /v1/embed/iframe with params", async () => {
    const cb = getToolCallback(server, "get_embed_iframe_url");
    await cb({ mediaId: "m1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/embed/iframe", { params: { mediaId: "m1" } });
  });

  it("handles error on create_embed", async () => {
    mockPost.mockRejectedValueOnce(new Error("fail"));
    const cb = getToolCallback(server, "create_embed");
    const result = await cb({ mediaId: "m1" });
    expect(result.isError).toBe(true);
  });
});

describe("Export tools", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockPost.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/exports.js");
    register(server, mockClient);
  });

  it("export_media calls POST /v1/media/export/:id/:fileType", async () => {
    const cb = getToolCallback(server, "export_media");
    await cb({ mediaId: "m1", fileType: "pdf", isSpeakerNames: true });
    expect(mockPost).toHaveBeenCalledWith("/v1/media/export/m1/pdf", {
      isSpeakerNames: true,
    });
  });

  it("export_media with srt format", async () => {
    const cb = getToolCallback(server, "export_media");
    await cb({ mediaId: "m1", fileType: "srt", isTimeStamps: true });
    expect(mockPost).toHaveBeenCalledWith("/v1/media/export/m1/srt", {
      isTimeStamps: true,
    });
  });

  it("export_multiple_media calls POST /v1/media/exportMultiple", async () => {
    const cb = getToolCallback(server, "export_multiple_media");
    await cb({
      mediaIds: ["m1", "m2"],
      fileType: "docx",
      isMerged: true,
    });
    expect(mockPost).toHaveBeenCalledWith("/v1/media/exportMultiple", {
      mediaIds: ["m1", "m2"],
      fileType: "docx",
      isMerged: true,
    });
  });

  it("handles error on export_media", async () => {
    mockPost.mockRejectedValueOnce(new Error("fail"));
    const cb = getToolCallback(server, "export_media");
    const result = await cb({ mediaId: "m1", fileType: "pdf" });
    expect(result.isError).toBe(true);
  });
});

describe("Fields tools", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/fields.js");
    register(server, mockClient);
  });

  it("list_fields calls GET /v1/fields", async () => {
    const cb = getToolCallback(server, "list_fields");
    await cb({});
    expect(mockGet).toHaveBeenCalledWith("/v1/fields");
  });

  it("create_field calls POST /v1/fields", async () => {
    const cb = getToolCallback(server, "create_field");
    await cb({ name: "Priority", type: "select", options: ["High", "Low"] });
    expect(mockPost).toHaveBeenCalledWith("/v1/fields", {
      name: "Priority",
      type: "select",
      options: ["High", "Low"],
    });
  });

  it("update_multiple_fields calls POST /v1/fields/multi", async () => {
    const cb = getToolCallback(server, "update_multiple_fields");
    await cb({ fields: [{ id: "f1", name: "Updated" }] });
    expect(mockPost).toHaveBeenCalledWith("/v1/fields/multi", {
      fields: [{ id: "f1", name: "Updated" }],
    });
  });

  it("update_field calls PUT /v1/fields/:id", async () => {
    const cb = getToolCallback(server, "update_field");
    await cb({ id: "f1", name: "Renamed" });
    expect(mockPut).toHaveBeenCalledWith("/v1/fields/f1", { name: "Renamed" });
  });

  it("handles error on list_fields", async () => {
    mockGet.mockRejectedValueOnce(new Error("fail"));
    const cb = getToolCallback(server, "list_fields");
    const result = await cb({});
    expect(result.isError).toBe(true);
  });
});

describe("Meeting tools", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/meeting.js");
    register(server, mockClient);
  });

  it("list_meeting_events calls GET /v1/meeting-assistant/events", async () => {
    const cb = getToolCallback(server, "list_meeting_events");
    await cb({ platformType: "zoom", page: 0 });
    expect(mockGet).toHaveBeenCalledWith("/v1/meeting-assistant/events", {
      params: { platformType: "zoom", page: 0 },
    });
  });

  it("schedule_meeting_event calls POST /v1/meeting-assistant/events/schedule", async () => {
    const cb = getToolCallback(server, "schedule_meeting_event");
    await cb({ meetingUrl: "https://zoom.us/j/123", title: "Standup" });
    expect(mockPost).toHaveBeenCalledWith("/v1/meeting-assistant/events/schedule", {
      meetingUrl: "https://zoom.us/j/123",
      title: "Standup",
    });
  });

  it("remove_assistant_from_meeting calls PUT with params", async () => {
    const cb = getToolCallback(server, "remove_assistant_from_meeting");
    await cb({ meetingAssistantEventId: "evt1" });
    expect(mockPut).toHaveBeenCalledWith(
      "/v1/meeting-assistant/events/remove",
      null,
      { params: { meetingAssistantEventId: "evt1" } }
    );
  });

  it("delete_scheduled_assistant calls DELETE with params", async () => {
    const cb = getToolCallback(server, "delete_scheduled_assistant");
    await cb({ meetingAssistantEventId: "evt1" });
    expect(mockDelete).toHaveBeenCalledWith(
      "/v1/meeting-assistant/events",
      { params: { meetingAssistantEventId: "evt1" } }
    );
  });

  it("handles error on schedule_meeting_event", async () => {
    mockPost.mockRejectedValueOnce(new Error("fail"));
    const cb = getToolCallback(server, "schedule_meeting_event");
    const result = await cb({ meetingUrl: "https://zoom.us/j/123" });
    expect(result.isError).toBe(true);
  });
});

describe("Recorder tools", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/recorder.js");
    register(server, mockClient);
  });

  it("check_recorder_status calls GET /v1/recorder/status/:token", async () => {
    const cb = getToolCallback(server, "check_recorder_status");
    await cb({ token: "tok1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/recorder/status/tok1");
  });

  it("create_recorder calls POST /v1/recorder/create", async () => {
    const cb = getToolCallback(server, "create_recorder");
    await cb({ name: "Survey 1", folderId: "f1" });
    expect(mockPost).toHaveBeenCalledWith("/v1/recorder/create", {
      name: "Survey 1",
      folderId: "f1",
    });
  });

  it("list_recorders calls GET /v1/recorder with params", async () => {
    const cb = getToolCallback(server, "list_recorders");
    await cb({ page: 0, pageSize: 10 });
    expect(mockGet).toHaveBeenCalledWith("/v1/recorder", {
      params: { page: 0, pageSize: 10 },
    });
  });

  it("clone_recorder calls POST /v1/recorder/clone", async () => {
    const cb = getToolCallback(server, "clone_recorder");
    await cb({ recorderId: "r1" });
    expect(mockPost).toHaveBeenCalledWith("/v1/recorder/clone", { recorderId: "r1" });
  });

  it("get_recorder_info calls GET /v1/recorder/:id", async () => {
    const cb = getToolCallback(server, "get_recorder_info");
    await cb({ recorderId: "r1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/recorder/r1");
  });

  it("get_recorder_recordings calls GET /v1/recorder/recordings/:id", async () => {
    const cb = getToolCallback(server, "get_recorder_recordings");
    await cb({ recorderId: "r1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/recorder/recordings/r1");
  });

  it("generate_recorder_url calls GET /v1/recorder/url/:id", async () => {
    const cb = getToolCallback(server, "generate_recorder_url");
    await cb({ recorderId: "r1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/recorder/url/r1");
  });

  it("update_recorder_settings calls PUT /v1/recorder/settings/:id", async () => {
    const cb = getToolCallback(server, "update_recorder_settings");
    await cb({ recorderId: "r1", settings: { branding: true } });
    expect(mockPut).toHaveBeenCalledWith("/v1/recorder/settings/r1", { branding: true });
  });

  it("update_recorder_questions calls PUT /v1/recorder/questions/:id", async () => {
    const cb = getToolCallback(server, "update_recorder_questions");
    await cb({ recorderId: "r1", questions: [{ text: "How was it?" }] });
    expect(mockPut).toHaveBeenCalledWith("/v1/recorder/questions/r1", {
      questions: [{ text: "How was it?" }],
    });
  });

  it("delete_recorder calls DELETE /v1/recorder/:id", async () => {
    const cb = getToolCallback(server, "delete_recorder");
    await cb({ recorderId: "r1" });
    expect(mockDelete).toHaveBeenCalledWith("/v1/recorder/r1");
  });

  it("handles error on list_recorders", async () => {
    mockGet.mockRejectedValueOnce(new Error("fail"));
    const cb = getToolCallback(server, "list_recorders");
    const result = await cb({});
    expect(result.isError).toBe(true);
  });
});

describe("Text tools", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/text.js");
    register(server, mockClient);
  });

  it("create_text_note calls POST /v1/text/create", async () => {
    const cb = getToolCallback(server, "create_text_note");
    await cb({ name: "My Note", text: "Hello world", folderId: "f1" });
    expect(mockPost).toHaveBeenCalledWith("/v1/text/create", {
      name: "My Note",
      text: "Hello world",
      folderId: "f1",
    });
  });

  it("get_text_insight calls GET /v1/text/insight/:id", async () => {
    const cb = getToolCallback(server, "get_text_insight");
    await cb({ mediaId: "t1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/text/insight/t1");
  });

  it("reanalyze_text calls GET /v1/text/reanalyze/:id", async () => {
    const cb = getToolCallback(server, "reanalyze_text");
    await cb({ mediaId: "t1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/text/reanalyze/t1");
  });

  it("update_text_note calls PUT /v1/text/update/:id", async () => {
    const cb = getToolCallback(server, "update_text_note");
    await cb({ mediaId: "t1", name: "Renamed", text: "Updated content" });
    expect(mockPut).toHaveBeenCalledWith("/v1/text/update/t1", {
      name: "Renamed",
      text: "Updated content",
    });
  });

  it("handles error on create_text_note", async () => {
    mockPost.mockRejectedValueOnce(new Error("fail"));
    const cb = getToolCallback(server, "create_text_note");
    const result = await cb({ name: "Note" });
    expect(result.isError).toBe(true);
  });
});

describe("Webhook tools", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/webhooks.js");
    register(server, mockClient);
  });

  it("create_webhook calls POST /v1/webhook", async () => {
    const cb = getToolCallback(server, "create_webhook");
    await cb({ url: "https://example.com/hook", events: ["media.processed"] });
    expect(mockPost).toHaveBeenCalledWith("/v1/webhook", {
      url: "https://example.com/hook",
      events: ["media.processed"],
    });
  });

  it("list_webhooks calls GET /v1/webhook", async () => {
    const cb = getToolCallback(server, "list_webhooks");
    await cb({});
    expect(mockGet).toHaveBeenCalledWith("/v1/webhook");
  });

  it("update_webhook calls PUT /v1/webhook/:id", async () => {
    const cb = getToolCallback(server, "update_webhook");
    await cb({ webhookId: "wh1", url: "https://new.com/hook" });
    expect(mockPut).toHaveBeenCalledWith("/v1/webhook/wh1", { url: "https://new.com/hook" });
  });

  it("delete_webhook calls DELETE /v1/webhook/:id", async () => {
    const cb = getToolCallback(server, "delete_webhook");
    await cb({ webhookId: "wh1" });
    expect(mockDelete).toHaveBeenCalledWith("/v1/webhook/wh1");
  });

  it("handles error on create_webhook", async () => {
    mockPost.mockRejectedValueOnce(new Error("fail"));
    const cb = getToolCallback(server, "create_webhook");
    const result = await cb({ url: "https://example.com/hook" });
    expect(result.isError).toBe(true);
  });
});

describe("Workflows tools (upload_and_analyze)", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/workflows.js");
    register(server, mockClient);
  });

  it("upload_and_analyze returns media_id immediately without polling", async () => {
    mockPost.mockResolvedValueOnce({
      data: { data: { mediaId: "m1", state: "pending" } },
    });

    const cb = getToolCallback(server, "upload_and_analyze");
    const result = await cb({ url: "https://example.com/audio.mp3" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.mediaId).toBe("m1");
    expect(parsed.state).toBe("pending");
    expect(parsed.message).toMatch(/Upload accepted/i);
    expect(Array.isArray(parsed.nextSteps)).toBe(true);
    expect(parsed.nextSteps.join(" ")).toMatch(/get_media_status/);

    // Verify upload was called correctly
    expect(mockPost).toHaveBeenCalledWith("/v1/media/upload", expect.objectContaining({
      url: "https://example.com/audio.mp3",
      mediaType: "audio",
    }));

    // Critically: no polling, no transcript/insights fetch.
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("upload_and_analyze returns error when upload has no mediaId", async () => {
    mockPost.mockResolvedValueOnce({ data: { data: {} } });

    const cb = getToolCallback(server, "upload_and_analyze");
    const result = await cb({ url: "https://example.com/audio.mp3" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("no mediaId");
  });

  it("upload_and_analyze defaults state to pending when not returned", async () => {
    mockPost.mockResolvedValueOnce({
      data: { data: { mediaId: "m2" } },
    });

    const cb = getToolCallback(server, "upload_and_analyze");
    const result = await cb({ url: "https://example.com/audio.mp3" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.mediaId).toBe("m2");
    expect(parsed.state).toBe("pending");
  });

  it("upload_and_analyze uses custom name and mediaType", async () => {
    mockPost.mockResolvedValueOnce({
      data: { data: { mediaId: "m1", state: "pending" } },
    });

    const cb = getToolCallback(server, "upload_and_analyze");
    await cb({
      url: "https://example.com/video.mp4",
      name: "Team Meeting",
      mediaType: "video",
      sourceLanguage: "en-US",
      folderId: "f1",
      tags: "meeting,team",
    });

    expect(mockPost).toHaveBeenCalledWith("/v1/media/upload", {
      name: "Team Meeting",
      url: "https://example.com/video.mp4",
      mediaType: "video",
      sourceLanguage: "en-US",
      folderId: "f1",
      tags: "meeting,team",
    });
  });

  it("upload_and_analyze handles API error gracefully", async () => {
    mockPost.mockRejectedValueOnce(new Error("Network error"));

    const cb = getToolCallback(server, "upload_and_analyze");
    const result = await cb({ url: "https://example.com/audio.mp3" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Network error");
  });

  it("upload_local_file returns error for missing file", async () => {
    const fs = await import("fs");
    (fs.existsSync as any).mockReturnValue(false);

    const cb = getToolCallback(server, "upload_local_file");
    const result = await cb({ filePath: "/nonexistent/file.mp3" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("File not found");
  });

  it("upload_local_file requests signed URL and creates media entry", async () => {
    const fs = await import("fs");
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(Buffer.from("fake-audio"));

    // Signed URL response
    mockGet.mockResolvedValueOnce({
      data: { data: { signedUrl: "https://s3.aws.com/upload?sig=xxx", key: "uploads/file.mp3" } },
    });
    // Create media response
    mockPost.mockResolvedValueOnce({
      data: { data: { mediaId: "m1", state: "pending" } },
    });

    const cb = getToolCallback(server, "upload_local_file");
    const result = await cb({ filePath: "/tmp/test.mp3", name: "Test Audio" });

    // Verify signed URL was requested
    expect(mockGet).toHaveBeenCalledWith("/v1/media/upload/signedurl", {
      params: expect.objectContaining({ filename: "test.mp3" }),
    });
  });
});

describe("Prompt tools — remaining untested endpoints", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/prompt.js");
    register(server, mockClient);
  });

  it("retry_magic_prompt calls POST /v1/prompt/retry", async () => {
    const cb = getToolCallback(server, "retry_magic_prompt");
    await cb({ promptId: "p1", messageId: "msg1" });
    expect(mockPost).toHaveBeenCalledWith("/v1/prompt/retry", {
      promptId: "p1",
      messageId: "msg1",
    });
  });

  it("get_chat_messages calls GET /v1/prompt/messages with params", async () => {
    const cb = getToolCallback(server, "get_chat_messages");
    await cb({ promptId: "p1", page: 0, pageSize: 25 });
    expect(mockGet).toHaveBeenCalledWith("/v1/prompt/messages", {
      params: { promptId: "p1", page: 0, pageSize: 25 },
    });
  });

  it("delete_chat_message calls DELETE /v1/prompt/message/:id", async () => {
    const cb = getToolCallback(server, "delete_chat_message");
    await cb({ promptId: "p1" });
    expect(mockDelete).toHaveBeenCalledWith("/v1/prompt/message/p1");
  });

  it("get_favorite_prompts calls GET /v1/prompt/favorites", async () => {
    const cb = getToolCallback(server, "get_favorite_prompts");
    await cb({});
    expect(mockGet).toHaveBeenCalledWith("/v1/prompt/favorites");
  });

  it("toggle_prompt_favorite calls POST /v1/prompt/favorites", async () => {
    const cb = getToolCallback(server, "toggle_prompt_favorite");
    await cb({ promptId: "p1", messageId: "msg1", isFavorite: true });
    expect(mockPost).toHaveBeenCalledWith("/v1/prompt/favorites", {
      promptId: "p1",
      messageId: "msg1",
      isFavorite: true,
    });
  });

  it("update_chat_title calls PUT /v1/prompt/:id", async () => {
    const cb = getToolCallback(server, "update_chat_title");
    await cb({ promptId: "p1", title: "Renamed Chat" });
    expect(mockPut).toHaveBeenCalledWith("/v1/prompt/p1", { title: "Renamed Chat" });
  });

  it("submit_chat_feedback calls POST /v1/prompt/feedback", async () => {
    const cb = getToolCallback(server, "submit_chat_feedback");
    await cb({ promptId: "p1", messageId: "msg1", score: 1, reason: "Great answer" });
    expect(mockPost).toHaveBeenCalledWith("/v1/prompt/feedback", {
      promptId: "p1",
      messageId: "msg1",
      score: 1,
      reason: "Great answer",
    });
  });

  it("get_chat_statistics calls GET /v1/prompt/statistics with params", async () => {
    const cb = getToolCallback(server, "get_chat_statistics");
    await cb({ startDate: "2025-01-01", endDate: "2025-06-30" });
    expect(mockGet).toHaveBeenCalledWith("/v1/prompt/statistics", {
      params: { startDate: "2025-01-01", endDate: "2025-06-30" },
    });
  });

  it("export_chat_answer calls POST /v1/prompt/export", async () => {
    const cb = getToolCallback(server, "export_chat_answer");
    await cb({ promptId: "p1" });
    expect(mockPost).toHaveBeenCalledWith("/v1/prompt/export", { promptId: "p1" });
  });
});

describe("Clips tools — remaining untested endpoints", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/clips.js");
    register(server, mockClient);
  });

  it("get_clips calls GET /v1/clips with optional mediaId", async () => {
    const cb = getToolCallback(server, "get_clips");
    await cb({ mediaId: "m1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/clips", { params: { mediaId: "m1" } });
  });

  it("get_clips works without mediaId", async () => {
    const cb = getToolCallback(server, "get_clips");
    await cb({});
    expect(mockGet).toHaveBeenCalled();
  });

  it("update_clip calls PUT /v1/clips/:id", async () => {
    const cb = getToolCallback(server, "update_clip");
    await cb({ clipId: "c1", title: "Renamed Clip" });
    expect(mockPut).toHaveBeenCalledWith("/v1/clips/c1", { title: "Renamed Clip" });
  });
});

describe("Folder tools", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/folders.js");
    register(server, mockClient);
  });

  it("get_folder_info calls GET /v1/folder/:folderId", async () => {
    const cb = getToolCallback(server, "get_folder_info");
    await cb({ folderId: "f1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/folder/f1");
  });

  it("create_folder calls POST /v1/folder", async () => {
    const cb = getToolCallback(server, "create_folder");
    await cb({ name: "New Folder", parentFolderId: "parent1" });
    expect(mockPost).toHaveBeenCalledWith("/v1/folder", {
      name: "New Folder",
      parentFolderId: "parent1",
    });
  });

  it("clone_folder calls POST /v1/folder/clone", async () => {
    const cb = getToolCallback(server, "clone_folder");
    await cb({ folderId: "f1" });
    expect(mockPost).toHaveBeenCalledWith("/v1/folder/clone", { folderId: "f1" });
  });

  it("update_folder calls PUT /v1/folder/:folderId", async () => {
    const cb = getToolCallback(server, "update_folder");
    await cb({ folderId: "f1", name: "Renamed" });
    expect(mockPut).toHaveBeenCalledWith("/v1/folder/f1", { name: "Renamed" });
  });

  it("delete_folder calls DELETE /v1/folder/:folderId", async () => {
    const cb = getToolCallback(server, "delete_folder");
    await cb({ folderId: "f1" });
    expect(mockDelete).toHaveBeenCalledWith("/v1/folder/f1");
  });

  it("create_folder_view calls POST /v1/folders/:folderId/views", async () => {
    const cb = getToolCallback(server, "create_folder_view");
    await cb({ folderId: "f1", name: "My View", filters: { status: "active" } });
    expect(mockPost).toHaveBeenCalledWith("/v1/folders/f1/views", {
      name: "My View",
      filters: { status: "active" },
    });
  });

  it("update_folder_view calls PUT /v1/folders/:folderId/views/:viewId", async () => {
    const cb = getToolCallback(server, "update_folder_view");
    await cb({ folderId: "f1", viewId: "v1", name: "Updated View" });
    expect(mockPut).toHaveBeenCalledWith("/v1/folders/f1/views/v1", {
      name: "Updated View",
    });
  });

  it("clone_folder_view calls POST /v1/folders/views/clone", async () => {
    const cb = getToolCallback(server, "clone_folder_view");
    await cb({ viewId: "v1" });
    expect(mockPost).toHaveBeenCalledWith("/v1/folders/views/clone", { viewId: "v1" });
  });

  it("handles error on get_folder_info", async () => {
    mockGet.mockRejectedValueOnce(new Error("fail"));
    const cb = getToolCallback(server, "get_folder_info");
    const result = await cb({ folderId: "f1" });
    expect(result.isError).toBe(true);
  });
});

describe("Media tools — additional endpoints", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/media.js");
    register(server, mockClient);
  });

  it("get_signed_upload_url calls GET /v1/media/upload/signedurl with params", async () => {
    const cb = getToolCallback(server, "get_signed_upload_url");
    await cb({ isVideo: false, filename: "audio.mp3", mimeType: "audio/mpeg" });
    expect(mockGet).toHaveBeenCalledWith("/v1/media/upload/signedurl", {
      params: { isVideo: false, filename: "audio.mp3", mimeType: "audio/mpeg" },
    });
  });

  it("update_transcript_speakers calls PUT /v1/media/speakers/:mediaId", async () => {
    const cb = getToolCallback(server, "update_transcript_speakers");
    await cb({
      mediaId: "m1",
      speakers: [{ id: "s1", name: "Alice" }],
    });
    expect(mockPut).toHaveBeenCalledWith("/v1/media/speakers/m1", {
      speakers: [{ id: "s1", name: "Alice" }],
    });
  });

  it("update_media_metadata calls PUT /v1/media/:mediaId", async () => {
    const cb = getToolCallback(server, "update_media_metadata");
    await cb({ mediaId: "m1", name: "Renamed Media", tags: ["tag1"] });
    expect(mockPut).toHaveBeenCalledWith("/v1/media/m1", {
      name: "Renamed Media",
      tags: ["tag1"],
    });
  });

  it("get_captions calls GET /v1/media/caption/:mediaId", async () => {
    const cb = getToolCallback(server, "get_captions");
    await cb({ mediaId: "m1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/media/caption/m1");
  });

  it("list_supported_languages calls GET /v1/media/supportedLanguages", async () => {
    const cb = getToolCallback(server, "list_supported_languages");
    await cb({});
    expect(mockGet).toHaveBeenCalledWith("/v1/media/supportedLanguages");
  });

  it("get_media_statistics calls GET /v1/media/statistics", async () => {
    const cb = getToolCallback(server, "get_media_statistics");
    await cb({});
    expect(mockGet).toHaveBeenCalledWith("/v1/media/statistics");
  });

  it("toggle_media_favorite calls POST /v1/media/favorites", async () => {
    const cb = getToolCallback(server, "toggle_media_favorite");
    await cb({ mediaId: "m1" });
    expect(mockPost).toHaveBeenCalledWith("/v1/media/favorites", { mediaId: "m1" });
  });

  it("reanalyze_media calls POST /v1/media/reanalyze/:mediaId", async () => {
    const cb = getToolCallback(server, "reanalyze_media");
    await cb({ mediaId: "m1" });
    expect(mockPost).toHaveBeenCalledWith("/v1/media/reanalyze/m1", {});
  });

  it("bulk_move_media calls PUT /v1/media/move", async () => {
    const cb = getToolCallback(server, "bulk_move_media");
    await cb({ folderId: "f1", mediaIds: ["m1", "m2"] });
    expect(mockPut).toHaveBeenCalledWith("/v1/media/move", {
      folderId: "f1",
      mediaIds: ["m1", "m2"],
    });
  });

  it("handles error on get_captions", async () => {
    mockGet.mockRejectedValueOnce(new Error("fail"));
    const cb = getToolCallback(server, "get_captions");
    const result = await cb({ mediaId: "m1" });
    expect(result.isError).toBe(true);
  });
});
