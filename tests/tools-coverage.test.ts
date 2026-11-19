/**
 * Handler tests for tools that decide something: build or reshape the request, refuse bad input,
 * enrich or summarise the reply, or upload. Pass-through wrappers are covered by the v1 schema
 * snapshot (tool-names.test.ts) and the error mapping tests (error-handling.test.ts).
 */
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
    register(server, mockClient, { automations: true, voiceTestRunDetails: true });
  });

  it("create_automation calls POST /v1/automations/", async () => {
    const cb = getToolCallback(server, "create_automation");
    const body = {
      name: "My Rule",
      trigger: { type: "folders", folderIds: ["f1"] },
      steps: [{ stepId: "s1", stepType: "translation", translation: { targetLanguage: "es" } }],
    };
    await cb(body);
    expect(mockPost).toHaveBeenCalledWith("/v1/automations/", body);
    // Non-webhook automations skip the inbound-webhook enrichment lookups.
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("create_automation enriches inbound-webhook automations with the receive URL and tokens", async () => {
    mockPost.mockResolvedValueOnce({
      data: { status: "success", data: { automationId: "auto1", message: "created" } },
    });
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/automations/auto1") {
        return Promise.resolve({
          data: { status: "success", data: { trigger: { webhookId: "wh1", childKey: "data" } } },
        });
      }
      return Promise.resolve({
        data: {
          status: "success",
          data: {
            webhookData: {
              inboundUrl: "https://api.test/v1/webhook/in/tok",
              samplePayload: { data: { url: "https://x.mp3", name: "Call" } },
              flattenedPaths: ["data.url", "data.name"],
            },
          },
        },
      });
    });
    const cb = getToolCallback(server, "create_automation");
    const result = await cb({
      name: "Webhook Rule",
      trigger: { type: "folders", triggerSlug: "inbound_webhook", childKey: "data" },
      steps: [
        {
          stepId: "s1",
          stepType: "speak-upload",
          speakUpload: { sourceMode: "url", sourceUrl: "{{trigger.payload.url}}", folderId: "f1" },
        },
      ],
    });
    expect(mockGet).toHaveBeenCalledWith("/v1/automations/auto1");
    expect(mockGet).toHaveBeenCalledWith("/v1/webhook/wh1");
    const text = result.content[0].text;
    expect(text).toContain("auto1");
    expect(text).toContain("https://api.test/v1/webhook/in/tok");
    expect(text).toContain("{{trigger.payload.url}}");
    expect(result.isError).toBeUndefined();
  });

  it("create_automation still succeeds when webhook enrichment fails", async () => {
    mockPost.mockResolvedValueOnce({
      data: { status: "success", data: { automationId: "auto2", message: "created" } },
    });
    mockGet.mockRejectedValue(new Error("boom"));
    const cb = getToolCallback(server, "create_automation");
    const result = await cb({
      name: "Webhook Rule",
      trigger: { type: "folders", triggerSlug: "inbound_webhook" },
      // notify accepts the webhook's DATA flow; a translation step here would be rejected
      // by the graph check (and by the server) because translation only accepts media.
      steps: [{ stepId: "s1", stepType: "notify", notify: { channel: "in_app", message: "hi" } }],
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("auto2");
  });

  it("refuses a branch on a scheduled automation before sending it", async () => {
    const cb = getToolCallback(server, "create_automation");
    const result = await cb({
      name: "Weekly digest",
      runType: "schedule",
      schedule: { timePeriod: "last7days", repeatAt: "09:00" },
      trigger: { type: "folders", triggerSlug: "schedule", folderIds: ["f1"] },
      steps: [
        { stepId: "c", stepType: "condition", condition: { logic: "AND", rules: [{ field: "duration", op: "gt", value: 60 }] } },
        { stepId: "n", stepType: "notify", dependsOn: ["c"], branch: "true", notify: { channel: "in_app", message: "x" } },
      ],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("scheduled automation cannot branch");
    expect(mockPost).not.toHaveBeenCalledWith("/v1/automations/", expect.anything());
  });

  it("get_automation_run_stats sends the window the server's schema accepts", async () => {
    // Regression: this tool shipped with invented `from`/`to` params. The endpoint's Joi
    // schema takes `days` (1-90) and rejects unknown keys.
    const cb = getToolCallback(server, "get_automation_run_stats");
    await cb({ automationId: "auto1", days: 7 });
    expect(mockGet).toHaveBeenCalledWith("/v1/automations/auto1/runs/stats", { params: { days: 7 } });
  });

  it("get_automation_run summarises which way each branch went", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        status: "success",
        data: {
          status: "completed",
          steps: [
            { stepId: "c", stepType: "condition", status: "completed", outputs: { branch: "true" } },
            { stepId: "yes", stepType: "notify", status: "completed", branch: "true", branchSkipped: false },
            { stepId: "no", stepType: "notify", status: "completed", branch: "false", branchSkipped: true },
          ],
        },
      },
    });
    const cb = getToolCallback(server, "get_automation_run");
    const result = await cb({ automationId: "auto1", runId: "run1" });
    const body = JSON.parse(result.content[0].text);
    expect(body.branchSummary.conditions).toEqual([{ stepId: "c", took: "true" }]);
    expect(body.branchSummary.stepsSkippedBecauseTheirBranchWasNotTaken).toEqual(["no"]);
    expect(body.branchSummary.stepsThatRan).toEqual(["c", "yes"]);
  });

  it("says so when a run reads as killed but a leg did real work", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        status: "success",
        data: {
          status: "killed",
          steps: [
            { stepId: "c", stepType: "condition", status: "completed", outputs: { branch: "true" } },
            { stepId: "yes", stepType: "notify", status: "completed" },
            { stepId: "f", stepType: "filter", status: "killed", branch: "false" },
          ],
        },
      },
    });
    const cb = getToolCallback(server, "get_automation_run");
    const result = await cb({ automationId: "auto1", runId: "run1" });
    const body = JSON.parse(result.content[0].text);
    expect(body.branchSummary.note).toContain("ran to completion first");
  });

  it("describe_automation_graph explains a legacy automation instead of failing on it", async () => {
    // A pre-graph row keeps its `action` block and has no steps[]; not present in the test
    // workspace, so pinned here.
    mockGet.mockResolvedValueOnce({
      data: { status: "success", data: { automationId: "old1", name: "Legacy rule", steps: [] } },
    });
    const cb = getToolCallback(server, "describe_automation_graph");
    const result = await cb({ automationId: "old1" });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.shape).toBeNull();
    expect(body.note).toContain("legacy single-action rule");
  });

  it("update_automation sends the changed fields and returns the saved row", async () => {
    mockPut.mockResolvedValueOnce({ data: { status: "success", data: { automationId: "auto1", name: "Updated" } } });
    const result = await getToolCallback(server, "update_automation")({ automationId: "auto1", name: "Updated" });
    expect(mockPut).toHaveBeenCalledWith("/v1/automations/auto1", { name: "Updated" });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Updated");
  });

  it("update_automation refuses a branch on a scheduled automation before sending it", async () => {
    const result = await getToolCallback(server, "update_automation")({
      automationId: "auto1",
      runType: "schedule",
      trigger: { type: "folders", triggerSlug: "schedule", folderIds: ["f1"] },
      steps: [
        { stepId: "c", stepType: "condition", condition: { logic: "AND", rules: [{ field: "duration", op: "gt", value: 60 }] } },
        { stepId: "n", stepType: "notify", dependsOn: ["c"], branch: "true", notify: { channel: "in_app", message: "x" } },
      ],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("scheduled automation cannot branch");
    expect(mockPut).not.toHaveBeenCalled();
  });
});

