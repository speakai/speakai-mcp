// Third-party app steps: the confirmation a send, post, share or delete action needs, and the refusals around it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";

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
  return (server as any)._registeredTools[toolName].inputSchema;
}

const apiError = (status: number, body: Record<string, unknown>) => ({
  isAxiosError: true,
  message: `Request failed with status code ${status}`,
  response: { status, data: { status: "failed", ...body } },
});

const sendStep = (argsTemplate: Record<string, unknown>, acknowledged?: boolean) => ({
  stepId: "send",
  stepType: "composio-action",
  composio: {
    app: "gmail",
    action: "GMAIL_SEND_EMAIL",
    argsTemplate,
    ...(acknowledged === undefined ? {} : { acknowledged }),
  },
});

const body = (steps: unknown[]) => ({
  name: "Send the summary",
  trigger: { type: "folders", triggerSlug: "media_analyzed", folderIds: ["f1"] },
  steps,
});

describe("automation tools — third-party app steps", () => {
  let server: McpServer;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockPost.mockResolvedValue({ data: { data: { automationId: "a1" } } });
    mockPut.mockResolvedValue({ data: { data: { automationId: "a1" } } });
    server = new McpServer({ name: "test", version: "1.0.0" });
    const { register } = await import("../src/tools/automations.js");
    register(server, mockClient, { automations: true, voiceTestRunDetails: true });
  });

  it("sends composio.acknowledged to the API with the step", async () => {
    const step = sendStep({ to: "team@example.com" }, true);
    await getToolCallback(server, "create_automation")(body([step]));

    expect(mockPost).toHaveBeenCalledWith("/v1/automations/", expect.objectContaining({ steps: [step] }));
  });

  it("adds the next step to the API's errorCode for a step without the confirmation", async () => {
    mockPost.mockRejectedValue(
      apiError(400, {
        errorCode: "CONFIRMATION_REQUIRED",
        message:
          'Step "send" (GMAIL_SEND_EMAIL) reaches other people or cannot be undone. Tick the confirmation on the step before saving.',
      }),
    );
    const result = await getToolCallback(server, "create_automation")(body([sendStep({ to: "x@example.com" })]));

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 400");
    expect(result.content[0].text).toContain("errorCode: CONFIRMATION_REQUIRED");
    expect(result.content[0].text).toContain("ask them to confirm");
  });

  it("trusts the API's errorCode over the message", async () => {
    mockPost.mockRejectedValue(
      apiError(400, { errorCode: "ACTION_NOT_ALLOWED", message: "Tick the confirmation on the step before saving." }),
    );
    const result = await getToolCallback(server, "create_automation")(body([sendStep({})]));

    expect(result.content[0].text).toContain("errorCode: ACTION_NOT_ALLOWED");
    expect(result.content[0].text).not.toContain("CONFIRMATION_REQUIRED");
  });

  it("reads the refusal from the message when an older API sends no errorCode", async () => {
    mockPost.mockRejectedValue(
      apiError(400, { message: 'Step "send" (X) reaches other people or cannot be undone. Tick the confirmation on the step before saving.' }),
    );
    const result = await getToolCallback(server, "create_automation")(body([sendStep({})]));

    expect(result.content[0].text).toContain("errorCode: CONFIRMATION_REQUIRED");
  });

  it.each(["OWNER_RECONFIRM_REQUIRED", "RECONNECT_REQUIRED", "OUT_OF_CREDITS"])(
    "explains why turning an automation on was refused: %s",
    async (code) => {
    mockPut.mockRejectedValue(apiError(422, { errorCode: code, message: "Refused." }));
    const result = await getToolCallback(server, "toggle_automation_status")({ automationId: "a1" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(`errorCode: ${code}`);
    expect(result.content[0].text).toContain("Next step:");
  });

  it("adds the next step to each automation the bulk turn-on could not turn on", async () => {
    mockPut.mockResolvedValue({
      data: {
        status: "success",
        data: { modifiedCount: 1, total: 2, failed: [{ automationId: "a2", message: "Reconnect Gmail to turn this automation on.", errorCode: "RECONNECT_REQUIRED" }] },
      },
    });
    const result = await getToolCallback(server, "bulk_update_automation_status")({ automationIds: ["a1", "a2"], isActive: true });

    expect(JSON.parse(result.content[0].text).data.failed[0].nextStep).toContain("Reconnect the app");
  });

  it("keeps the bulk turn-on's partner warnings in the reply", async () => {
    mockPut.mockResolvedValue({
      data: { status: "success", data: { modifiedCount: 1, total: 1, warnings: [{ automationId: "a1", warning: "Linked with \"Act\", which is off." }] } },
    });
    const result = await getToolCallback(server, "bulk_update_automation_status")({ automationIds: ["a1"], isActive: true });

    expect(JSON.parse(result.content[0].text).data.warnings[0].automationId).toBe("a1");
  });

  it("leaves unrelated errors as they were", async () => {
    mockPost.mockRejectedValue(apiError(400, { message: "Upload folder not found" }));
    const result = await getToolCallback(server, "create_automation")(body([sendStep({})]));

    expect(result.content[0].text).toContain("Upload folder not found");
    expect(result.content[0].text).not.toContain("errorCode:");
  });

  describe("update_automation and a confirmed step", () => {
    const saved = (argsTemplate: Record<string, unknown>) =>
      mockGet.mockResolvedValue({ data: { status: "success", data: { steps: [sendStep(argsTemplate, true)] } } });

    it("refuses a changed step that still carries the old confirmation", async () => {
      saved({ to: "team@example.com" });
      const result = await getToolCallback(server, "update_automation")({
        automationId: "a1",
        ...body([sendStep({ to: "everyone@example.com" }, true)]),
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('"send"');
      expect(result.content[0].text).toContain("errorCode: CONFIRMATION_REQUIRED");
      expect(mockPut).not.toHaveBeenCalled();
    });

    it("saves the changed step once the user confirmed it, without sending confirmedStepIds to the API", async () => {
      saved({ to: "team@example.com" });
      const result = await getToolCallback(server, "update_automation")({
        automationId: "a1",
        ...body([sendStep({ to: "everyone@example.com" }, true)]),
        confirmedStepIds: ["send"],
      });

      expect(result.isError).toBeUndefined();
      const [, sent] = mockPut.mock.calls[0];
      expect(sent).not.toHaveProperty("confirmedStepIds");
    });

    it("keeps an unchanged confirmed step, whatever the key order", async () => {
      saved({ to: "team@example.com", subject: "Summary" });
      const result = await getToolCallback(server, "update_automation")({
        automationId: "a1",
        ...body([sendStep({ subject: "Summary", to: "team@example.com" }, true)]),
      });

      expect(result.isError).toBeUndefined();
      expect(mockPut).toHaveBeenCalled();
    });

    it("leaves the check to the API when the saved copy cannot be read", async () => {
      mockGet.mockRejectedValue(new Error("unavailable"));
      const result = await getToolCallback(server, "update_automation")({
        automationId: "a1",
        ...body([sendStep({ to: "everyone@example.com" }, true)]),
      });

      expect(result.isError).toBeUndefined();
      expect(mockPut).toHaveBeenCalled();
    });
  });

  it("tells the user when an update turned the automation off for the owner", async () => {
    mockGet.mockResolvedValue({ data: { status: "success", data: { steps: [] } } });
    mockPut.mockResolvedValue({
      data: {
        status: "success",
        data: { automationId: "a1", message: "Saved", pausedReason: { code: "awaiting_owner_confirmation", stepId: "send", byUserId: "u2" } },
      },
    });
    const result = await getToolCallback(server, "update_automation")({ automationId: "a1", ...body([sendStep({ to: "x@example.com" })]) });

    const reply = JSON.parse(result.content[0].text);
    expect(reply.data.pausedReason.code).toBe("awaiting_owner_confirmation");
    expect(reply.pausedNotice).toContain('step "send"');
  });

  it("says in words why a listed automation is off", async () => {
    mockGet.mockResolvedValue({
      data: { status: "success", data: { totalCount: 1, automationList: [{ automationId: "a1", pausedReason: { code: "needs_reconnect", provider: "gmail" } }] } },
    });
    const result = await getToolCallback(server, "list_automations")({});

    expect(JSON.parse(result.content[0].text).data.automationList[0].pausedNotice).toContain("gmail");
  });

  it("says in words why a saved automation is off", async () => {
    mockGet.mockResolvedValue({
      data: { status: "success", data: { automationId: "a1", pausedReason: { code: "needs_reconnect", provider: "monday" } } },
    });
    const result = await getToolCallback(server, "get_automation")({ automationId: "a1" });

    expect(JSON.parse(result.content[0].text).pausedNotice).toContain("Reconnecting it");
  });

  describe("linked automations for email and file intake", () => {
    const intake = {
      name: "Gmail intake",
      trigger: { type: "composio", provider: "composio", app: "gmail", triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE", triggerConfig: { from: "calls@example.com" } },
      steps: [{ stepId: "up", stepType: "speak-upload", speakUpload: { sourceMode: "file", folderId: "f1" } }],
    };
    const act = body([sendStep({ to: "team@example.com" }, true)]);

    it("creates the intake, then the act automation linked to it", async () => {
      mockPost
        .mockResolvedValueOnce({ data: { status: "success", data: { automationId: "intake1" } } })
        .mockResolvedValueOnce({ data: { status: "success", data: { automationId: "act1" } } });
      const result = await getToolCallback(server, "create_automation")({
        ...intake,
        linkedAutomation: { ...act, automationId: "", createdAt: "" },
      });

      expect(result.isError).toBeUndefined();
      expect(mockPost.mock.calls[1][1]).not.toHaveProperty("automationId");
      expect(mockPost.mock.calls[1][1]).not.toHaveProperty("createdAt");
      expect(mockPost.mock.calls[0][1]).not.toHaveProperty("linkedAutomation");
      expect(mockPost.mock.calls[1][1]).toMatchObject({ name: act.name, linkedAutomationId: "intake1" });
      const reply = JSON.parse(result.content[0].text);
      expect(reply.linkedAutomation.data.automationId).toBe("act1");
    });

    it("says the intake exists when the linked automation fails", async () => {
      mockPost
        .mockResolvedValueOnce({ data: { status: "success", data: { automationId: "intake1" } } })
        .mockRejectedValueOnce(apiError(400, { errorCode: "CONFIRMATION_REQUIRED", message: "Tick the confirmation on the step before saving." }));
      const result = await getToolCallback(server, "create_automation")({ ...intake, linkedAutomation: act });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("intake1");
      expect(result.content[0].text).toContain("errorCode: CONFIRMATION_REQUIRED");
    });

    it("creates nothing when either graph is invalid", async () => {
      const broken = { ...act, steps: [{ stepId: "a", stepType: "notify", notify: { channel: "in_app", message: "x" }, dependsOn: ["missing"] }] };
      const result = await getToolCallback(server, "create_automation")({ ...intake, linkedAutomation: broken });

      expect(result.isError).toBe(true);
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("puts the warning first when the partner is off", async () => {
      mockPut.mockResolvedValue({
        data: { status: "success", message: "Automation activated", warning: 'Linked with "Act", which is off. Turn it on to act on what this automation brings in.' },
      });
      const result = await getToolCallback(server, "toggle_automation_status")({ automationId: "intake1" });

      expect(result.content[0].text.startsWith('Warning: Linked with "Act"')).toBe(true);
    });

    it("asks the template picker for a From and To pair", async () => {
      mockGet.mockResolvedValue({ data: { status: "success", data: { from: [], to: [], suggestions: [] } } });
      await getToolCallback(server, "suggest_automation_templates")({ from: "gmail", to: "monday" });

      expect(mockGet).toHaveBeenCalledWith("/v1/automations/catalog/templates/picker", { params: { from: "gmail", to: "monday" } });
    });
  });

  it("passes the catalog filters through to the API", async () => {
    mockGet.mockResolvedValue({ data: { status: "success", data: [] } });
    expect(getToolInputSchema(server, "list_automation_apps").safeParse({ for: "trigger" }).data).toEqual({ for: "trigger" });
    expect(getToolInputSchema(server, "list_automation_actions").safeParse({ q: "create task" }).data).toEqual({ q: "create task" });

    await getToolCallback(server, "list_automation_apps")({ for: "action" });
    await getToolCallback(server, "list_automation_actions")({ app: "monday", q: "item", afterTrigger: "GMAIL_NEW_GMAIL_MESSAGE" });

    expect(mockGet).toHaveBeenCalledWith("/v1/automations/catalog/apps", { params: { for: "action" } });
    expect(mockGet).toHaveBeenCalledWith("/v1/automations/catalog/actions", { params: { app: "monday", q: "item", afterTrigger: "GMAIL_NEW_GMAIL_MESSAGE" } });
  });
});
