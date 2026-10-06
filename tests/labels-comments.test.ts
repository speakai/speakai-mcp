import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

const mockClient = {
  get: mockGet,
  post: mockPost,
  put: mockPut,
  patch: mockPatch,
  delete: mockDelete,
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
} as any;

vi.mock("axios", () => ({
  default: { create: () => mockClient, isAxiosError: () => false },
}));

// flattenWords order: entity words when a sentence has entities, else its text; bare punctuation is skipped.
const TRANSCRIPT = {
  status: "success",
  data: {
    transcriptRevision: 4,
    insight: {
      transcript: [
        { text: "ignored when entities exist", entities: [{ text: "Hello," }, { text: "New York" }, { text: "-" }] },
        { text: "We can’t ship this. We can fix it." },
      ],
    },
  },
};

function tool(server: McpServer, name: string) {
  const registered = (server as any)._registeredTools[name];
  if (!registered) throw new Error(`Tool ${name} not registered`);
  return {
    call: (params: any) => registered.handler(params, {}),
    schema: registered.inputSchema,
  };
}

describe("Labels and comments tools", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    for (const m of [mockGet, mockPost, mockPut, mockPatch, mockDelete]) {
      m.mockResolvedValue({ data: { status: "success", data: {} } });
    }
    server = new McpServer({ name: "test", version: "1.0.0" });
    (await import("../src/tools/labels.js")).register(server, mockClient);
    (await import("../src/tools/comments.js")).register(server, mockClient);
  });

  it("manages workspace labels through the label endpoints", async () => {
    await tool(server, "list_labels").call({ status: "all", search: "risk" });
    expect(mockGet).toHaveBeenCalledWith("/v1/labels", { params: { status: "all", search: "risk" } });

    await tool(server, "create_label").call({ name: "Risk", color: "#ff0000", parentId: "g1" });
    expect(mockPost).toHaveBeenCalledWith("/v1/labels", { name: "Risk", color: "#ff0000", parentId: "g1" });

    await tool(server, "update_label").call({ labelId: "l1", parentId: null });
    expect(mockPut).toHaveBeenCalledWith("/v1/labels/l1", { parentId: null });

    await tool(server, "archive_label").call({ labelId: "l1" });
    await tool(server, "restore_label").call({ labelId: "l1" });
    await tool(server, "merge_labels").call({ labelId: "l1", targetLabelId: "l2" });
    await tool(server, "add_speak_label_sets").call({ sets: ["sales_qa"] });
    expect(mockPost).toHaveBeenCalledWith("/v1/labels/l1/archive");
    expect(mockPost).toHaveBeenCalledWith("/v1/labels/l1/restore");
    expect(mockPost).toHaveBeenCalledWith("/v1/labels/l1/merge", { targetLabelId: "l2" });
    expect(mockPost).toHaveBeenCalledWith("/v1/labels/speak-sets", { sets: ["sales_qa"] });

    // Requests the server would reject are refused before any call.
    mockPost.mockClear();
    mockPut.mockClear();
    const refused = await Promise.all([
      tool(server, "create_label").call({ name: "Group", isGroup: true, color: "#ff0000" }),
      tool(server, "update_label").call({ labelId: "l1" }),
      tool(server, "merge_labels").call({ labelId: "l1", targetLabelId: "l1" }),
    ]);
    expect(refused.every((r) => r.isError)).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("enforces the server's input limits in the schemas", () => {
    const create = tool(server, "create_label").schema;
    expect(create.safeParse({ name: "a".repeat(80) }).success).toBe(true);
    expect(create.safeParse({ name: "a".repeat(81) }).success).toBe(false);
    expect(create.safeParse({ name: "   " }).success).toBe(false);
    expect(create.safeParse({ name: "x", description: "d".repeat(501) }).success).toBe(false);
    expect(create.safeParse({ name: "x", color: "red" }).success).toBe(false);

    const apply = tool(server, "apply_label").schema;
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `l${i}`);
    expect(apply.safeParse({ mediaId: "m1", labelIds: ids(20), quote: "hi" }).success).toBe(true);
    expect(apply.safeParse({ mediaId: "m1", labelIds: ids(21), quote: "hi" }).success).toBe(false);
    expect(apply.safeParse({ mediaId: "m1", labelIds: [], quote: "hi" }).success).toBe(false);
    expect(apply.safeParse({ mediaId: "m1", labelIds: ["a", "a"], quote: "hi" }).success).toBe(false);
    expect(apply.safeParse({ mediaId: "m/1", labelIds: ["a"], quote: "hi" }).success).toBe(false);

    const comment = tool(server, "add_comment").schema;
    expect(comment.safeParse({ mediaId: "m1", body: "b".repeat(5000) }).success).toBe(true);
    expect(comment.safeParse({ mediaId: "m1", body: "b".repeat(5001) }).success).toBe(false);
    expect(comment.safeParse({ mediaId: "m1", body: " " }).success).toBe(false);
  });

  it("apply_label finds a quote's word range and the current revision", async () => {
    mockGet.mockResolvedValue({ data: TRANSCRIPT });
    const apply = tool(server, "apply_label");

    // Words: 0 Hello, 1 New, 2 York, 3 We, 4 can't, 5 ship, 6 this., 7 We, 8 can, 9 fix, 10 it.
    await apply.call({ mediaId: "m1", labelIds: ["l1"], quote: "york we CAN'T ship" });
    expect(mockGet).toHaveBeenCalledWith("/v1/media/transcript/m1");
    expect(mockPost).toHaveBeenCalledWith("/v1/media/m1/labels", {
      range: { start: 2, end: 5 },
      expectedTranscriptRevision: 4,
      labelIds: ["l1"],
    });

    const ambiguous = await apply.call({ mediaId: "m1", labelIds: ["l1"], quote: "we" });
    expect(ambiguous.isError).toBe(true);
    expect(ambiguous.content[0].text).toContain("appears 2 times");

    await apply.call({ mediaId: "m1", labelIds: ["l1"], quote: "we", occurrence: 2, expectedTranscriptRevision: 3 });
    expect(mockPost).toHaveBeenLastCalledWith("/v1/media/m1/labels", {
      range: { start: 7, end: 7 },
      expectedTranscriptRevision: 3,
      labelIds: ["l1"],
    });

    const missing = await apply.call({ mediaId: "m1", labelIds: ["l1"], quote: "not said" });
    expect(missing.content[0].text).toContain("not found");

    // An explicit range is sent as given and needs the revision it was read at.
    mockGet.mockClear();
    await apply.call({ mediaId: "m1", labelIds: ["l1"], range: { start: 0, end: 1 }, expectedTranscriptRevision: 4 });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenLastCalledWith("/v1/media/m1/labels", {
      range: { start: 0, end: 1 },
      expectedTranscriptRevision: 4,
      labelIds: ["l1"],
    });

    mockPost.mockClear();
    const invalid = await Promise.all([
      apply.call({ mediaId: "m1", labelIds: ["l1"], range: { start: 0, end: 1 } }),
      apply.call({ mediaId: "m1", labelIds: ["l1"] }),
      apply.call({ mediaId: "m1", labelIds: ["l1"], quote: "we", range: { start: 0, end: 0 }, expectedTranscriptRevision: 4 }),
    ]);
    expect(invalid.every((r) => r.isError)).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("update_media_label sends exactly one change", async () => {
    mockGet.mockResolvedValue({ data: TRANSCRIPT });
    const update = tool(server, "update_media_label");
    const url = "/v1/media/m1/labels/ml1";

    await update.call({ mediaId: "m1", mediaLabelId: "ml1", labelIds: ["l2"] });
    expect(mockPatch).toHaveBeenLastCalledWith(url, { labelIds: ["l2"] });
    await update.call({ mediaId: "m1", mediaLabelId: "ml1", action: "keep" });
    expect(mockPatch).toHaveBeenLastCalledWith(url, { action: "keep" });
    await update.call({ mediaId: "m1", mediaLabelId: "ml1", action: "replace", quote: "fix it" });
    expect(mockPatch).toHaveBeenLastCalledWith(url, {
      action: "replace",
      range: { start: 9, end: 10 },
      expectedTranscriptRevision: 4,
    });

    mockPatch.mockClear();
    const invalid = await Promise.all([
      update.call({ mediaId: "m1", mediaLabelId: "ml1" }),
      update.call({ mediaId: "m1", mediaLabelId: "ml1", labelIds: ["l2"], action: "keep" }),
      update.call({ mediaId: "m1", mediaLabelId: "ml1", action: "keep", quote: "fix it" }),
      update.call({ mediaId: "m1", mediaLabelId: "ml1", action: "replace" }),
    ]);
    expect(invalid.every((r) => r.isError)).toBe(true);
    expect(mockPatch).not.toHaveBeenCalled();

    await tool(server, "list_media_labels").call({ mediaId: "m1", status: "needs_review" });
    expect(mockGet).toHaveBeenLastCalledWith("/v1/media/m1/labels", { params: { status: "needs_review" } });
    await tool(server, "remove_media_label").call({ mediaId: "m1", mediaLabelId: "ml1" });
    expect(mockDelete).toHaveBeenCalledWith(url);
  });

  it("comments: whole file, on words, replies, resolve and delete", async () => {
    mockGet.mockResolvedValue({ data: TRANSCRIPT });
    const add = tool(server, "add_comment");

    await add.call({ mediaId: "m1", body: "Good call" });
    expect(mockPost).toHaveBeenLastCalledWith("/v1/media/m1/comments", { body: "Good call" });

    await add.call({ mediaId: "m1", body: "Why?", quote: "ship this", mediaLabelId: "ml1" });
    expect(mockPost).toHaveBeenLastCalledWith("/v1/media/m1/comments", {
      body: "Why?",
      range: { start: 5, end: 6 },
      expectedTranscriptRevision: 4,
      mediaLabelId: "ml1",
    });

    await add.call({ mediaId: "m1", body: "Agreed", parentId: "c1" });
    expect(mockPost).toHaveBeenLastCalledWith("/v1/media/m1/comments", { body: "Agreed", parentId: "c1" });

    const replyWithSpan = await add.call({ mediaId: "m1", body: "x", parentId: "c1", quote: "ship" });
    expect(replyWithSpan.isError).toBe(true);

    await tool(server, "list_media_comments").call({ mediaId: "m1", filter: "open" });
    expect(mockGet).toHaveBeenLastCalledWith("/v1/media/m1/comments", { params: { filter: "open" } });

    await tool(server, "resolve_comment").call({ mediaId: "m1", commentId: "c1" });
    expect(mockPatch).toHaveBeenLastCalledWith("/v1/media/m1/comments/c1", { isResolved: true });
    await tool(server, "resolve_comment").call({ mediaId: "m1", commentId: "c1", resolved: false });
    expect(mockPatch).toHaveBeenLastCalledWith("/v1/media/m1/comments/c1", { isResolved: false });

    await tool(server, "delete_comment").call({ mediaId: "m1", commentId: "c1" });
    expect(mockDelete).toHaveBeenCalledWith("/v1/media/m1/comments/c1");
  });

  it("surfaces a stale-revision 409 from the server as a tool error", async () => {
    mockPost.mockRejectedValueOnce(new Error("HTTP 409: This transcript changed since you opened it."));
    const result = await tool(server, "apply_label").call({
      mediaId: "m1",
      labelIds: ["l1"],
      range: { start: 0, end: 0 },
      expectedTranscriptRevision: 1,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("409");
  });
});
