import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import type { RegisterOptions, ToolCallEvent } from "../src/tools/index.js";

// Create a mock axios instance that tracks calls
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

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

vi.mock("axios", async (importOriginal) => {
  const actual = (await importOriginal<typeof import("axios")>()).default;
  return {
    default: {
      create: () => mockClient,
      isAxiosError: (e: any) => e?.isAxiosError === true,
      AxiosError: actual.AxiosError,
    },
  };
});

function getToolCallback(server: McpServer, toolName: string): Function {
  const tools = (server as any)._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not registered`);
  return (params: any) => tool.handler(params, {});
}

// Helper to create an axios-like error with a response
function axiosError(status: number, data: any = {}, headers: Record<string, string> = {}) {
  const err: any = new Error(`Request failed with status code ${status}`);
  err.isAxiosError = true;
  err.response = { status, data, headers };
  return err;
}

const MODULES = {
  media: () => import("../src/tools/media.js"),
  folders: () => import("../src/tools/folders.js"),
  prompt: () => import("../src/tools/prompt.js"),
  clips: () => import("../src/tools/clips.js"),
  analytics: () => import("../src/tools/analytics.js"),
} as const;

const MOCKS = { get: mockGet, post: mockPost } as const;

describe("Error Handling & Resilience", () => {
  let server: McpServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
  });

  async function callFailing(module: keyof typeof MODULES, method: keyof typeof MOCKS, tool: string, args: object, error: unknown) {
    const { register } = await MODULES[module]();
    register(server, mockClient, { aiChat: true });
    MOCKS[method].mockRejectedValueOnce(error);
    return getToolCallback(server, tool)(args);
  }

  // The model reads this text to decide what to tell the user, so the status and the API's own message must both reach it.
  it.each([
    { module: "media", method: "get", tool: "get_transcript", args: { mediaId: "abc123" }, status: 401, body: { message: "Invalid API key" } },
    { module: "media", method: "get", tool: "get_media_insights", args: { mediaId: "abc123" }, status: 403, body: { message: "Insufficient permissions" } },
    { module: "media", method: "post", tool: "upload_media", args: { name: "Test", url: "https://example.com/test.mp3" }, status: 429, body: { message: "Rate limit exceeded" } },
    { module: "media", method: "get", tool: "list_media", args: {}, status: 500, body: { message: "Internal server error" } },
    { module: "folders", method: "get", tool: "list_folders", args: {}, status: 500, body: { error: "db down" } },
    { module: "prompt", method: "post", tool: "ask_ai_chat", args: { prompt: "test" }, status: 503, body: { message: "Service unavailable" } },
    { module: "clips", method: "post", tool: "create_clip", args: { title: "T", mediaType: "audio", timeRanges: [{ mediaId: "abc", startTime: 90, endTime: 60 }] }, status: 400, body: { message: "Invalid time range" } },
  ] as const)("$tool reports HTTP $status with the API message as a tool error", async ({ module, method, tool, args, status, body }) => {
    const result = await callFailing(module, method, tool, args, axiosError(status, body));

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: `Error: HTTP ${status}: ${JSON.stringify(body, null, 2)}` }]);
  });

  it("tells the model how to find the right mediaId when a media lookup is a 404", async () => {
    const { MEDIA_NOT_FOUND_HELP } = await import("../src/media-utils.js");
    const result = await callFailing("media", "get", "get_media_status", { mediaId: "nonexistent" }, axiosError(404, { message: "Media not found" }));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(`Error: HTTP 404: ${JSON.stringify({ message: "Media not found" }, null, 2)}\n\n${MEDIA_NOT_FOUND_HELP}`);
  });

  it("explains which links work when the API rejects an upload link", async () => {
    const { register } = await import("../src/tools/workflows.js");
    register(server, mockClient, { localFileAccess: false });

    mockPost.mockRejectedValueOnce(axiosError(400, { status: "failed", message: "Could not fetch media from this URL." }));

    const result = await getToolCallback(server, "upload_and_analyze")({ url: "https://www.instagram.com/p/abc/" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Could not fetch media from this URL.");
    expect(result.content[0].text).toMatch(/opens without signing in/);
  });

  it.each([
    { module: "media", method: "get", tool: "get_transcript", args: { mediaId: "abc123" }, message: "timeout of 60000ms exceeded" },
    { module: "media", method: "get", tool: "list_media", args: {}, message: "getaddrinfo ENOTFOUND api.speakai.co" },
    { module: "media", method: "get", tool: "get_media_insights", args: { mediaId: "abc123" }, message: "connect ECONNREFUSED 127.0.0.1:443" },
    { module: "analytics", method: "post", tool: "search_media", args: { query: "test" }, message: "Network error" },
  ] as const)("$tool turns a network failure ($message) into a tool error instead of throwing", async ({ module, method, tool, args, message }) => {
    const result = await callFailing(module, method, tool, args, new Error(message));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(`Error: ${message}`);
  });

  it.each([
    { tool: "get_transcript", data: null },
    { tool: "get_media_status", data: {} },
    { tool: "list_media", data: { unexpected: "shape" } },
  ])("$tool passes an odd API body ($data) through as JSON without crashing", async ({ tool, data }) => {
    const { register } = await import("../src/tools/media.js");
    register(server, mockClient);
    mockGet.mockResolvedValueOnce({ data });

    const result = await getToolCallback(server, tool)({ mediaId: "abc123" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual(data);
  });

  // Regression (0e794ec): the output schema requires data, so an empty body must give data null, never undefined.
  it("returns data null, never undefined, when the API sends an empty body", async () => {
    const billing = await import("../src/tools/billing.js");
    const media = await import("../src/tools/media.js");
    billing.register(server, mockClient, { automations: true, voiceTestRunDetails: true });
    media.register(server, mockClient, { automations: true, voiceTestRunDetails: true });
    mockGet.mockResolvedValue({ data: undefined });

    const viaOk = await getToolCallback(server, "get_billing_status")({});
    const viaText = await getToolCallback(server, "get_media_status")({ mediaId: "abc123" });

    expect(viaOk.content[0].text).toBe("null");
    expect(viaOk.structuredContent).toStrictEqual({ data: null });
    expect(viaText.structuredContent).toStrictEqual({ data: null });
  });
});

describe("formatAxiosError", () => {
  it("formats axios error with status and JSON body", async () => {
    const { formatAxiosError } = await import("../src/client.js");
    expect(formatAxiosError(axiosError(422, { message: "Validation failed" }))).toBe(
      `HTTP 422: ${JSON.stringify({ message: "Validation failed" }, null, 2)}`
    );
  });

  it("says the request failed when an axios error has no response", async () => {
    const { formatAxiosError } = await import("../src/client.js");
    const noResponse: any = new Error("socket hang up");
    noResponse.isAxiosError = true;
    expect(formatAxiosError(noResponse)).toBe("Request failed: socket hang up");
  });

  // Error text goes to the model and into chat transcripts, so secrets an API echoes back must not.
  it("redacts secret-looking keys and truncates long strings in the error body", async () => {
    const { formatAxiosError } = await import("../src/client.js");
    const body = {
      message: "x".repeat(600),
      accessToken: "tok_live_123",
      details: { apiKey: "key_123", "x-api-key": "key_456", password: "hunter2", Authorization: "Bearer abc", signature: "sig" },
    };

    const text = formatAxiosError(axiosError(400, body));
    const parsed = JSON.parse(text.replace(/^HTTP 400: /, ""));

    expect(parsed.message).toBe("x".repeat(500) + "…");
    expect(parsed.accessToken).toBe("[redacted]");
    expect(Object.values(parsed.details)).toEqual(Array(5).fill("[redacted]"));
    for (const secret of ["tok_live_123", "key_123", "key_456", "hunter2", "Bearer abc"]) {
      expect(text).not.toContain(secret);
    }
  });

  it.each([
    { input: new Error("Something broke"), expected: "Something broke" },
    { input: "string error", expected: "string error" },
    { input: 42, expected: "42" },
    { input: null, expected: "null" },
    { input: undefined, expected: "undefined" },
  ])("formats a non-axios value $input as plain text", async ({ input, expected }) => {
    const { formatAxiosError } = await import("../src/client.js");
    expect(formatAxiosError(input)).toBe(expected);
  });
});

describe("Credit refusals", () => {
  const CHECKOUT_URL = "https://checkout.example.com/session/abc";
  const refusal = {
    status: "failed",
    code: 402,
    message: "Insufficient credits",
    reason: "OUT_OF_CREDITS",
    billing: { plan: "trial", creditsRemaining: 0, creditsNeeded: 12, canManageBilling: true },
    options: [{ id: "top_up", recommended: true, amount: 10, currency: "usd", credits: 100, url: CHECKOUT_URL }],
    checkoutUrl: CHECKOUT_URL,
    userMessage: "You are out of credits. Add credits to keep going.",
  };

  type Reply = { status: number; data: unknown };

  // A real axios instance whose adapter answers in place of the network.
  async function fakeApi(reply: (config: any) => Reply, options: RegisterOptions = { aiChat: true }) {
    const realAxios = (await vi.importActual<typeof import("axios")>("axios")).default;
    const seen: any[] = [];
    const instance = realAxios.create({
      adapter: async (config) => {
        seen.push(config);
        const { status, data } = reply(config);
        const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
        if (status >= 400) {
          throw new realAxios.AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", config, {}, response);
        }
        return response;
      },
    });
    const server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
    const { registerAllTools } = await import("../src/tools/index.js");
    registerAllTools(server, instance, options);
    return { server, instance, seen };
  }

  function expectRefusal(result: any) {
    expect(result.isError).toBe(true);
    expect(result.content[0].text.split("\n")).toEqual([refusal.userMessage, `Continue here: ${CHECKOUT_URL}`]);
    expect(result.structuredContent.data).toMatchObject({ reason: "OUT_OF_CREDITS", billing: { creditsRemaining: 0 } });
  }

  it.each([
    { tool: "upload_media", args: { name: "Call", url: "https://example.com/a.mp3" }, status: 200 },
    { tool: "upload_media", args: { name: "Call", url: "https://example.com/a.mp3" }, status: 402 },
    { tool: "ask_ai_chat", args: { prompt: "Summarise" }, status: 200 },
    { tool: "ask_ai_chat", args: { prompt: "Summarise" }, status: 402 },
    { tool: "upload_and_analyze", args: { url: "https://example.com/a.mp3" }, status: 200 },
    { tool: "create_text_note", args: { name: "Note", text: "Hello" }, status: 403 },
  ])("$tool turns an HTTP $status refusal into a tool error and names itself in a header", async ({ tool, args, status }) => {
    const { server, seen } = await fakeApi(() => ({ status, data: refusal }));

    const result = await getToolCallback(server, tool)(args);

    expectRefusal(result);
    expect(seen.length).toBeGreaterThan(0);
    for (const config of seen) expect(config.headers.get("x-speakai-mcp-tool")).toBe(tool);
  });

  it("keeps a plain failed body as an error, and sends no tool header outside a tool call", async () => {
    const { server, instance, seen } = await fakeApi(() => ({ status: 200, data: { status: "failed", message: "Media is locked" } }));

    const result = await getToolCallback(server, "get_transcript")({ mediaId: "m1" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Media is locked");

    await expect(instance.get("/v1/anything")).rejects.toThrow("Media is locked");
    expect(seen[1].headers.get("x-speakai-mcp-tool")).toBeUndefined();
  });

  it("upload_and_analyze_batch keeps the uploads made before a refusal and stops sending the rest", async () => {
    let calls = 0;
    const { server, seen } = await fakeApi(() =>
      ++calls === 1 ? { status: 200, data: { status: "success", data: { mediaId: "m1", state: "pending" } } } : { status: 402, data: refusal }
    );
    const urls = ["https://example.com/1.mp3", "https://example.com/2.mp3", "https://example.com/3.mp3"];

    const partial = await getToolCallback(server, "upload_and_analyze_batch")({ urls, concurrency: 1 });
    expect(partial.isError).toBeUndefined();
    const body = JSON.parse(partial.content[0].text);
    expect(body).toMatchObject({ uploaded: 1, failed: 1, notSent: [urls[2]], refusal: { reason: "OUT_OF_CREDITS" } });
    expect(body.nextSteps[0]).toContain(refusal.userMessage);
    expect(seen).toHaveLength(2);

    const none = await getToolCallback(server, "upload_and_analyze_batch")({ urls, concurrency: 1 });
    expectRefusal(none);
  });

  it("surfaces a refusal that a client without the response check passes through as success", async () => {
    const server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
    const { register } = await import("../src/tools/media.js");
    register(server, mockClient);
    mockPost.mockResolvedValueOnce({ data: refusal });

    expectRefusal(await getToolCallback(server, "upload_media")({ name: "Call", url: "https://example.com/a.mp3" }));
  });

  it("reports one usage event per tool call without arguments or user text", async () => {
    const replies: Reply[] = [
      { status: 200, data: { status: "success", data: { mediaId: "m1" } } },
      { status: 500, data: { message: "db down" } },
      { status: 402, data: refusal },
    ];
    const events: ToolCallEvent[] = [];
    const { server } = await fakeApi(() => replies.shift()!, { onToolCall: (event) => events.push(event) });
    const args = { name: "Private board meeting", url: "https://example.com/private-board.mp3" };
    const upload = getToolCallback(server, "upload_media");

    expect((await upload(args)).isError).toBeUndefined();
    expect((await upload(args)).isError).toBe(true);
    expectRefusal(await upload(args));

    expect(events.map(({ durationMs, ...rest }) => rest)).toEqual([
      { event: "mcp.tool.call", tool: "upload_media", ok: true },
      { event: "mcp.tool.call", tool: "upload_media", ok: false, status: 500 },
      { event: "mcp.tool.call", tool: "upload_media", ok: false, status: 402, refusal: "OUT_OF_CREDITS" },
    ]);
    expect(events.every((event) => Number.isInteger(event.durationMs) && event.durationMs >= 0)).toBe(true);
    const logged = JSON.stringify(events);
    for (const text of [args.name, args.url, "m1", refusal.userMessage, CHECKOUT_URL]) {
      expect(logged).not.toContain(text);
    }
  });

  it("ok() and err() report failed bodies and refusals as errors", async () => {
    const { ok, err } = await import("../src/tools/_helpers.js");

    expect(ok({ status: "failed", message: "nope" }).isError).toBe(true);
    expect(ok({ status: "success", data: {} }).isError).toBeUndefined();
    expectRefusal(ok(refusal));
    expectRefusal(err(axiosError(402, refusal)));

    const reasonOnly = err(axiosError(402, { status: "failed", message: "Trial ended", reason: "TRIAL_ENDED" }));
    expect(reasonOnly.isError).toBe(true);
    expect(reasonOnly.content[0].text).toBe("Trial ended");
  });

  it("get_billing_status explains a missing route instead of failing opaquely", async () => {
    const { server } = await fakeApi(() => ({ status: 404, data: "Cannot GET /v1/subscription/billing-status" }));

    const result = await getToolCallback(server, "get_billing_status")({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not available from this Speak AI server yet");
  });
});