// Tools whose handler builds, defaults or reshapes the request. Thin wrappers that pass their
// input straight to one endpoint are not listed: the v1 schema snapshot and error-handling
// tests cover them, and an exact-URL echo cannot fail for a reason a user would notice.
describe("Tools that shape the request", () => {
  let server: McpServer;
  const mocks = { get: mockGet, post: mockPost, put: mockPut, delete: mockDelete };

  beforeEach(async () => {
    vi.resetAllMocks();
    for (const mock of Object.values(mocks)) mock.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server, mockClient, { aiChat: true, automations: true, voiceTestRunDetails: true });
  });

  it.each<{ name: string; tool: string; input: Record<string, unknown>; method: keyof typeof mocks; call: unknown[] }>([
    {
      name: "create_text_note mirrors text into rawText",
      tool: "create_text_note",
      input: { name: "My Note", text: "Hello world", folderId: "f1" },
      method: "post",
      call: ["/v1/text/create", { name: "My Note", text: "Hello world", rawText: "Hello world", folderId: "f1" }],
    },
    {
      name: "update_text_note mirrors text into rawText",
      tool: "update_text_note",
      input: { mediaId: "t1", name: "Renamed", text: "Updated content" },
      method: "put",
      call: ["/v1/text/update/t1", { name: "Renamed", text: "Updated content", rawText: "Updated content" }],
    },
    {
      name: "update_text_note omits rawText when the text is not changing",
      tool: "update_text_note",
      input: { mediaId: "t1", name: "Renamed only" },
      method: "put",
      call: ["/v1/text/update/t1", { name: "Renamed only" }],
    },
    {
      name: "reanalyze_text turns on every analysis flag",
      tool: "reanalyze_text",
      input: { mediaId: "t1" },
      method: "get",
      call: ["/v1/media/reanalyze/t1", { params: { isInsights: true, isSentiment: true, isFillerWords: true, isEmbeddings: true } }],
    },
    {
      name: "get_clips lists clips for a media file",
      tool: "get_clips",
      input: { mediaId: "m1" },
      method: "get",
      call: ["/v1/clips", { params: { mediaId: "m1" } }],
    },
    {
      name: "get_clips fetches one clip by id, keeping the id out of the query",
      tool: "get_clips",
      input: { clipId: "c1" },
      method: "get",
      call: ["/v1/clips/c1", { params: {} }],
    },
    {
      name: "get_signed_upload_url defaults an audio file to the audio prefix",
      tool: "get_signed_upload_url",
      input: { filename: "audio.mp3", mimeType: "audio/mpeg" },
      method: "get",
      call: ["/v1/media/upload/signedurl", { params: { mediaType: "audio", filename: "audio.mp3", mimeType: "audio/mpeg" } }],
    },
    {
      name: "get_signed_upload_url detects a video file and its mime type from the name",
      tool: "get_signed_upload_url",
      input: { filename: "clip.mp4" },
      method: "get",
      call: ["/v1/media/upload/signedurl", { params: { mediaType: "video", filename: "clip.mp4", mimeType: "video/mp4" } }],
    },
    {
      name: "update_transcript_speakers sends the speakers as a bare array",
      tool: "update_transcript_speakers",
      input: { mediaId: "m1", speakers: [{ id: "s1", name: "Alice" }] },
      method: "put",
      call: ["/v1/media/speakers/m1", [{ id: "s1", name: "Alice" }]],
    },
    {
      name: "update_recorder_settings keeps the branding keys in meta",
      tool: "update_recorder_settings",
      input: { recorderId: "r1", meta: { logo: "s3://bucket/light.png", logoDark: "s3://bucket/dark.png" } },
      method: "put",
      call: ["/v1/recorder/settings/r1", { meta: { logo: "s3://bucket/light.png", logoDark: "s3://bucket/dark.png" } }],
    },
    {
      name: "update_embed keeps the branding keys in meta",
      tool: "update_embed",
      input: { embedId: "e1", meta: { primaryColor: "#000", isLabels: true, logoDark: "s3://bucket/dark.png", theme: "dark", fontFamily: "Arimo" } },
      method: "put",
      call: ["/v1/embed/e1", { meta: { primaryColor: "#000", isLabels: true, logoDark: "s3://bucket/dark.png", theme: "dark", fontFamily: "Arimo" } }],
    },
  ])("$name", async ({ tool, input, method, call }) => {
    const result = await getToolCallback(server, tool)(input);
    expect(result.isError).toBeUndefined();
    expect(mocks[method]).toHaveBeenCalledTimes(1);
    expect(mocks[method]).toHaveBeenCalledWith(...call);
  });

  it("create_field tells the model to use the returned id, not _id", async () => {
    mockPost.mockResolvedValueOnce({ data: { status: "success", data: { id: "be5d4bfc7e0e", _id: "6acee5e45fd676474d0d0291" } } });
    const result = await getToolCallback(server, "create_field")({ name: "Priority", type: "select", options: ["High", "Low"] });
    expect(result.content[0].text).toMatch(/^Field id: be5d4bfc7e0e \(use this id, not _id/);
  });

  it("update_multiple_fields rejects a field's database _id", () => {
    const schema = (server as any)._registeredTools["update_multiple_fields"].inputSchema;
    const parsed = schema.safeParse({ mediaIds: ["m1"], fields: [{ id: "6acee5e45fd676474d0d0291", value: "x" }] });
    expect(parsed.success).toBe(false);
    expect(parsed.error.issues[0].message).toContain("database _id");
    expect(schema.safeParse({ mediaIds: ["m1"], fields: [{ id: "be5d4bfc7e0e", value: "x" }] }).success).toBe(true);
  });

  it("embed session tools reject a malformed embed id and out-of-range paging", () => {
    const tools = (server as any)._registeredTools;
    const embedId = "a".repeat(24);
    expect(tools["list_embed_sessions"].inputSchema.safeParse({ embedId }).success).toBe(true);
    expect(tools["list_embed_sessions"].inputSchema.safeParse({ embedId: "not-an-id" }).success).toBe(false);
    expect(tools["list_embed_sessions"].inputSchema.safeParse({ embedId, pageSize: 101 }).success).toBe(false);
    expect(tools["list_embed_sessions"].inputSchema.safeParse({ embedId, device: "watch" }).success).toBe(false);
    expect(tools["get_embed_session"].inputSchema.safeParse({ embedId, id: "b".repeat(24), eventsPageSize: 501 }).success).toBe(false);
  });

  // Branding keys live in an untyped meta record, so the description is the only place a model learns them.
  it.each([
    ["update_embed", (t: any) => t.inputSchema.shape.meta.description, ['{ name: "fieldsFocus", isActive: false }', "isPromptAsk must be on", "logoDark must be an uploaded logo", "max 60 chars", "theme", "backgroundColor", "fontFamily", "titleColor"]],
    ["create_recorder", (t: any) => t.inputSchema.shape.meta.description, ["logoDark"]],
    ["update_recorder_settings", (t: any) => t.inputSchema.shape.meta.description, ["logoDark"]],
    ["list_fields", (t: any) => t.description, ["{{field.<slug>}}"]],
  ] as const)("%s documents what the model must send", (tool, read, phrases) => {
    const text = read((server as any)._registeredTools[tool]);
    for (const phrase of phrases) expect(text).toContain(phrase);
  });

  it.each<[string, keyof typeof mocks, Record<string, unknown>]>([
    ["create_embed", "post", { mediaId: "m1" }],
    ["export_media", "post", { mediaId: "m1", fileType: "pdf" }],
    ["schedule_meeting_event", "post", { meetingUrl: "https://zoom.us/j/123" }],
    ["create_text_note", "post", { name: "Note" }],
    ["create_webhook", "post", { url: "https://example.com/hook" }],
    ["update_recorder_settings", "put", { recorderId: "r1", name: "x" }],
    ["delete_folder", "delete", { folderId: "f1" }],
    ["toggle_media_favorite", "post", { mediaIds: ["m1"], isFavorite: true }],
  ])("%s reports a failed write as a tool error with the reason", async (tool, method, input) => {
    mocks[method].mockRejectedValueOnce(new Error("upstream refused"));
    const result = await getToolCallback(server, tool)(input);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("upstream refused");
  });
});

