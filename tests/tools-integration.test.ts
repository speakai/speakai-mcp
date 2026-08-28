import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
      register(server, mockClient);

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
      register(server, mockClient);

      const callback = getToolCallback(server, "list_media");
      await callback({ mediaType: "audio", page: 1, pageSize: 10 });

      expect(mockGet).toHaveBeenCalledWith("/v1/media", {
        params: { mediaType: "audio", page: 1, pageSize: 10 },
      });
    });

    it("get_transcript calls GET /v1/media/transcript/:id", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "get_transcript");
      await callback({ mediaId: "abc123" });

      expect(mockGet).toHaveBeenCalledWith("/v1/media/transcript/abc123");
    });

    it("delete_media calls DELETE /v1/media/:id", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "delete_media");
      await callback({ mediaId: "abc123" });

      expect(mockDelete).toHaveBeenCalledWith("/v1/media/abc123");
    });

    it("get_media_status calls GET /v1/media/status/:id", async () => {
      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "get_media_status");
      await callback({ mediaId: "abc123" });

      expect(mockGet).toHaveBeenCalledWith("/v1/media/status/abc123");
    });
  });

  describe("Prompt/Chat tools", () => {
    it("ask_ai_chat calls POST /v1/prompt with all params", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient);

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
      register(server, mockClient);

      const callback = getToolCallback(server, "ask_ai_chat");
      await callback({ prompt: "What themes appear across all interviews?" });

      expect(mockPost).toHaveBeenCalledWith("/v1/prompt", {
        prompt: "What themes appear across all interviews?",
      });
    });

    it("get_chat_history calls GET /v1/prompt/history", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient);

      const callback = getToolCallback(server, "get_chat_history");
      await callback({ limit: 5 });

      expect(mockGet).toHaveBeenCalledWith("/v1/prompt/history", {
        params: { limit: 5 },
      });
    });

    it("list_prompts calls GET /v1/prompt", async () => {
      const { register } = await import("../src/tools/prompt.js");
      register(server, mockClient);

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
      register(server, mockClient);

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
      register(server, mockClient);

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
      register(server, mockClient);

      const callback = getToolCallback(server, "delete_clip");
      await callback({ clipId: "clip123" });

      expect(mockDelete).toHaveBeenCalledWith("/v1/clips/clip123");
    });
  });

  describe("Error handling", () => {
    it("returns isError true when API call fails", async () => {
      mockGet.mockRejectedValueOnce(new Error("Network error"));

      const { register } = await import("../src/tools/media.js");
      register(server, mockClient);

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
      register(server, mockClient);

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
      register(server, mockClient);
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
      register(server, mockClient);
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
});
