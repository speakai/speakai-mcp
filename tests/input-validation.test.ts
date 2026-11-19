import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";

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

let server: McpServer;

beforeEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  mockGet.mockResolvedValue({ data: { data: {} } });
  mockPost.mockResolvedValue({ data: { data: {} } });
  mockPut.mockResolvedValue({ data: { data: {} } });
  mockDelete.mockResolvedValue({ data: { data: {} } });
  server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
});

describe("parameters the tool decides", () => {
  describe("media uploads", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);
    });

    it("upload_media fills in a name from the URL when the caller gives none", async () => {
      expect(getToolInputSchema(server, "upload_media").safeParse({ url: "https://x.com/a.mp3" }).success).toBe(true);

      mockPost.mockResolvedValueOnce({ data: { data: { mediaId: "m1" } } });
      await getToolCallback(server, "upload_media")({ name: "", url: "https://x.com/calls/a.mp3?sig=1" });
      expect(mockPost).toHaveBeenCalledWith("/v1/media/upload", expect.objectContaining({ name: "a.mp3" }));
    });

    // mediaType decides the storage path, mimeType follows the filename's bytes, and the retired isVideo is never sent.
    it.each([
      {
        input: { mediaType: "video", filename: "meeting.mp4", mimeType: "video/mp4" },
        params: { mediaType: "video", filename: "meeting.mp4", mimeType: "video/mp4" },
      },
      { input: { filename: "meeting.mp4" }, params: { mediaType: "video", filename: "meeting.mp4", mimeType: "video/mp4" } },
      { input: { mediaType: "audio", isVideo: true, filename: "meeting.mp4" }, params: { mediaType: "audio", filename: "meeting.mp4", mimeType: "video/mp4" } },
    ])("get_signed_upload_url sends $params for $input", async ({ input, params }) => {
      await getToolCallback(server, "get_signed_upload_url")(input);
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith("/v1/media/upload/signedurl", { params });
    });

    it("set_media_thumbnail rejects bad input before calling the API", async () => {
      const schema = getToolInputSchema(server, "set_media_thumbnail");
      expect(schema.safeParse({ mediaId: "m", atSeconds: -1 }).success).toBe(false);
      expect(schema.safeParse({ mediaId: "m", imageUrl: "http://example.com/a.png" }).success).toBe(false);

      const callback = getToolCallback(server, "set_media_thumbnail");
      const gif = Buffer.from("GIF89a").toString("base64");
      const tooBig = Buffer.alloc(10 * 1024 * 1024 + 1, 0xff).toString("base64");
      for (const params of [
        { mediaId: "m" },
        { mediaId: "m", imageUrl: "https://example.com/a.png", atSeconds: 1 },
        { mediaId: "m", imageBase64: gif },
        { mediaId: "m", imageBase64: tooBig },
      ]) {
        expect((await callback(params)).isError).toBe(true);
      }
      expect(mockPut).not.toHaveBeenCalled();
    });
  });

  it("search_media searches from 1 January this year to now when no dates are given", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T12:34:56.789Z"));
    const { register } = await import("../src/tools/analytics.js");
    register(server, mockClient);

    await getToolCallback(server, "search_media")({ query: "action items" });
    await getToolCallback(server, "search_media")({ query: "pricing", startDate: "2025-01-01", endDate: "2025-06-30" });

    expect(mockPost.mock.calls).toEqual([
      ["/v1/analytics/search", { query: "action items", startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-04-25T12:34:56.789Z" }],
      ["/v1/analytics/search", { query: "pricing", startDate: "2025-01-01", endDate: "2025-06-30" }],
    ]);
  });

  // assignTo replaces who can open the folder, so both user ids and "(G)" group ids must survive the schema and reach the API.
  it("create_folder and update_folder keep assignTo for users and groups", async () => {
    const { register } = await import("../src/tools/folders.js");
    register(server, mockClient);
    const assignTo = ["user123", "group456 (G)"];

    for (const [tool, input] of [
      ["create_folder", { name: "Research", assignTo }],
      ["update_folder", { folderId: "f1", name: "Research", assignTo }],
    ] as const) {
      const result = getToolInputSchema(server, tool).safeParse(input);
      expect(result.success).toBe(true);
      expect(result.data.assignTo).toEqual(assignTo);
    }

    await getToolCallback(server, "update_folder")({ folderId: "f1", name: "Research", assignTo: ["group456 (G)"] });
    expect(mockPut).toHaveBeenCalledWith("/v1/folder/f1", { name: "Research", assignTo: ["group456 (G)"] });
  });
});