describe("Inbound webhook tools", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/webhooks.js");
    register(server, mockClient, { automations: true, voiceTestRunDetails: true });
  });

  it("provision_inbound_webhook calls POST /v1/webhook/inbound/provision and returns nextSteps", async () => {
    mockPost.mockResolvedValueOnce({
      data: { status: "success", data: { webhookId: "wh1", inboundUrl: "https://api.test/v1/webhook/in/tok" } },
    });
    const cb = getToolCallback(server, "provision_inbound_webhook");
    const result = await cb({});
    expect(mockPost).toHaveBeenCalledWith("/v1/webhook/inbound/provision", {});
    const text = result.content[0].text;
    expect(text).toContain("https://api.test/v1/webhook/in/tok");
    expect(text).toContain("nextSteps");
  });

  it("get_inbound_webhook with webhookId calls GET /v1/webhook/:id and maps payload tokens", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        status: "success",
        data: {
          webhookData: {
            inboundUrl: "https://api.test/v1/webhook/in/tok",
            samplePayload: { data: { url: "https://x.mp3" } },
            flattenedPaths: ["data.url", "data.name", "other"],
          },
        },
      },
    });
    const cb = getToolCallback(server, "get_inbound_webhook");
    const result = await cb({ webhookId: "wh1", childKey: "data" });
    expect(mockGet).toHaveBeenCalledWith("/v1/webhook/wh1");
    const text = result.content[0].text;
    expect(text).toContain("{{trigger.payload.url}}");
    expect(text).toContain("{{trigger.payload.name}}");
    expect(text).not.toContain("{{trigger.payload.other}}");
    expect(text).toContain("https://api.test/v1/webhook/in/tok");
  });

  it("get_inbound_webhook with automationId resolves the bound webhook and childKey", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/automations/auto1") {
        return Promise.resolve({
          data: { status: "success", data: { trigger: { webhookId: "wh9", childKey: "data" } } },
        });
      }
      return Promise.resolve({
        data: {
          status: "success",
          data: {
            webhookData: {
              inboundUrl: "https://api.test/v1/webhook/in/tok9",
              samplePayload: { data: { url: "https://x.mp3" } },
              flattenedPaths: ["data.url"],
            },
          },
        },
      });
    });
    const cb = getToolCallback(server, "get_inbound_webhook");
    const result = await cb({ automationId: "auto1" });
    expect(mockGet).toHaveBeenCalledWith("/v1/automations/auto1");
    expect(mockGet).toHaveBeenCalledWith("/v1/webhook/wh9");
    expect(result.content[0].text).toContain("{{trigger.payload.url}}");
  });

  it("get_inbound_webhook errors when neither webhookId nor automationId is given", async () => {
    const cb = getToolCallback(server, "get_inbound_webhook");
    const result = await cb({});
    expect(result.isError).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("get_inbound_webhook errors when the automation has no inbound webhook", async () => {
    mockGet.mockResolvedValueOnce({
      data: { status: "success", data: { trigger: { type: "folders", folderIds: ["f1"] } } },
    });
    const cb = getToolCallback(server, "get_inbound_webhook");
    const result = await cb({ automationId: "auto1" });
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
    register(server, mockClient, { localFileAccess: true, voiceTestRuns: true });
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

    // No mediaType: the caller sent none, so the server inspects the file instead of
    // being handed a guess read off the URL.
    const [, sentBody] = mockPost.mock.calls[0];
    expect(sentBody).not.toHaveProperty("mediaType");

    expect(mockPost).toHaveBeenCalledWith("/v1/media/upload", expect.objectContaining({
      url: "https://example.com/audio.mp3",
    }));

    // Critically: no polling, no transcript/insights fetch.
    expect(mockGet).not.toHaveBeenCalled();
  });

  // Regression: a YouTube watch URL has no file extension. Sending a guessed "audio" made the
  // server import the audio track only, and an .mp3 object can never be analysed as video.
  it("upload_and_analyze omits mediaType for a YouTube link so the server chooses", async () => {
    mockPost.mockResolvedValueOnce({
      data: { data: { mediaId: "m1", state: "pending" } },
    });

    const cb = getToolCallback(server, "upload_and_analyze");
    await cb({ url: "https://www.youtube.com/watch?v=FQD56iiK5Po" });

    const [, body] = mockPost.mock.calls[0];
    expect(body).not.toHaveProperty("mediaType");
  });

  it("upload_and_analyze sends a non-empty name for a page link that ends in a slash", async () => {
    mockPost.mockResolvedValueOnce({
      data: { data: { mediaId: "m1", state: "pending" } },
    });

    await getToolCallback(server, "upload_and_analyze")({ url: "https://www.instagram.com/reel/abc123/", name: "" });

    const [, body] = mockPost.mock.calls[0];
    expect(body.name).toMatch(/^Upload \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
  });

  it("upload_and_analyze still forwards an explicit mediaType for a page link", async () => {
    mockPost.mockResolvedValueOnce({
      data: { data: { mediaId: "m1", state: "pending" } },
    });

    const cb = getToolCallback(server, "upload_and_analyze");
    await cb({ url: "https://www.youtube.com/watch?v=FQD56iiK5Po", mediaType: "video" });

    expect(mockPost).toHaveBeenCalledWith("/v1/media/upload", expect.objectContaining({
      mediaType: "video",
    }));
  });

  describe("upload_and_analyze_batch", () => {
    const YT = (n: number) => `https://www.youtube.com/watch?v=vid${n}`;

    it("uploads every URL and reports each one", async () => {
      mockPost.mockImplementation((_u: string, body: any) =>
        Promise.resolve({ data: { data: { mediaId: `m-${body.url.slice(-1)}`, state: "pending" } } }),
      );

      const cb = getToolCallback(server, "upload_and_analyze_batch");
      const result = await cb({ urls: [YT(1), YT(2), YT(3)] });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.requested).toBe(3);
      expect(parsed.uploaded).toBe(3);
      expect(parsed.failed).toBe(0);
      expect(parsed.media.map((m: any) => m.mediaId)).toEqual(["m-1", "m-2", "m-3"]);
    });

    // One bad link in a list of good ones must not cost the user the rest of the batch.
    it("keeps going when one URL fails and reports its reason", async () => {
      mockPost.mockImplementation((_u: string, body: any) =>
        body.url.endsWith("vid2")
          ? Promise.reject(new Error("Could not import this YouTube video."))
          : Promise.resolve({ data: { data: { mediaId: "ok", state: "pending" } } }),
      );

      const cb = getToolCallback(server, "upload_and_analyze_batch");
      const result = await cb({ urls: [YT(1), YT(2), YT(3)] });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.uploaded).toBe(2);
      expect(parsed.failed).toBe(1);
      expect(parsed.errors[0].url).toBe(YT(2));
      expect(parsed.errors[0].error).toMatch(/Could not import/);
      expect(result.isError).toBeUndefined();
    });

    it("marks the call an error only when nothing uploaded", async () => {
      mockPost.mockRejectedValue(new Error("nope"));

      const cb = getToolCallback(server, "upload_and_analyze_batch");
      const result = await cb({ urls: [YT(1), YT(2)] });

      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).uploaded).toBe(0);
    });

    it("never runs more than the concurrency cap at once", async () => {
      let inFlight = 0;
      let peak = 0;
      mockPost.mockImplementation(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { data: { data: { mediaId: "m", state: "pending" } } };
      });

      const cb = getToolCallback(server, "upload_and_analyze_batch");
      await cb({ urls: Array.from({ length: 12 }, (_, i) => YT(i)) });

      expect(peak).toBeLessThanOrEqual(5);
    });

    it("honours concurrency 1 for a strictly sequential import", async () => {
      let inFlight = 0;
      let peak = 0;
      mockPost.mockImplementation(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { data: { data: { mediaId: "m", state: "pending" } } };
      });

      const cb = getToolCallback(server, "upload_and_analyze_batch");
      await cb({ urls: [YT(1), YT(2), YT(3)], concurrency: 1 });

      expect(peak).toBe(1);
    });

    // The same link twice is the same import and the same charge.
    it("uploads a duplicated URL once", async () => {
      mockPost.mockResolvedValue({ data: { data: { mediaId: "m", state: "pending" } } });

      const cb = getToolCallback(server, "upload_and_analyze_batch");
      const result = await cb({ urls: [YT(1), YT(1), YT(2)] });

      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(JSON.parse(result.content[0].text).requested).toBe(2);
    });

    it("applies the shared options to every upload and omits mediaType when unset", async () => {
      mockPost.mockResolvedValue({ data: { data: { mediaId: "m", state: "pending" } } });

      const cb = getToolCallback(server, "upload_and_analyze_batch");
      await cb({ urls: [YT(1), YT(2)], folderId: "f1", sourceLanguage: "en-US", tags: "a,b" });

      expect(mockPost).toHaveBeenCalledTimes(2);
      for (const [, body] of mockPost.mock.calls) {
        expect(body).toMatchObject({ folderId: "f1", sourceLanguage: "en-US", tags: "a,b" });
        expect(body).not.toHaveProperty("mediaType");
      }
    });

    it("forwards an explicit mediaType to every upload", async () => {
      mockPost.mockResolvedValue({ data: { data: { mediaId: "m", state: "pending" } } });

      const cb = getToolCallback(server, "upload_and_analyze_batch");
      await cb({ urls: [YT(1), YT(2)], mediaType: "audio" });

      expect(mockPost).toHaveBeenCalledTimes(2);
      for (const [, body] of mockPost.mock.calls) expect(body.mediaType).toBe("audio");
    });

    // A metered vendor sits behind YouTube resolution, so a batch can trip its limit.
    it("retries once when the upload is rate limited", async () => {
      let calls = 0;
      mockPost.mockImplementation(() => {
        calls++;
        return calls === 1
          ? Promise.reject(new Error("YouTube imports are temporarily rate limited."))
          : Promise.resolve({ data: { data: { mediaId: "m", state: "pending" } } });
      });

      const cb = getToolCallback(server, "upload_and_analyze_batch");
      const result = await cb({ urls: [YT(1)] });
      const parsed = JSON.parse(result.content[0].text);

      expect(calls).toBe(2);
      expect(parsed.uploaded).toBe(1);
      expect(parsed.failed).toBe(0);
    }, 15000);
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

  it("upload_local_file puts the bytes to the signed URL and stores the URL without its signature", async () => {
    const fs = await import("fs");
    const axios = (await import("axios")).default as any;
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(Buffer.from("fake-audio"));
    mockGet.mockResolvedValueOnce({
      data: { data: { signedUrl: "https://s3.aws.com/upload/test.mp3?sig=xxx", key: "uploads/file.mp3" } },
    });
    mockPost.mockResolvedValueOnce({ data: { data: { mediaId: "m1", state: "pending" } } });

    const cb = getToolCallback(server, "upload_local_file");
    const result = await cb({ filePath: "/tmp/test.mp3", name: "Test Audio", folderId: "f1" });

    expect(mockGet).toHaveBeenCalledWith("/v1/media/upload/signedurl", {
      params: { mediaType: "audio", filename: "test.mp3", mimeType: "audio/mpeg" },
    });
    expect(axios.put).toHaveBeenCalledWith("https://s3.aws.com/upload/test.mp3?sig=xxx", Buffer.from("fake-audio"), expect.objectContaining({
      headers: { "Content-Type": "audio/mpeg" },
    }));
    expect(mockPost).toHaveBeenCalledWith("/v1/media/upload", {
      name: "Test Audio",
      url: "https://s3.aws.com/upload/test.mp3",
      mediaType: "audio",
      folderId: "f1",
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toMatchObject({ mediaId: "m1", state: "pending" });
  });

  it("upload_local_file stops before uploading when no signed URL comes back", async () => {
    const fs = await import("fs");
    const axios = (await import("axios")).default as any;
    (fs.existsSync as any).mockReturnValue(true);
    mockGet.mockResolvedValueOnce({ data: { data: {} } });

    const result = await getToolCallback(server, "upload_local_file")({ filePath: "/tmp/test.mp3" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Could not get signed upload URL");
    expect(axios.put).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe("Billing tools", () => {
  it("get_billing_status calls GET /v1/subscription/billing-status and returns the reply", async () => {
    vi.resetAllMocks();
    const status = { status: "success", data: { plan: "pro", creditsRemaining: 40, canManageBilling: true } };
    mockGet.mockResolvedValue({ data: status });
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/billing.js");
    register(server, mockClient);

    const result = await getToolCallback(server, "get_billing_status")({});

    expect(mockGet).toHaveBeenCalledWith("/v1/subscription/billing-status");
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.data).toEqual(status);
  });
});

describe("build_automation workflow", () => {
  let server: McpServer;

  const FOLDERS = { status: "success", data: { folderList: [{ folderId: "fld1", name: "Sales Calls" }] } };
  const FIELDS = {
    status: "success",
    data: [
      { id: "fldA", name: "Customer Name" },
      { id: "fldB", name: "Deal Stage" },
    ],
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockPut.mockResolvedValue({ data: { data: {} } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/workflows.js");
    register(server, mockClient, { automations: true, voiceTestRunDetails: true });
  });

  it("resolves folder/field names, converts payload shorthand, and assembles the wire body", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/folder") return Promise.resolve({ data: FOLDERS });
      if (url === "/v1/fields") return Promise.resolve({ data: FIELDS });
      return Promise.resolve({ data: { data: {} } });
    });
    mockPost.mockResolvedValueOnce({ data: { status: "success", data: { automationId: "a1" } } });

    const cb = getToolCallback(server, "build_automation");
    const result = await cb({
      name: "Friendly build",
      trigger: { on: "media_analyzed", folders: ["Sales Calls"] },
      steps: [
        { do: "filter", rules: [{ field: "name", op: "contains", value: "Acme" }] },
        { do: "ai_chat", prompt: "Summarize", saveToFields: ["Customer Name"] },
        { do: "notify", message: "Done: payload.name" },
      ],
    });

    expect(result.isError).toBeUndefined();
    const body = mockPost.mock.calls.find((c: any[]) => c[0] === "/v1/automations/")?.[1];
    expect(body.trigger).toEqual({
      type: "folders",
      provider: "speak",
      app: "speak",
      triggerSlug: "media_analyzed",
      folderIds: ["fld1"],
    });
    expect(body.steps[0]).toMatchObject({ stepType: "filter", filter: { logic: "AND" } });
    expect(body.steps[1].magicPrompt.fieldIds).toEqual(["fldA"]);
    expect(body.steps[2].notify.message).toBe("Done: payload.name"); // literal — not payload-prefixed shorthand form
  });

  it("creates a missing folder and reports it", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/folder") return Promise.resolve({ data: FOLDERS });
      return Promise.resolve({ data: { data: {} } });
    });
    mockPost.mockImplementation((url: string) => {
      if (url === "/v1/folder") return Promise.resolve({ data: { status: "success", data: { folderId: "fldNew" } } });
      return Promise.resolve({ data: { status: "success", data: { automationId: "a2" } } });
    });

    const cb = getToolCallback(server, "build_automation");
    const result = await cb({
      name: "New folder build",
      trigger: { on: "media_analyzed", folders: ["Webhook Inbox"] },
      steps: [{ do: "translate", language: "fr-FR" }],
    });

    expect(result.isError).toBeUndefined();
    expect(mockPost).toHaveBeenCalledWith("/v1/folder", { name: "Webhook Inbox" });
    expect(result.content[0].text).toContain("Webhook Inbox (fldNew)");
  });

  it("builds a webhook automation with token shorthand, dynamic routing, and enrichment", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/fields") return Promise.resolve({ data: FIELDS });
      if (url === "/v1/automations/a3") {
        return Promise.resolve({ data: { status: "success", data: { trigger: { webhookId: "wh1", childKey: "data" } } } });
      }
      if (url === "/v1/webhook/wh1") {
        return Promise.resolve({
          data: {
            status: "success",
            data: { webhookData: { inboundUrl: "https://api.test/v1/webhook/in/tok", samplePayload: { x: 1 }, flattenedPaths: ["data.url"] } },
          },
        });
      }
      return Promise.resolve({ data: { data: {} } });
    });
    mockPost.mockResolvedValueOnce({ data: { status: "success", data: { automationId: "a3" } } });

    const cb = getToolCallback(server, "build_automation");
    const result = await cb({
      name: "Webhook build",
      trigger: { on: "inbound_webhook", childKey: "data" },
      steps: [
        {
          do: "upload",
          source: "payload.url",
          name: "payload.name",
          folderFromPayload: "payload.clinic",
          mapFields: { "Deal Stage": "payload.stage" },
        },
      ],
    });

    expect(result.isError).toBeUndefined();
    const body = mockPost.mock.calls.find((c: any[]) => c[0] === "/v1/automations/")?.[1];
    expect(body.trigger).toEqual({
      type: "folders",
      provider: "speak",
      app: "speak",
      triggerSlug: "inbound_webhook",
      folderIds: [],
      childKey: "data",
    });
    expect(body.steps[0].speakUpload.waitForProcessing).toBe(true);
    expect(body.steps[0].speakUpload.sourceUrl).toBe("{{trigger.payload.url}}");
    expect(body.steps[0].speakUpload.folderRouting).toEqual({
      mode: "dynamic",
      sourceKey: "{{trigger.payload.clinic}}",
      onNoMatch: "create",
    });
    expect(body.steps[0].speakUpload.fieldsMap).toEqual({ fldB: "{{trigger.payload.stage}}" });
    expect(result.content[0].text).toContain("https://api.test/v1/webhook/in/tok");
  });

  it("supports branch + runWhen wiring and field_updated triggers with Or-triggers", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/folder") return Promise.resolve({ data: FOLDERS });
      if (url === "/v1/fields") return Promise.resolve({ data: FIELDS });
      return Promise.resolve({ data: { data: {} } });
    });
    mockPost.mockResolvedValueOnce({ data: { status: "success", data: { automationId: "a4" } } });

    const cb = getToolCallback(server, "build_automation");
    const result = await cb({
      name: "Branchy",
      trigger: { on: "field_updated", watchFields: [{ field: "Deal Stage", values: ["Closed"] }], matchLogic: "AND" },
      orTriggers: [{ on: "media_analyzed", folders: ["Sales Calls"] }],
      steps: [
        { do: "branch", rules: [{ field: "name", op: "contains", value: "Acme" }] },
        { do: "notify", message: "Acme deal closed", runWhen: "true" },
      ],
    });

    expect(result.isError).toBeUndefined();
    const body = mockPost.mock.calls.find((c: any[]) => c[0] === "/v1/automations/")?.[1];
    expect(body.trigger).toMatchObject({
      triggerSlug: "field_updated",
      values: ["fldB"],
      fieldValueMatches: [{ fieldId: "fldB", values: ["Closed"] }],
      fieldMatchLogic: "AND",
    });
    expect(body.triggers).toEqual([
      { type: "folders", provider: "speak", app: "speak", triggerSlug: "media_analyzed", folderIds: ["fld1"] },
    ]);
    expect(body.steps[1]).toMatchObject({ branch: "true", dependsOn: ["s1"], stepType: "notify" });
  });

  it("refuses a filter before any upload (nothing has produced media for it to read)", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/folder") return Promise.resolve({ data: FOLDERS });
      if (url === "/v1/fields") return Promise.resolve({ data: FIELDS });
      return Promise.resolve({ data: { data: {} } });
    });

    const cb = getToolCallback(server, "build_automation");
    const result = await cb({
      name: "Filter before upload",
      trigger: { on: "inbound_webhook" },
      steps: [
        { do: "filter", rules: [{ field: "status", op: "eq", value: "completed" }] },
        { do: "upload", source: "payload.url", folder: "Sales Calls" },
      ],
    });

    // The server stores this happily; the runner then fails the step with
    // "Media not found for filter evaluation" because no executor reads the payload.
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("nothing has produced a media item yet");
    expect(result.content[0].text).toContain("fieldsMap");
    expect(mockPost).not.toHaveBeenCalledWith("/v1/automations/", expect.anything());
  });

  it("resolves a custom-field NAME to its id once media is flowing", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/folder") return Promise.resolve({ data: FOLDERS });
      if (url === "/v1/fields") return Promise.resolve({ data: FIELDS });
      return Promise.resolve({ data: { data: {} } });
    });
    mockPost.mockResolvedValueOnce({ data: { status: "success", data: { automationId: "a6" } } });

    const cb = getToolCallback(server, "build_automation");
    const result = await cb({
      name: "Flow-aware filters",
      trigger: { on: "inbound_webhook" },
      steps: [
        { do: "upload", source: "payload.url", folder: "Sales Calls" },
        { do: "filter", rules: [{ field: "Deal Stage", op: "eq", value: "Closed" }] },
      ],
    });

    expect(result.isError).toBeUndefined();
    const body = mockPost.mock.calls.find((c: any[]) => c[0] === "/v1/automations/")?.[1];
    expect(body.steps[1].filter.rules[0].field).toBe("fldB");
  });

  it("compiles a nested branch into a single-entry DAG the save gate accepts", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/folder") return Promise.resolve({ data: FOLDERS });
      if (url === "/v1/fields") return Promise.resolve({ data: FIELDS });
      return Promise.resolve({ data: { data: {} } });
    });
    mockPost.mockResolvedValueOnce({ data: { status: "success", data: { automationId: "a7" } } });

    const cb = getToolCallback(server, "build_automation");
    const result = await cb({
      name: "Escalate long calls",
      trigger: { on: "media_analyzed", folders: ["Sales Calls"] },
      steps: [
        {
          do: "branch",
          rules: [{ field: "duration", op: "gt", value: 600 }],
          then: [
            { do: "ai_chat", prompt: "Summarise the escalation" },
            { do: "notify", message: "Long call escalated" },
          ],
          otherwise: [],
        },
        // A merge must accept what BOTH legs hand it: the "then" leg ends in a notify
        // (which outputs DATA), so a translation here would be rejected — correctly.
        { do: "notify", message: "Call processed" },
      ],
    });

    expect(result.isError).toBeUndefined();
    const body = mockPost.mock.calls.find((c: any[]) => c[0] === "/v1/automations/")?.[1];
    const byId = Object.fromEntries(body.steps.map((s: any) => [s.stepId, s]));

    // Exactly one entry point: a second would run on both branches and the server refuses it.
    expect(body.steps.filter((s: any) => !(s.dependsOn ?? []).length)).toHaveLength(1);
    // The leg is a chain, not a fan off the condition.
    expect(byId.s2.dependsOn).toEqual(["s1"]);
    expect(byId.s3.dependsOn).toEqual(["s2"]);
    expect(byId.s2.branch).toBe("true");
    expect(byId.s3.branch).toBe("true");
    // The merge waits on the leg tail and on the condition (the empty "otherwise" side).
    expect(byId.s4.dependsOn).toEqual(["s3", "s1"]);
  });

  it("folds the legacy flat runWhen form into the same graph", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/folder") return Promise.resolve({ data: FOLDERS });
      if (url === "/v1/fields") return Promise.resolve({ data: FIELDS });
      return Promise.resolve({ data: { data: {} } });
    });
    mockPost.mockResolvedValueOnce({ data: { status: "success", data: { automationId: "a8" } } });

    const cb = getToolCallback(server, "build_automation");
    const result = await cb({
      name: "Legacy shape",
      trigger: { on: "media_analyzed", folders: ["Sales Calls"] },
      steps: [
        { do: "branch", rules: [{ field: "duration", op: "gt", value: 600 }] },
        { do: "notify", message: "long", runWhen: "true" },
        { do: "notify", message: "short", runWhen: "false" },
      ],
    });

    expect(result.isError).toBeUndefined();
    const body = mockPost.mock.calls.find((c: any[]) => c[0] === "/v1/automations/")?.[1];
    const byId = Object.fromEntries(body.steps.map((s: any) => [s.stepId, s]));
    expect(byId.s2.branch).toBe("true");
    expect(byId.s3.branch).toBe("false");
    expect(byId.s2.dependsOn).toEqual(["s1"]);
    expect(byId.s3.dependsOn).toEqual(["s1"]);
  });

  it("rejects an unknown folder id instead of creating a folder named after it", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/folder") return Promise.resolve({ data: FOLDERS });
      return Promise.resolve({ data: { data: {} } });
    });
    const cb = getToolCallback(server, "build_automation");
    const result = await cb({
      name: "Typo id",
      trigger: { on: "media_analyzed", folders: ["aaaabbbbcccc"] },
      steps: [{ do: "translate", language: "fr-FR" }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Folder id "aaaabbbbcccc" not found');
    expect(mockPost).not.toHaveBeenCalledWith("/v1/folder", expect.anything());
  });

  it("updates via PUT when automationId is given", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/folder") return Promise.resolve({ data: FOLDERS });
      return Promise.resolve({ data: { data: {} } });
    });
    mockPut.mockResolvedValueOnce({ data: { status: "success", data: { automationId: "a5" } } });

    const cb = getToolCallback(server, "build_automation");
    const result = await cb({
      automationId: "a5",
      name: "Updated build",
      trigger: { on: "media_analyzed", folders: ["fld1"] },
      steps: [{ do: "translate", language: "es-ES" }],
    });

    expect(result.isError).toBeUndefined();
    expect(mockPut).toHaveBeenCalledWith("/v1/automations/a5", expect.objectContaining({ name: "Updated build" }));
  });

  it("returns a helpful error for unknown fields and unknown step types", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/v1/fields") return Promise.resolve({ data: FIELDS });
      return Promise.resolve({ data: { data: {} } });
    });
    const cb = getToolCallback(server, "build_automation");

    const badField = await cb({
      name: "x",
      trigger: { on: "field_updated", watchFields: [{ field: "Nope" }] },
      steps: [{ do: "translate", language: "es-ES" }],
    });
    expect(badField.isError).toBe(true);
    expect(badField.content[0].text).toContain('Unknown custom field "Nope"');
    expect(badField.content[0].text).toContain("Customer Name");

    const badStep = await cb({
      name: "x",
      trigger: { on: "inbound_webhook" },
      steps: [{ do: "teleport" }],
    });
    expect(badStep.isError).toBe(true);
    expect(badStep.content[0].text).toContain('unknown `do`: "teleport"');
  });
});
