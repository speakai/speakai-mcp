/**
 * Multimodal (audio/video) analysis — a premium feature gated on the company.
 *
 * Two behaviours here are not obvious and are the reason most of these tests exist:
 *
 * 1. The MCP SDK zod-parses arguments before the handler runs, and zod v3 objects STRIP
 *    unknown keys. `ask_ai_chat` forwards `params` wholesale, so a field that is not declared
 *    in the shape is silently dropped and never reaches the API. A schema test is the only
 *    thing that catches that, because the handler tests bypass zod entirely.
 *
 * 2. The automations API accepts `analysisInput` from an account without the opt-in, returns
 *    200, stores it, and then ignores it at run time — no error, no skip reason, no charge.
 *    The web client is shielded because it renders from the action catalog, which omits the
 *    field. An MCP client does not, so the refusal here is the only enforcement that exists.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { __resetCapabilityCache } from "../src/capabilities.js";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

const mockClient = {
  get: mockGet,
  post: mockPost,
  put: mockPut,
  delete: mockDelete,
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
} as any;

vi.mock("axios", () => ({
  default: {
    create: () => mockClient,
    isAxiosError: (e: any) => e?.isAxiosError === true,
  },
}));

function getToolCallback(server: McpServer, toolName: string): (params: any) => Promise<any> {
  const tool = (server as any)._registeredTools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not registered`);
  return (params: any) => tool.handler(params, {});
}

function getToolInputSchema(server: McpServer, toolName: string): any {
  const tool = (server as any)._registeredTools[toolName];
  if (!tool) throw new Error(`Tool ${toolName} not registered`);
  return tool.inputSchema;
}

/**
 * `GET /v1/user/profile` is the capability probe. `build_automation` also resolves folder and
 * field names before writing, so those reads have to answer too.
 */
function profileReturns(isMultimodalAnalysis: boolean | undefined) {
  mockGet.mockImplementation((url: string) => {
    if (url === "/v1/user/profile") {
      return Promise.resolve({ data: { data: { isMultimodalAnalysis } } });
    }
    if (url.startsWith("/v1/folder")) {
      return Promise.resolve({
        data: { status: "success", data: { folderList: [{ folderId: "fld1", name: "Sales Calls" }] } },
      });
    }
    if (url.startsWith("/v1/fields")) {
      return Promise.resolve({ data: { status: "success", data: [] } });
    }
    return Promise.resolve({ data: { data: {} } });
  });
}

const analysisStep = (analysisInput: string) => ({
  stepId: "s1",
  stepType: "magic-prompt",
  magicPrompt: { prompt: "Summarise", analysisInput },
});