describe("schemas reject input the API would misroute or misapply", () => {
  const MODULES: Record<string, () => Promise<{ register: Function }>> = {
    media: () => import("../src/tools/media.js"),
    folders: () => import("../src/tools/folders.js"),
    exports: () => import("../src/tools/exports.js"),
    webhooks: () => import("../src/tools/webhooks.js"),
    prompt: () => import("../src/tools/prompt.js"),
  };

  // Valid/invalid pairs so a reject-everything schema fails; an empty id would hit another route (DELETE /v1/folder/).
  it.each([
    { module: "media", tool: "get_transcript", valid: { mediaId: "m1" }, invalid: { mediaId: "" } },
    { module: "media", tool: "bulk_move_media", valid: { folderId: "f1", mediaIds: ["m1"] }, invalid: { folderId: "f1", mediaIds: [] } },
    { module: "media", tool: "bulk_move_media", valid: { folderId: "f1", mediaIds: ["m1"] }, invalid: { folderId: "", mediaIds: ["m1"] } },
    { module: "media", tool: "update_transcript_speakers", valid: { mediaId: "a", speakers: [{ id: "s0", name: "Alice" }] }, invalid: { mediaId: "a", speakers: [{ id: "", name: "Alice" }] } },
    { module: "media", tool: "update_transcript_speakers", valid: { mediaId: "a", speakers: [{ id: "s0", name: "Alice" }] }, invalid: { mediaId: "a", speakers: [{ id: "s0", name: "" }] } },
    { module: "media", tool: "list_media", valid: { pageSize: 100 }, invalid: { pageSize: 101 } },
    { module: "folders", tool: "delete_folder", valid: { folderId: "f1" }, invalid: { folderId: "" } },
    { module: "exports", tool: "export_media", valid: { mediaId: "abc", fileType: "pdf" }, invalid: { mediaId: "", fileType: "pdf" } },
    { module: "webhooks", tool: "create_webhook", valid: { callbackUrl: "https://example.com/webhook" }, invalid: { callbackUrl: "not-a-url" } },
    { module: "webhooks", tool: "delete_webhook", valid: { webhookId: "w1" }, invalid: { webhookId: "" } },
    { module: "prompt", tool: "ask_ai_chat", valid: { prompt: "Summarise" }, invalid: { prompt: "" } },
    { module: "prompt", tool: "retry_ai_chat", valid: { promptId: "p1", messageId: "msg1" }, invalid: { promptId: "", messageId: "msg1" } },
  ])("$tool rejects $invalid", async ({ module, tool, valid, invalid }) => {
    const { register } = await MODULES[module]();
    register(server, mockClient, { aiChat: true });
    const schema = getToolInputSchema(server, tool);

    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse(invalid).success).toBe(false);
  });

  // Mirrors analyzeGapsBody in the API server: 20 anchors of 500 and 20 summaries of 2000.
  describe("analyze_voice_instruction_gaps matches the server caps", () => {
    beforeEach(async () => {
      const { register } = await import("../src/tools/voice-intelligence.js");
      register(server, mockClient);
    });

    it("accepts inputs at the caps", () => {
      const result = getToolInputSchema(server, "analyze_voice_instruction_gaps").safeParse({
        agentId: "a1",
        anchors: Array(20).fill("a".repeat(500)),
        conversationSummaries: Array(20).fill("s".repeat(2000)),
      });
      expect(result.success).toBe(true);
    });

    it.each([
      { anchors: Array(21).fill("a") },
      { anchors: ["a".repeat(501)] },
      { anchors: ["   "] },
      { conversationSummaries: Array(21).fill("s") },
      { conversationSummaries: ["s".repeat(2001)] },
      { conversationSummaries: ["   "] },
    ])("rejects %o", (body) => {
      expect(getToolInputSchema(server, "analyze_voice_instruction_gaps").safeParse({ agentId: "a1", ...body }).success).toBe(false);
    });
  });
});
