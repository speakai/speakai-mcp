import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Create a mock axios instance that tracks calls
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

function getToolCallback(server: McpServer, toolName: string): Function {
  const tools = (server as any)._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not registered`);
  return (params: any) => tool.handler(params, {});
}

describe("Tools Integration Tests", () => {
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
  });

  describe("Media tools", () => {
    it("upload_media calls POST /v1/media/upload", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "upload_media");
      await callback({
        name: "Test Recording",
        url: "https://example.com/test.mp3",
        mediaType: "audio",
      });

      expect(mockPost).toHaveBeenCalledWith("/v1/media/upload", {
        name: "Test Recording",
        url: "https://example.com/test.mp3",
        mediaType: "audio",
      });
    });

    it("list_media calls GET /v1/media with params", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "list_media");
      await callback({ mediaType: "audio", page: 1, pageSize: 10 });

      expect(mockGet).toHaveBeenCalledWith("/v1/media", {
        params: { mediaType: "audio", page: 1, pageSize: 10 },
      });
    });

    it("get_transcript calls GET /v1/media/transcript/:id", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "get_transcript");
      await callback({ mediaId: "abc123" });

      expect(mockGet).toHaveBeenCalledWith("/v1/media/transcript/abc123");
    });

    it("delete_media calls DELETE /v1/media/:id", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "delete_media");
      await callback({ mediaId: "abc123" });

      expect(mockDelete).toHaveBeenCalledWith("/v1/media/abc123");
    });

    it("set_media_thumbnail sends a link, sniffed image bytes, or a frame time it waits for", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });
      const callback = getToolCallback(server, "set_media_thumbnail");

      await callback({ mediaId: "abc123", imageUrl: "https://example.com/a.png" });
      expect(mockPut).toHaveBeenCalledWith("/v1/media/abc123/thumbnail", { url: "https://example.com/a.png" });

      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
      await callback({ mediaId: "abc123", imageBase64: `data:image/jpeg;base64,${png.toString("base64")}` });
      const [path, form, config] = mockPut.mock.calls[1];
      expect(path).toBe("/v1/media/abc123/thumbnail");
      expect(config).toEqual({ headers: { "Content-Type": "multipart/form-data" } });
      const image = (form as FormData).get("image") as File;
      expect(image.type).toBe("image/png");
      expect(image.name).toBe("thumbnail.png");
      expect(Buffer.from(await image.arrayBuffer())).toEqual(png);

      vi.useFakeTimers();
      mockGet
        .mockResolvedValueOnce({ data: { data: { thumbnail: { pending: true } } } })
        .mockResolvedValueOnce({ data: { data: { thumbnail: { url: "https://cdn/x.jpg", source: "custom" } } } });
      const pending = callback({ mediaId: "abc123", atSeconds: 12.5 });
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await pending;
      expect(mockPut).toHaveBeenLastCalledWith("/v1/media/abc123/thumbnail", { seekSec: 12.5 });
      expect(mockGet).toHaveBeenCalledWith("/v1/media/status/abc123");
      expect(result.structuredContent.data).toEqual({ thumbnail: { url: "https://cdn/x.jpg", source: "custom" } });
    });

    it("get_media_status calls GET /v1/media/status/:id", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "get_media_status");
      await callback({ mediaId: "abc123" });

      expect(mockGet).toHaveBeenCalledWith("/v1/media/status/abc123");
    });
  });

  describe("Prompt/Chat tools", () => {
    it("ask_ai_chat calls POST /v1/prompt with all params", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient, { aiChat: true, automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "ask_ai_chat");
      await callback({
        prompt: "What were the action items?",
        mediaIds: ["id1", "id2"],
        assistantType: "researcher",
      });

      expect(mockPost).toHaveBeenCalledWith("/v1/prompt", {
        prompt: "What were the action items?",
        mediaIds: ["id1", "id2"],
        assistantType: "researcher",
      });
    });

    it("ask_ai_chat works without mediaIds (workspace-wide)", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient, { aiChat: true, automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "ask_ai_chat");
      await callback({ prompt: "What themes appear across all interviews?" });

      expect(mockPost).toHaveBeenCalledWith("/v1/prompt", {
        prompt: "What themes appear across all interviews?",
      });
    });

    it("get_chat_history calls GET /v1/prompt/history", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient, { aiChat: true, automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "get_chat_history");
      await callback({ limit: 5 });

      expect(mockGet).toHaveBeenCalledWith("/v1/prompt/history", {
        params: { limit: 5 },
      });
    });

    it("list_prompts calls GET /v1/prompt", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient, { aiChat: true, automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "list_prompts");
      await callback({});

      expect(mockGet).toHaveBeenCalledWith("/v1/prompt");
    });
  });

  describe("Search tools", () => {
    it("search_media calls POST /v1/analytics/search", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-25T12:34:56.789Z"));
      const { register } = await import("../src/tools/analytics.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "search_media");
      await callback({ query: "pricing concerns", startDate: "2026-01-01" });

      expect(mockPost).toHaveBeenCalledWith("/v1/analytics/search", {
        query: "pricing concerns",
        startDate: "2026-01-01",
        endDate: "2026-04-25T12:34:56.789Z",
      });
    });
  });

  describe("Clips tools", () => {
    it("create_clip calls POST /v1/clips", async () => {
      const { register } = await import("../src/tools/clips.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "create_clip");
      await callback({
        title: "Key Moment",
        mediaType: "audio",
        timeRanges: [{ mediaId: "abc", startTime: 60, endTime: 90 }],
      });

      expect(mockPost).toHaveBeenCalledWith("/v1/clips", {
        title: "Key Moment",
        mediaType: "audio",
        timeRanges: [{ mediaId: "abc", startTime: 60, endTime: 90 }],
      });
    });

    it("delete_clip calls DELETE /v1/clips/:id", async () => {
      const { register } = await import("../src/tools/clips.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "delete_clip");
      await callback({ clipId: "clip123" });

      expect(mockDelete).toHaveBeenCalledWith("/v1/clips/clip123");
    });
  });

  describe("Error handling", () => {
    it("returns isError true when API call fails", async () => {
      mockGet.mockRejectedValueOnce(new Error("Network error"));

      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "get_transcript");
      const result = await callback({ mediaId: "bad-id" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error");
    });

    it("returns formatted JSON on success", async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: { mediaId: "abc", state: "processed" } },
      });

      const { register } = await import("../src/tools/media.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "get_media_status");
      const result = await callback({ mediaId: "abc" });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].type).toBe("text");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.mediaId).toBe("abc");
    });
  });

  describe("User-group tools", () => {
    async function reg() {
      const { register } = await import("../src/tools/users.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });
    }

    it("list_users calls GET /v1/admin/users with params", async () => {
      await reg();
      await getToolCallback(server, "list_users")({ filterName: "jane", page: 0 });
      expect(mockGet).toHaveBeenCalledWith("/v1/admin/users", { params: { filterName: "jane", page: 0 } });
    });

    it("list_user_groups calls GET /v1/admin/usergroup", async () => {
      await reg();
      await getToolCallback(server, "list_user_groups")({});
      expect(mockGet).toHaveBeenCalledWith("/v1/admin/usergroup");
    });

    it("create_user_group calls POST /v1/admin/usergroup with {description, users}", async () => {
      await reg();
      await getToolCallback(server, "create_user_group")({ description: "Engineering", users: ["u1", "u2"] });
      expect(mockPost).toHaveBeenCalledWith("/v1/admin/usergroup", {
        description: "Engineering",
        users: ["u1", "u2"],
      });
    });

    it("update_user_group calls PUT /v1/admin/usergroup with {_id, description, users}", async () => {
      await reg();
      await getToolCallback(server, "update_user_group")({ _id: "g1", description: "Eng", users: ["u1"] });
      expect(mockPut).toHaveBeenCalledWith("/v1/admin/usergroup", { _id: "g1", description: "Eng", users: ["u1"] });
    });

    it("delete_user_group calls DELETE /v1/admin/usergroup/:id", async () => {
      await reg();
      await getToolCallback(server, "delete_user_group")({ id: "g1" });
      expect(mockDelete).toHaveBeenCalledWith("/v1/admin/usergroup/g1");
    });
  });

  describe("Dashboard tools", () => {
    async function reg() {
      const { register } = await import("../src/tools/dashboards.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });
    }

    it("list_dashboards calls GET /v1/dashboards", async () => {
      await reg();
      await getToolCallback(server, "list_dashboards")({});
      expect(mockGet).toHaveBeenCalledWith("/v1/dashboards");
    });

    it("get_dashboard calls GET /v1/dashboards/:id", async () => {
      await reg();
      await getToolCallback(server, "get_dashboard")({ dashboardId: "d1" });
      expect(mockGet).toHaveBeenCalledWith("/v1/dashboards/d1");
    });

    it("create_dashboard posts the spec envelope with defaults when only title is given", async () => {
      await reg();
      await getToolCallback(server, "create_dashboard")({ title: "My Dashboard" });
      expect(mockPost).toHaveBeenCalledWith("/v1/dashboards", {
        spec: {
          title: "My Dashboard",
          source: { type: "workspace" },
          dateRange: { preset: "last30days" },
          sections: [],
          widgets: [],
        },
      });
    });

    it("create_dashboard expands a widget spec into a full {id,type,config,layout} widget", async () => {
      await reg();
      await getToolCallback(server, "create_dashboard")({
        title: "D",
        source: { type: "folders", folderIds: ["f1"] },
        dateRange: { preset: "last7days" },
        widgets: [{ type: "metric-chart" }],
      });
      const body = mockPost.mock.calls.at(-1)![1] as any;
      expect(body.spec.source).toEqual({ type: "folders", folderIds: ["f1"] });
      expect(body.spec.dateRange).toEqual({ preset: "last7days" });
      expect(body.spec.widgets).toHaveLength(1);
      expect(body.spec.widgets[0]).toMatchObject({
        type: "metric-chart",
        config: { mark: "bar", metric: { kind: "builtin", name: "mediaCount" } },
        layout: { x: 0, y: 0, w: 6, h: 4 },
      });
      // The layout schema is strict {x,y,w,h} — render-only minW/minH must not travel.
      expect(body.spec.widgets[0].layout).not.toHaveProperty("minW");
      expect(typeof body.spec.widgets[0].id).toBe("string");
    });

    it("create_dashboard carries sections and lays each section out from y=0", async () => {
      await reg();
      await getToolCallback(server, "create_dashboard")({
        title: "D",
        widgets: [
          { id: "w-a", type: "themes" },
          { id: "w-b", type: "people" },
        ],
        sections: [
          { id: "s-a", title: "A", icon: "star", widgetIds: ["w-a"] },
          { id: "s-b", title: "B", icon: "globe", widgetIds: ["w-b"] },
        ],
      });
      const body = mockPost.mock.calls.at(-1)![1] as any;
      expect(body.spec.sections).toHaveLength(2);
      expect(body.spec.widgets.map((w: any) => w.layout)).toEqual([
        { x: 0, y: 0, w: 6, h: 4 },
        { x: 0, y: 0, w: 6, h: 4 },
      ]);
    });

    it("create_dashboard rejects sections referencing unknown widget ids without calling the API", async () => {
      await reg();
      const result = await getToolCallback(server, "create_dashboard")({
        title: "D",
        widgets: [{ type: "themes" }],
        sections: [{ id: "s", title: "S", icon: "star", widgetIds: ["missing"] }],
      });
      expect(result.isError).toBe(true);
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("create_dashboard rejects field-distribution without config before calling the API", async () => {
      await reg();
      const result = await getToolCallback(server, "create_dashboard")({
        title: "D",
        widgets: [{ type: "field-distribution" }],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("fieldName");
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("update_dashboard sends metadata-only updates without a spec", async () => {
      await reg();
      await getToolCallback(server, "update_dashboard")({ dashboardId: "d1", isDefault: true });
      expect(mockPut).toHaveBeenCalledWith("/v1/dashboards/d1", { isDefault: true });
    });

    it("update_dashboard validates and sends reviewer, labels and comments settings", async () => {
      await reg();
      const settings = {
        labels: { isEnabled: true, mode: "apply", labelGroupIds: ["grp_1"] },
        comments: { isEnabled: true, mode: "reply" },
      };
      const schema = (server as any)._registeredTools.update_dashboard.inputSchema;
      expect(schema.safeParse({ dashboardId: "d1", settings }).success).toBe(true);
      expect(
        schema.safeParse({ dashboardId: "d1", settings: { ...settings, comments: { isEnabled: true, mode: "edit" } } })
          .success,
      ).toBe(false);
      // Reviewers are the feedback submitter names; a stale reviewerUserIds or reviewerNames is never sent.
      const legacy = schema.parse({
        dashboardId: "d1",
        settings: { reviewerUserIds: ["64b7f0c2a1b2c3d4e5f60718"], reviewerNames: ["Reviewer A"] },
      });
      expect(legacy.settings).toEqual({});

      await getToolCallback(server, "update_dashboard")({ dashboardId: "d1", settings });
      expect(mockPut).toHaveBeenCalledWith("/v1/dashboards/d1", { settings });
    });

    it("update_dashboard accepts only include filterList rules with values", async () => {
      await reg();
      const schema = (server as any)._registeredTools.update_dashboard.inputSchema;
      const rule = { fieldName: "be5d4bfc7e0e", fieldOperator: "include", fieldValue: ["Yes"] };
      const parse = (r: Record<string, unknown>) => schema.safeParse({ dashboardId: "d1", filters: { filterList: [r] } }).success;
      expect(parse(rule)).toBe(true);
      expect(parse({ ...rule, fieldOperator: "notInclude" })).toBe(false);
      expect(parse({ ...rule, fieldValue: [] })).toBe(false);
      expect(parse({ fieldName: "be5d4bfc7e0e" })).toBe(false);
    });

    it("update_dashboard keeps settings.fieldEdits through schema parsing and sends it", async () => {
      await reg();
      const settings = { fieldEdits: { fieldIds: ["f1", "f2"] } };
      const schema = (server as any)._registeredTools["update_dashboard"].inputSchema;
      const parsed = schema.parse({ dashboardId: "d1", settings });
      expect(parsed.settings).toEqual(settings);
      expect(schema.safeParse({ dashboardId: "d1", settings: { fieldEdits: { fieldIds: Array(51).fill("f") } } }).success).toBe(false);
      await getToolCallback(server, "update_dashboard")(parsed);
      expect(mockPut).toHaveBeenCalledWith("/v1/dashboards/d1", { settings });
    });

    it("settings.profiles accepts valid groups, sends them unchanged and documents imageColumn", async () => {
      await reg();
      const schema = (server as any)._registeredTools["update_dashboard"].inputSchema;
      const profiles = [
        {
          fieldId: "be5d4bfc7e0e",
          label: "Speakers",
          imageShape: "round",
          entries: [
            { name: "Ada Lovelace", description: "Plain text.", link: "https://example.org/ada" },
            { id: "p2", name: "Sam", imageKey: "s3://bucket/k.png" },
          ],
        },
        { fieldId: "c0ffee000001", label: "Products", imageShape: "square", entries: [{ name: "Kit" }] },
      ];
      const withoutRevision = await getToolCallback(server, "update_dashboard")(
        schema.parse({ dashboardId: "d1", settings: { profiles } }),
      );
      expect(withoutRevision.isError).toBe(true);
      expect(withoutRevision.content[0].text).toContain("revision");
      expect(mockPut).not.toHaveBeenCalled();
      const parsed = schema.parse({ dashboardId: "d1", settings: { profiles }, revision: 4 });
      expect(parsed.settings).toEqual({ profiles });
      await getToolCallback(server, "update_dashboard")(parsed);
      expect(mockPut).toHaveBeenCalledWith("/v1/dashboards/d1", { settings: { profiles }, revision: 4 });
      const group = (entries: unknown[], extra: Record<string, unknown> = {}) => ({
        fieldId: "be5d4bfc7e0e",
        label: "Speakers",
        entries,
        ...extra,
      });
      const okGroups = (groups: unknown[]) =>
        schema.safeParse({ dashboardId: "d1", settings: { profiles: groups } }).success;
      const ok = (entries: unknown[]) => okGroups([group(entries)]);
      expect(ok([{ name: "A", description: "x".repeat(600) }])).toBe(true);
      expect(ok([{ name: "A", description: "x".repeat(601) }])).toBe(false);
      expect(ok([{ name: "" }])).toBe(false);
      expect(ok([{ name: "x".repeat(81) }])).toBe(false);
      expect(ok(Array.from({ length: 60 }, (_, i) => ({ name: `n${i}` })))).toBe(true);
      expect(ok(Array.from({ length: 61 }, (_, i) => ({ name: `n${i}` })))).toBe(false);
      expect(ok([{ name: "   " }])).toBe(false);
      expect(ok([{ id: "ada-lovelace", name: "A" }])).toBe(true);
      expect(ok([{ id: "Not A Slug", name: "A" }])).toBe(false);
      expect(ok([{ id: "x".repeat(65), name: "A" }])).toBe(false);
      expect(ok([{ name: "A", imageKey: "s3://b/" + "k".repeat(1024) }])).toBe(false);
      expect(ok([{ name: "A", link: "javascript:alert(1)" }])).toBe(false);
      expect(okGroups([group([]), group([])])).toBe(false);
      expect(okGroups([group([], { label: "" })])).toBe(false);
      expect(okGroups([group([], { imageShape: "hexagon" })])).toBe(false);
      expect(
        okGroups(Array.from({ length: 6 }, (_, i) => group([], { fieldId: `f${String(i).padStart(11, "0")}` }))),
      ).toBe(false);
      const trimmed = schema.parse({
        dashboardId: "d1",
        settings: { profiles: [group([{ name: "  Ada  ", imageUrl: "https://x.example/a.png" }])] },
      });
      expect(trimmed.settings.profiles[0].entries).toEqual([{ name: "Ada" }]);
      const table = JSON.parse((await getToolCallback(server, "list_dashboard_widgets")({})).content[0].text)
        .widgets.find((w: any) => w.type === "table").config;
      expect(table).toContain("imageColumn");
      const desc = (server as any)._registeredTools["update_dashboard"].description;
      expect(desc).toContain("settings.profiles does not move media pages");
      expect(desc).toContain("/v1/dashboards/:dashboardId/profile-image");
      expect(desc).toContain("PUBLIC");
    });

    it("update_dashboard sends the full spec with the revision for optimistic concurrency", async () => {
      await reg();
      await getToolCallback(server, "update_dashboard")({
        dashboardId: "d1",
        title: "X",
        revision: 3,
        widgets: [{ type: "notes", config: { content: "hi" } }],
      });
      const body = mockPut.mock.calls.at(-1)![1] as any;
      expect(body.spec).toMatchObject({
        title: "X",
        revision: 3,
      });
      expect(body.spec).not.toHaveProperty("schemaVersion");
      expect(body.spec.widgets[0]).toMatchObject({ type: "notes", config: { content: "hi" } });
    });

    it("update_dashboard rejects spec fields without a revision", async () => {
      await reg();
      const result = await getToolCallback(server, "update_dashboard")({ dashboardId: "d1", title: "X" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("revision");
      expect(mockPut).not.toHaveBeenCalled();
    });

    it("delete_dashboard calls DELETE /v1/dashboards/:id", async () => {
      await reg();
      await getToolCallback(server, "delete_dashboard")({ dashboardId: "d1" });
      expect(mockDelete).toHaveBeenCalledWith("/v1/dashboards/d1");
    });

    it("duplicate_dashboard calls POST /v1/dashboards/:id/duplicate with empty body", async () => {
      await reg();
      await getToolCallback(server, "duplicate_dashboard")({ dashboardId: "d1" });
      expect(mockPost).toHaveBeenCalledWith("/v1/dashboards/d1/duplicate", {});
    });

    it("share_dashboard calls PUT /v1/dashboards/:id/share with empty body", async () => {
      await reg();
      await getToolCallback(server, "share_dashboard")({ dashboardId: "d1" });
      expect(mockPut).toHaveBeenCalledWith("/v1/dashboards/d1/share", {});
    });

    it("get_dashboard_speakers_insight calls POST /v1/dashboards/insights/speakers", async () => {
      await reg();
      await getToolCallback(server, "get_dashboard_speakers_insight")({ folderScope: ["f1"] });
      expect(mockPost).toHaveBeenCalledWith("/v1/dashboards/insights/speakers", { folderScope: ["f1"] });
    });

    it("list_dashboard_widgets documents session cards and notes actions", async () => {
      await reg();
      const result = await getToolCallback(server, "list_dashboard_widgets")({});
      const data = JSON.parse(result.content[0].text);
      const table = data.widgets.find((w: any) => w.type === "table").config;
      const notes = data.widgets.find((w: any) => w.type === "notes").config;
      for (const key of ["display", "cards", "card?:", "titleColumn", "subtitleColumns", "detailColumns", "showDuration", "openMedia", "layout", "rowBy", "rowOrder", "hero", "snap-scroll", "each 1-80 chars", "first page only"]) {
        expect(table).toContain(key);
      }
      for (const key of ["actions", "openChat", "goToSection", "sectionId", "isPromptAsk", "max 3"]) {
        expect(notes).toContain(key);
      }
      expect(JSON.stringify(data)).toContain("1-250");
    });

    it("dashboard folder source accepts 250 folder ids and rejects 251", async () => {
      const { sourceInputSchema, MAX_DASHBOARD_SOURCE_FOLDERS } = await import("../src/tools/dashboards.js");
      const ids = (n: number) => Array.from({ length: n }, (_, i) => `f${i}`);
      expect(MAX_DASHBOARD_SOURCE_FOLDERS).toBe(250);
      expect(sourceInputSchema.safeParse({ type: "folders", folderIds: ids(250) }).success).toBe(true);
      expect(sourceInputSchema.safeParse({ type: "folders", folderIds: ids(251) }).success).toBe(false);
    });

    it("create_dashboard passes a cards table and a notes action through unchanged", async () => {
      await reg();
      const table = {
        rowsAre: "records",
        rowClick: "openMedia",
        display: "cards",
        columns: [{ header: "Session", field: "Title" }, { header: "Speaker", field: "Speaker" }],
        card: { titleColumn: "Session", subtitleColumns: ["Speaker"], showDuration: true },
      };
      const notes = { content: "Start here", actions: [{ label: "Ask", action: "openChat" }] };
      await getToolCallback(server, "create_dashboard")({
        title: "D",
        widgets: [{ type: "table", id: "t", config: table }, { type: "notes", id: "n", config: notes }],
      });
      const body = mockPost.mock.calls.at(-1)![1] as any;
      expect(body.spec.widgets[0].config).toEqual(table);
      expect(body.spec.widgets[1].config).toEqual(notes);
    });

    it("list_dashboard_widgets returns the widget catalog and design rules (no API call)", async () => {
      await reg();
      const result = await getToolCallback(server, "list_dashboard_widgets")({});
      const data = JSON.parse(result.content[0].text);
      const types = data.widgets.map((w: any) => w.type);
      expect(types).toEqual(
        expect.arrayContaining([
          "narrative",
          "stat-cards",
          "metric-chart",
          "table",
          "comparison",
          "field-distribution",
          "sentiment-trend",
          "themes",
          "people",
          "team-activity",
          "notes",
        ]),
      );
      // Widget types removed from the spec must not reappear in the catalog.
      expect(types).not.toContain("sentiment");
      expect(types).not.toContain("media-list");
      expect(types).not.toContain("upload-timeline");
      expect(types).not.toContain("kpi-trend");
      expect(types).not.toContain("field-metric");
      expect(types).not.toContain("metric-group");
      expect(data.vocabulary.dateRangePresets).toEqual([
        "last7days",
        "last30days",
        "last3months",
        "yearToDate",
        "allTime",
      ]);
      expect(data.examples.length).toBeGreaterThanOrEqual(1);
      expect(data.designRules.join(" ")).toContain("narrative");
      expect(data.designRules.join(" ")).toContain("every widget earns its place");
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe("Voice agent tools", () => {
    it("update_voice_agent forwards chatSettings to PUT /v1/voice/agents/:id unmodified", async () => {
      const { register } = await import("../src/tools/voice.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "update_voice_agent");
      await callback({
        agentId: "agent-1",
        chatSettings: {
          welcomeMessage: "New welcome",
          maxResponseLength: 40,
          responsePace: "normal",
        },
      });

      expect(mockPut).toHaveBeenCalledWith("/v1/voice/agents/agent-1", {
        chatSettings: {
          welcomeMessage: "New welcome",
          maxResponseLength: 40,
          responsePace: "normal",
        },
      });
    });

    it("accepts conversationMode values that match speak-server's real enum (voice/avatar)", async () => {
      const { register } = await import("../src/tools/voice.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const callback = getToolCallback(server, "update_voice_agent");
      await callback({ agentId: "agent-1", conversationMode: "avatar" });

      expect(mockPut).toHaveBeenCalledWith("/v1/voice/agents/agent-1", {
        conversationMode: "avatar",
      });
    });

    it("rejects the old mismatched conversationMode values at the schema level (MCP protocol validates before dispatching to the handler)", async () => {
      const { voiceInputSchema } = await import("../src/tools/voice.js");
      const schema = z.object(voiceInputSchema).partial();

      expect(schema.safeParse({ conversationMode: "voice_only" }).success).toBe(false);
      expect(schema.safeParse({ conversationMode: "video_avatar" }).success).toBe(false);
      expect(schema.safeParse({ conversationMode: "avatar" }).success).toBe(true);
      expect(schema.safeParse({ conversationMode: "voice" }).success).toBe(true);
    });

    it("get_agent_analytics sends its range and flags as query params to GET /v1/voice/analytics/agent", async () => {
      const { register } = await import("../src/tools/voice.js");
      register(server, mockClient, { automations: true, voiceTestRunDetails: true });

      const params = { agentId: "agent-1", start: "2026-09-01", end: "2026-10-01", tz: "America/Toronto", compare: true, includeTests: false };
      await getToolCallback(server, "get_agent_analytics")(params);

      expect(mockGet).toHaveBeenCalledWith("/v1/voice/analytics/agent", { params });
      const schema = (server as any)._registeredTools["get_agent_analytics"].inputSchema;
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ agentId: "agent-1" }).success).toBe(true);
    });
  });
});