describe("ask_ai_chat — analysis fields", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    __resetCapabilityCache();
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockPost.mockResolvedValue({ data: { data: { promptId: "p1", messageId: "m1" } } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/prompt.js");
    register(server, mockClient);
  });

  // The strip trap, tested through the real parser rather than by inspecting the shape: zod
  // objects strip undeclared keys, so an undeclared field survives parsing nowhere and every
  // analysis request would silently become transcript-only.
  it("keeps analysisMediaId and analysisInput through schema parsing", () => {
    const schema = getToolInputSchema(server, "ask_ai_chat");
    const parsed = schema.safeParse({
      prompt: "x",
      mediaIds: ["abc"],
      analysisMediaId: "abc",
      analysisInput: "audio",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data.analysisMediaId).toBe("abc");
    expect(parsed.data.analysisInput).toBe("audio");
  });

  it("rejects transcript as an analysisInput value", () => {
    const schema = getToolInputSchema(server, "ask_ai_chat");
    expect(schema.safeParse({ prompt: "x", analysisInput: "audio" }).success).toBe(true);
    expect(schema.safeParse({ prompt: "x", analysisInput: "video" }).success).toBe(true);
    // The chat API forbids it — omitting the field IS transcript-only.
    expect(schema.safeParse({ prompt: "x", analysisInput: "transcript" }).success).toBe(false);
  });

  it("forwards both fields to POST /v1/prompt", async () => {
    const cb = getToolCallback(server, "ask_ai_chat");
    await cb({ prompt: "What was the tone?", mediaIds: ["abc"], analysisMediaId: "abc", analysisInput: "audio" });

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe("/v1/prompt");
    expect(body).toMatchObject({ analysisMediaId: "abc", analysisInput: "audio" });
  });

  // Audio-on-video extracts the track first and the direct POST blocks while it polls, for up
  // to five minutes. The 60s client default would abort a run already being charged for.
  it("raises the request timeout past the extraction window when analysis is requested", async () => {
    const cb = getToolCallback(server, "ask_ai_chat");
    await cb({ prompt: "hi", mediaIds: ["abc"], analysisMediaId: "abc", analysisInput: "audio" });

    const config = mockPost.mock.calls[0][2];
    expect(config?.timeout).toBeGreaterThan(5 * 60 * 1000);
  });

  it("leaves a transcript-only call completely untouched", async () => {
    const cb = getToolCallback(server, "ask_ai_chat");
    await cb({ prompt: "Summarise", mediaIds: ["abc"] });

    // Exactly two arguments, as before this feature existed — no stray config object.
    expect(mockPost).toHaveBeenCalledWith("/v1/prompt", { prompt: "Summarise", mediaIds: ["abc"] });
    // No follow-up read, no capability probe.
    expect(mockGet).not.toHaveBeenCalled();
  });

  it.each([
    ["analysisInput without analysisMediaId", { prompt: "x", mediaIds: ["a"], analysisInput: "audio" }],
    ["analysisMediaId without analysisInput", { prompt: "x", mediaIds: ["a"], analysisMediaId: "a" }],
  ])("refuses %s locally, without calling the API", async (_label, params) => {
    const cb = getToolCallback(server, "ask_ai_chat");
    const result = await cb(params);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("must be provided together");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("refuses when analysisMediaId is not among mediaIds", async () => {
    const cb = getToolCallback(server, "ask_ai_chat");
    const result = await cb({ prompt: "x", mediaIds: ["abc"], analysisMediaId: "zzz", analysisInput: "video" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("must also appear in mediaIds");
    expect(mockPost).not.toHaveBeenCalled();
  });

  // A downgraded run returns a normal, confident answer. Without reading it back an assistant
  // presents a transcript answer as though the model had listened to the recording.
  it("surfaces a downgrade to transcript as a warning", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          messages: [
            {
              messageId: "m1",
              analysis: { requested: "audio", used: "transcript", skippedReason: "Could not extract the audio track." },
            },
          ],
        },
      },
    });

    const cb = getToolCallback(server, "ask_ai_chat");
    const result = await cb({ prompt: "x", mediaIds: ["abc"], analysisMediaId: "abc", analysisInput: "audio" });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.analysis.used).toBe("transcript");
    expect(payload.analysisWarning).toContain("Requested audio analysis");
    expect(payload.analysisWarning).toContain("Could not extract the audio track.");
  });

  it("adds no warning when the requested analysis actually ran", async () => {
    mockGet.mockResolvedValue({
      data: { data: { messages: [{ messageId: "m1", analysis: { requested: "audio", used: "audio" } }] } },
    });

    const cb = getToolCallback(server, "ask_ai_chat");
    const result = await cb({ prompt: "x", mediaIds: ["abc"], analysisMediaId: "abc", analysisInput: "audio" });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.analysis.used).toBe("audio");
    expect(payload.analysisWarning).toBeUndefined();
  });

  // The answer is already paid for; a failed follow-up must not turn it into an error.
  it("still returns the answer when the follow-up read fails", async () => {
    mockGet.mockRejectedValue(new Error("boom"));

    const cb = getToolCallback(server, "ask_ai_chat");
    const result = await cb({ prompt: "x", mediaIds: ["abc"], analysisMediaId: "abc", analysisInput: "audio" });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).data.promptId).toBe("p1");
  });
});

describe("get_analysis_quote", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    __resetCapabilityCache();
    mockGet.mockResolvedValue({ data: { data: { eligible: true, credits: 0.42, seconds: 900 } } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/prompt.js");
    register(server, mockClient);
  });

  it("queries the quote endpoint with the media and mode", async () => {
    const cb = getToolCallback(server, "get_analysis_quote");
    await cb({ mediaId: "abc", analysisInput: "video" });

    expect(mockGet).toHaveBeenCalledWith("/v1/prompt/analysisQuote", {
      params: { mediaId: "abc", analysisInput: "video" },
    });
  });

  // The endpoint answers 200 with eligible:false. Treating that as an error would hide the
  // reason, which is the one thing the user can act on.
  it("reports an ineligible file as a normal result, not an error", async () => {
    mockGet.mockResolvedValue({
      data: { data: { eligible: false, reason: "Audio and video analysis is not enabled for this account.", credits: 0, seconds: 0 } },
    });

    const cb = getToolCallback(server, "get_analysis_quote");
    const result = await cb({ mediaId: "abc", analysisInput: "audio" });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).data.reason).toContain("not enabled");
  });
});

describe("automations — premium gate", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    __resetCapabilityCache();
    mockPost.mockResolvedValue({ data: { data: { automationId: "a1" } } });
    mockPut.mockResolvedValue({ data: { data: { automationId: "a1" } } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/automations.js");
    register(server, mockClient);
  });

  const body = (steps: unknown[]) => ({
    name: "Tone check",
    trigger: { type: "folders", triggerSlug: "media_analyzed", folderIds: ["f1"] },
    steps,
  });

  it.each(["audio", "video"])("refuses create_automation with analysisInput=%s when disabled", async (mode) => {
    profileReturns(false);
    const cb = getToolCallback(server, "create_automation");
    const result = await cb(body([analysisStep(mode)]));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not enabled for this account");
    // The whole point: the write must never reach the API, which would accept it.
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("refuses update_automation the same way", async () => {
    profileReturns(false);
    const cb = getToolCallback(server, "update_automation");
    const result = await cb({ automationId: "a1", ...body([analysisStep("video")]) });

    expect(result.isError).toBe(true);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("allows the write when the account has the feature", async () => {
    profileReturns(true);
    const cb = getToolCallback(server, "create_automation");
    const result = await cb(body([analysisStep("audio")]));

    expect(result.isError).toBeUndefined();
    expect(mockPost).toHaveBeenCalledWith("/v1/automations/", expect.anything());
  });

  // An unreachable profile must not block accounts that do have the feature.
  it("allows the write when capability cannot be determined", async () => {
    mockGet.mockRejectedValue(new Error("profile unavailable"));
    const cb = getToolCallback(server, "create_automation");
    const result = await cb(body([analysisStep("audio")]));

    expect(result.isError).toBeUndefined();
    expect(mockPost).toHaveBeenCalled();
  });

  it.each(["transcript", ""])("never probes capability for analysisInput=%p", async (mode) => {
    profileReturns(false);
    const cb = getToolCallback(server, "create_automation");
    const result = await cb(body([analysisStep(mode)]));

    expect(result.isError).toBeUndefined();
    expect(mockGet).not.toHaveBeenCalledWith("/v1/user/profile");
    expect(mockPost).toHaveBeenCalled();
  });

  it("leaves an automation with no magic-prompt step alone", async () => {
    profileReturns(false);
    const cb = getToolCallback(server, "create_automation");
    const result = await cb(body([{ stepId: "s1", stepType: "translation", translation: { targetLanguage: "es-ES" } }]));

    expect(result.isError).toBeUndefined();
    expect(mockPost).toHaveBeenCalled();
  });

  it("passes analysisInput through to the wire untouched", async () => {
    profileReturns(true);
    const cb = getToolCallback(server, "create_automation");
    await cb(body([analysisStep("video")]));

    const sent = mockPost.mock.calls[0][1];
    expect(sent.steps[0].magicPrompt.analysisInput).toBe("video");
  });
});

describe("build_automation — analyse spec", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    __resetCapabilityCache();
    mockPost.mockResolvedValue({ data: { data: { automationId: "a1" } } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/workflows.js");
    register(server, mockClient);
  });

  const spec = (analyse?: string) => ({
    name: "Tone check",
    trigger: { on: "media_analyzed", folders: ["Sales Calls"] },
    steps: [{ do: "ai_chat", prompt: "How did they sound?", ...(analyse ? { analyse } : {}) }],
  });

  // build_automation constructs magicPrompt from an explicit allowlist, so an unmapped field
  // vanishes without a word. This is the test that proves the mapping exists.
  it("maps analyse onto magicPrompt.analysisInput", async () => {
    profileReturns(true);
    const cb = getToolCallback(server, "build_automation");
    await cb(spec("audio"));

    const sent = mockPost.mock.calls.at(-1)?.[1];
    expect(sent.steps[0].magicPrompt.analysisInput).toBe("audio");
  });

  it("omits the key for transcript, which is the default", async () => {
    profileReturns(true);
    const cb = getToolCallback(server, "build_automation");
    await cb(spec("transcript"));

    const sent = mockPost.mock.calls.at(-1)?.[1];
    expect(sent.steps[0].magicPrompt.analysisInput).toBeUndefined();
  });

  it("rejects a value the API would refuse", async () => {
    profileReturns(true);
    const cb = getToolCallback(server, "build_automation");
    const result = await cb(spec("audio_video"));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("analyse must be");
  });

  it("refuses to build when the account lacks the feature", async () => {
    profileReturns(false);
    const cb = getToolCallback(server, "build_automation");
    const result = await cb(spec("video"));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not enabled for this account");
    expect(mockPost).not.toHaveBeenCalled();
  });
});
