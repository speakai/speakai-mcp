import { McpServer } from "@modelcontextprotocol/server";
import { AxiosInstance } from "axios";
import { z } from "zod";
import type { RegisterOptions } from "./index.js";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";
import {
  fetchInboundWebhookInfo,
  isInboundWebhookTrigger,
  resolveAutomationInboundWebhook,
  unwrapData,
} from "./inbound-webhook-utils.js";
import { MULTIMODAL_DISABLED_MESSAGE, multimodalCapability } from "../capabilities.js";
import {
  describePause,
  formatAutomationError,
  hasConfirmedAppStep,
  staleConfirmations,
  withFailedNextSteps,
} from "./automation-composio.js";
import {
  validateGraph,
  describeGraph,
  type WireStep,
} from "./automation-graph.js";

// Shared write-schema fields for create/update. The API server's
// automations module validates these with Joi `automationCreateUpdate` and
// runs them through the V2 graph engine — see the `steps` note below.
const TOKEN_SYNTAX_NOTE =
  "Token syntax (usable in fields marked 'tokens allowed'): " +
  "{{trigger.payload.<path>}} reads the inbound webhook payload (dot paths and [n] array indices; " +
  "paths are relative to trigger.childKey when set — discover valid paths with get_inbound_webhook after " +
  "sending a test payload); {{step.<stepId>.<path>}} reads a previous step's output " +
  "(speak-upload -> mediaId, magic-prompt -> answer, outbound-webhook -> status/response). " +
  "A positional {{step.<index>.<path>}} form also exists but is REFUSED on a branched automation: the index " +
  "counts stored order ([condition, true leg, false leg, merge]), not run order, and a step on the branch that " +
  "was not taken produces nothing — the token would resolve to an empty string inside whatever the step sends.";

// Push: a step that sends Speak's results to a connected app. The app list is not fixed here; it comes from the catalog.
const COMPOSIO_STEP_NOTE =
  "- composio-action -> composio: { app, action, connectedAccountId?, argsTemplate?, acknowledged? } — runs one " +
  "action in a connected third-party app (push: send Speak's results out, e.g. create a task, add a CRM note, post " +
  "a message). Any app and action that list_automation_actions returns for the account can be used: app is the " +
  "app slug, action is the action slug, argsTemplate fills the action's configSchema (tokens allowed). " +
  "connectedAccountId picks one of the app's connected accounts when there are several. " +
  "Actions marked requiresConfirmation (riskKind send, post, share or delete) reach other people or cannot be " +
  "undone: the API refuses to save them unless the step carries acknowledged: true, set by the automation " +
  "owner. Never set acknowledged on your own: describe the app, the action and what it will send to the user, " +
  "and set it only after they confirm. If a teammate later changes a confirmed step, the confirmation is cleared " +
  "and the automation turns off until the owner confirms again. toolkitVersion and confirmation are set by the " +
  "server and are ignored if sent; confirmVersion is set by this tool. Third-party app steps may be unavailable on " +
  "some accounts.\n";

const STEPS_DESCRIPTION =
  "Ordered array of graph steps (1-20). Each step is an object: " +
  "{ stepId: string (unique within the array), stepType: one of " +
  "\"speak-upload\" | \"magic-prompt\" | \"translation\" | \"filter\" | \"condition\" | \"notify\" | " +
  "\"outbound-webhook\" | \"composio-action\", " +
  "dependsOn?: string[] (stepIds this step runs after), " +
  "branch?: \"true\"|\"false\" (which outcome of an upstream condition step this step belongs to) } " +
  "plus ONE config key matching stepType:\n" +
  "- speak-upload -> speakUpload: { sourceMode: \"url\"|\"file\", " +
  "sourceUrl (required when sourceMode=\"url\"; tokens allowed — if the token resolves to an object, the first http(s) URL inside it is used), " +
  "folderId (required, unless folderRouting.mode=\"dynamic\" where it becomes the optional fallback), " +
  "name? (tokens allowed, mixable with static text), language? (language code or token), " +
  "fieldsMap?: { <customFieldId>: \"<value>\" } (writes payload values into Speak custom fields on the uploaded media; " +
  "values are usually {{trigger.payload.<path>}} tokens — get field ids from list_fields), " +
  "folderRouting?: { mode: \"static\"|\"dynamic\", sourceKey (payload key holding the destination folder name, required when dynamic), " +
  "onNoMatch: \"create\"|\"default\" (create a folder named after the value, or fall back to folderId) } }\n" +
  "- magic-prompt -> magicPrompt: { prompt (required unless fieldIds given, max 20000), title?, " +
  "assistantType? (\"general\"|\"researcher\"|\"marketer\"|\"sales\"|\"recruiter\"|\"custom\", default \"general\"), " +
  "assistantTemplateId? (required if assistantType=\"custom\"), fieldIds?: string[] (max 10 — extract answers into these custom fields), " +
  "analysisInput? (\"transcript\" (default) | \"audio\" | \"video\") — what the model receives. \"audio\" lets it hear tone and delivery, " +
  "\"video\" also lets it see what is on screen; on a video file \"audio\" extracts the audio track first. " +
  "Premium: requires the account's audio/video analysis opt-in, and costs credits per hour of media }\n" +
  "- translation -> translation: { targetLanguage: region-qualified locale code, e.g. \"es-ES\", \"fr-FR\" (bare codes like \"es\" are rejected) }\n" +
  "- filter -> filter: { logic: \"AND\"|\"OR\" (default \"AND\"), rules: [{ field, op, value? }] (1-20) } — " +
  "the run continues only when the rules match, otherwise it stops silently\n" +
  "- condition -> condition: same { logic, rules } shape as filter, but instead of stopping it routes: " +
  "downstream steps marked branch:\"true\"/\"false\" run according to the outcome.\n" +
  "  Branch wiring rules, all enforced before the request is sent:\n" +
  "  * A leg is a CHAIN: the first step of a leg depends on the condition, the rest depend on the step " +
  "before them in the same leg, and every step on the leg carries the same branch marker.\n" +
  "  * A step that runs after the branch (a merge) depends on the LAST step of every leg that carries on. " +
  "When a leg is empty its last step IS the condition, and the merge then carries that leg's marker.\n" +
  "  * A leg ends the run simply by having nothing depend on its last step.\n" +
  "  * Once anything carries a branch marker, EVERY other step needs a dependsOn — a step with no parents is " +
  "an entry point and runs on both branches, and a second entry point is rejected.\n" +
  "  * A condition with no steps on either side is rejected: both paths would do the same thing.\n" +
  "  * Branches nest at most three deep, and a nested condition must be the last step of the leg it sits on, " +
  "or the automation cannot be reopened in the Speak web editor.\n" +
  "  * A scheduled automation cannot branch: a schedule runs over a batch and a condition resolves once for the " +
  "whole batch, so the leg would run against media that did not match. Use a filter, which narrows the batch.\n" +
  "- notify -> notify: { channel: \"in_app\"|\"email\"|\"slack\", target?, message (required, tokens allowed) }\n" +
  "- outbound-webhook -> outboundWebhook: { url (required, tokens allowed), method? (\"GET\"|\"POST\"|\"PUT\"|\"PATCH\"|\"DELETE\", default \"POST\"), " +
  "headers?: { <name>: <value> }, bodyTemplate?: string | object (tokens allowed) }\n" +
  COMPOSIO_STEP_NOTE +
  "Filter/condition rule fields depend on what flows into the step: MEDIA -> name|duration|sourceLanguage|tags|transcript|speakers " +
  "or a custom field id; INSIGHT (straight after a magic-prompt step) -> answer only, so put a branch on a media " +
  "field BEFORE the AI step. Neither a filter nor a condition can read the inbound webhook payload — they see the " +
  "media and earlier step answers only — so a payload path such as \"contact.status\" is refused: upload first with " +
  "speakUpload.fieldsMap to write that value into a custom field, then test the field id instead. " +
  "Ops by field type — text: eq|neq|contains|ncontains|startsWith|exists; number: eq|neq|gt|lt|exists; array: contains|ncontains|exists " +
  "(\"exists\" takes no value; gt/lt values are numbers).\n" +
  TOKEN_SYNTAX_NOTE;

// Pull: a connected app's event brings something into Speak.
const COMPOSIO_TRIGGER_NOTE =
  "- Third-party app event (pull: something in a connected app starts the automation and can bring a file into " +
  "Speak): { type: \"composio\", provider: \"composio\", app, triggerSlug, connectedAccountId, triggerConfig? }. " +
  "Use any app and trigger slug that list_automation_triggers returns; triggerConfig fills that trigger's " +
  "configSchema. A trigger marked fileBearing hands a file to the steps: start the steps with a speak-upload step " +
  "using sourceMode \"file\" to import it as a recording. New-email triggers (Gmail, Outlook) need at least one " +
  "filter (from, subjectContains, or the advanced Gmail query); audio and video attachments are imported as " +
  "recordings (importAttachments, default true) and the email body is saved as a text note only when " +
  "saveBodyAsNote is true. The app is watched only while the automation is on. A trigger that is checked on a " +
  "schedule (call, meeting and survey apps such as Aircall, Quo or Gong) cannot be combined with Or triggers. " +
  "Imports use credits like uploads; credits are checked when the automation is created switched on, turned on, " +
  "or saved with changed triggers while it stays on, " +
  "and one automation imports at most 50 files an hour; extra items wait for the next hour. If the connection " +
  "expires the automation turns off, and items that arrive while it is off are not imported.\n";

const TRIGGER_DESCRIPTION =
  "Trigger object (the automation's root). Always include triggerSlug. Supported shapes:\n" +
  "- Media analyzed in folder(s): { type: \"folders\", triggerSlug: \"media_analyzed\", folderIds: string[] (min 1) }\n" +
  "- Inbound webhook (receive external payloads): { type: \"folders\", triggerSlug: \"inbound_webhook\", " +
  "webhookId? (from provision_inbound_webhook; omit to auto-provision a new one on create), " +
  "childKey? (dot-path narrowing which part of the payload feeds the automation, e.g. \"data\") }. " +
  "The create/update response includes inboundWebhook.inboundUrl — the public URL to POST payloads to.\n" +
  "- Custom field updated: { type: \"folders\", triggerSlug: \"field_updated\", values: string[] (watched custom field ids, min 1), " +
  "fieldValueMatches?: [{ fieldId, values: string[] }] (fire only when the field changes TO one of these values; empty values = any change), " +
  "fieldMatchLogic?: \"AND\"|\"OR\" (how multiple fieldValueMatches combine, default \"OR\") }\n" +
  COMPOSIO_TRIGGER_NOTE +
  "Notes: \"tags\"/\"keywords\" trigger types are rejected for graph automations. The server stores inbound-webhook " +
  "triggers with type \"webhook\" internally — send type \"folders\" plus the slug as shown above.";

const OR_TRIGGERS_DESCRIPTION =
  "Optional additional \"Or\" triggers (max 10): the automation runs when ANY of them fires, sharing the same steps. " +
  "Each entry mirrors the trigger shapes above but cannot be an inbound webhook and carries no webhookId/childKey. " +
  "Example: [{ type: \"folders\", triggerSlug: \"field_updated\", values: [\"<fieldId>\"] }]";

const LINKED_AUTOMATION_DESCRIPTION =
  "Id of another automation in the account to link this one with; an empty string unlinks. Email and file intake " +
  "is two linked automations: the intake (an app trigger, then a speak-upload step into a folder) and the act " +
  "automation (trigger media_analyzed on that same folder, an AI step, then the app action). The partner is linked " +
  "back automatically, linking replaces an older pairing, and deleting either one unlinks the other.";

const writeSchema = {
  name: z.string().min(1).max(150).describe("Display name for the automation"),
  trigger: z.record(z.string(), z.unknown()).describe(TRIGGER_DESCRIPTION),
  triggers: z
    .array(z.record(z.string(), z.unknown()))
    .max(10)
    .optional()
    .describe(OR_TRIGGERS_DESCRIPTION),
  steps: z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .max(20)
    .describe(STEPS_DESCRIPTION),
  description: z.string().max(1000).optional().describe("Optional description"),
  linkedAutomationId: z
    .string()
    .max(64)
    .optional()
    .describe(LINKED_AUTOMATION_DESCRIPTION),
  isActive: z
    .boolean()
    .optional()
    .describe("Whether the automation is active (defaults to true)"),
  runType: z
    .enum(["instant", "schedule"])
    .optional()
    .describe("Run type: \"instant\" (default, runs on trigger) or \"schedule\" (cron)"),
  schedule: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Required when runType=\"schedule\": { timePeriod: \"today\"|\"yesterday\"|\"last7days\"|\"last14days\"|\"thisWeek\", repeatAt: string }",
    ),
} as const;

/** Does any magic-prompt step ask for a media pass? `transcript` and empty are the default and never gated. */
function stepsRequestMediaAnalysis(steps: unknown): boolean {
  if (!Array.isArray(steps)) return false;
  return steps.some((step) => {
    const magicPrompt = (step as { magicPrompt?: { analysisInput?: unknown } })?.magicPrompt;
    const input = magicPrompt?.analysisInput;
    return typeof input === "string" && (input === "audio" || input === "video");
  });
}

/**
 * Refuse a write that would be accepted and then silently ignored.
 *
 * The automations API does not check the company's multimodal opt-in — it validates the enum,
 * returns 200, and stores the value. At run time the gate fails and the step runs on the
 * transcript with no error, no skip reason and no charge, so the user sees an automation
 * configured for video that never once analyses video. Returns null when the write may proceed.
 */
async function refuseUngatedAnalysis(
  api: AxiosInstance,
  steps: unknown,
): Promise<{ content: { type: "text"; text: string }[]; isError: true } | null> {
  if (!stepsRequestMediaAnalysis(steps)) return null;
  // `unknown` proceeds: we could not ask, and refusing on a failed probe would break accounts
  // that do have the feature.
  if ((await multimodalCapability(api)) !== "disabled") return null;
  return {
    content: [{ type: "text", text: `Error: ${MULTIMODAL_DISABLED_MESSAGE}` }],
    isError: true,
  };
}

/**
 * Refuse a graph the server would accept and then run wrongly, or reject with a message
 * that names a rule rather than the problem.
 *
 * Three gates disagree about what a legal branched automation is: the save gate rejects
 * some shapes, the web editor rejects others the server stores happily, and a third group
 * passes both and misbehaves at run time. A caller writing through MCP passes through none
 * of the editor's checks, so the whole rule set runs here. Returns null when the write may
 * proceed; warnings are non-blocking and ride along with the success payload.
 */
function refuseInvalidGraph(
  steps: unknown,
  trigger: unknown,
  runType: unknown,
): { content: { type: "text"; text: string }[]; isError: true } | null {
  if (!Array.isArray(steps)) return null;
  const triggerSlug = (trigger as { triggerSlug?: unknown })?.triggerSlug;
  const { errors } = validateGraph(steps as unknown as WireStep[], {
    triggerSlug: typeof triggerSlug === "string" ? triggerSlug : undefined,
    runType: typeof runType === "string" ? runType : undefined,
  });
  if (!errors.length) return null;
  return {
    content: [
      {
        type: "text" as const,
        text:
          `Error: this automation cannot be saved as described.\n\n` +
          errors.map((e) => `- ${e}`).join("\n"),
      },
    ],
    isError: true as const,
  };
}

/**
 * Non-blocking notes about a graph that will save but has a sharp edge — a merge whose
 * branches carry different data, or a step id that a Composio arg template reads as text.
 */
function graphWarnings(steps: unknown, trigger: unknown, runType: unknown): string[] {
  if (!Array.isArray(steps)) return [];
  const triggerSlug = (trigger as { triggerSlug?: unknown })?.triggerSlug;
  return validateGraph(steps as unknown as WireStep[], {
    triggerSlug: typeof triggerSlug === "string" ? triggerSlug : undefined,
    runType: typeof runType === "string" ? runType : undefined,
  }).warnings;
}

type WriteBody = Record<string, unknown> & { steps?: unknown; trigger?: unknown; runType?: unknown };

// The API lists, and saves, actions outside its curated set only for clients that show the confirmation for every action.
const AUTOMATION_CONTRACT_HEADERS = { "x-speak-automation-contract": "2" };

/** Marks every app step as coming from a client that asks for the confirmation on every action. */
function withContractMarker(body: WriteBody): WriteBody {
  if (!Array.isArray(body.steps)) return body;
  const steps = body.steps.map((step) => {
    const s = step as { stepType?: unknown; composio?: Record<string, unknown> };
    return s?.stepType === "composio-action" && s.composio ? { ...s, composio: { ...s.composio, confirmVersion: 2 } } : step;
  });
  return { ...body, steps };
}

/** POST one automation and add what the server reply leaves out: the inbound webhook URL and graph warnings. */
async function createOne(api: AxiosInstance, body: WriteBody): Promise<unknown> {
  const result = await api.post("/v1/automations/", withContractMarker(body));
  let data: unknown = result.data;
  if (isInboundWebhookTrigger(body.trigger)) {
    data = await withInboundWebhookInfo(api, data, unwrapData(result.data)?.automationId);
  }
  const warnings = graphWarnings(body.steps, body.trigger, body.runType);
  return warnings.length && data && typeof data === "object" ? { ...(data as object), warnings } : data;
}

/** App display names for the reconnect pauses among these reasons; the reason itself carries only the app slug. */
async function reconnectAppNames(api: AxiosInstance, reasons: unknown[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const needed = reasons.some((reason) => (reason as { code?: unknown } | undefined)?.code === "needs_reconnect");
  if (!needed) return names;
  try {
    const result = await api.get("/v1/automations/catalog/apps");
    const apps = (unwrapData(result.data) as { apps?: Array<{ slug?: unknown; name?: unknown }> } | undefined)?.apps;
    for (const app of apps ?? []) {
      if (typeof app.slug === "string" && typeof app.name === "string") names.set(app.slug, app.name);
    }
  } catch {
    // Without the catalog the notice still reads correctly; it just says "the app" instead of its name.
  }
  return names;
}

function appNameFor(pausedReason: unknown, names: Map<string, string>): string | undefined {
  const provider = (pausedReason as { provider?: unknown } | undefined)?.provider;
  return typeof provider === "string" ? names.get(provider) : undefined;
}

/** Each listed automation that the server switched off gets the reason in words. */
async function withPausedNotices(api: AxiosInstance, responseData: unknown): Promise<unknown> {
  const data = responseData as { data?: { automationList?: unknown } } | undefined;
  const list = data?.data?.automationList;
  if (!Array.isArray(list)) return responseData;
  const names = await reconnectAppNames(api, list.map((automation) => automation?.pausedReason));
  const annotated = list.map((automation) => {
    const reason = automation?.pausedReason;
    const pausedNotice = describePause(reason, automation?.owner, appNameFor(reason, names));
    return pausedNotice ? { ...automation, pausedNotice } : automation;
  });
  return { ...data, data: { ...data!.data, automationList: annotated } };
}

/** The update reply carries pausedReason when the edit turned the automation off for its owner; say it in words. */
async function withPauseAfterUpdate(api: AxiosInstance, responseData: unknown): Promise<unknown> {
  if (!responseData || typeof responseData !== "object") return responseData;
  const pausedReason = (unwrapData(responseData) as { pausedReason?: unknown } | undefined)?.pausedReason;
  const names = await reconnectAppNames(api, [pausedReason]);
  const pausedNotice = describePause(pausedReason, undefined, appNameFor(pausedReason, names));
  return pausedNotice ? { ...(responseData as object), pausedNotice } : responseData;
}

/** Refuse an update that would carry an old confirmation onto a changed send, post, share or delete step. */
async function refuseStaleConfirmations(
  api: AxiosInstance,
  automationId: string,
  steps: unknown,
  confirmedStepIds: readonly string[] | undefined,
): Promise<{ content: { type: "text"; text: string }[]; isError: true } | null> {
  if (!hasConfirmedAppStep(steps)) return null;
  let savedSteps: unknown;
  try {
    const saved = await api.get(`/v1/automations/${automationId}`);
    savedSteps = (unwrapData(saved.data) as { steps?: unknown } | undefined)?.steps;
  } catch {
    // The save itself checks the confirmation again; a failed read here must not block it.
    return null;
  }
  const stale = staleConfirmations(steps, savedSteps, confirmedStepIds);
  if (!stale.length) return null;
  return {
    content: [
      {
        type: "text" as const,
        text:
          `Error: step(s) ${stale.map((id) => `"${id}"`).join(", ")} changed since the user confirmed them, but still ` +
          "carry composio.acknowledged: true from the saved copy.\n\n" +
          "errorCode: CONFIRMATION_REQUIRED\n" +
          "Next step: show the user the changed step (app, action and what it will send) and ask them to confirm it. " +
          "Once they agree, call update_automation again with those step ids in confirmedStepIds. " +
          "To save without confirming, remove acknowledged from those steps; the automation owner then confirms them in Speak.",
      },
    ],
    isError: true as const,
  };
}

/**
 * Recast a run detail as "which way did it go".
 *
 * The raw response is accurate but reads wrongly on a branched automation. A step whose
 * branch was not taken is persisted COMPLETED carrying only a `branchSkipped` marker, and
 * a filter that stops ONE leg ends the whole run as "killed" even when the other leg did
 * its work — so both the per-step status and the run status overstate or understate what
 * happened. This pulls out the three things a caller actually asked.
 */
function summariseBranching(data: unknown): Record<string, unknown> | undefined {
  const run = data as {
    status?: string;
    stoppedAt?: { stepId?: string; status?: string; reason?: string };
    steps?: Array<{
      stepId?: string;
      stepType?: string;
      status?: string;
      branchSkipped?: boolean;
      branch?: string;
      outputs?: { branch?: string; reason?: string };
    }>;
  };
  const steps = Array.isArray(run?.steps) ? run.steps : [];
  if (!steps.length) return undefined;

  const conditions = steps
    .filter((step) => step.stepType === "condition")
    .map((step) => ({
      stepId: step.stepId,
      took: step.outputs?.branch ?? "not reached",
    }));
  if (!conditions.length && !steps.some((step) => step.branchSkipped)) return undefined;

  const notTaken = steps.filter((step) => step.branchSkipped).map((step) => step.stepId);
  const ran = steps
    .filter((step) => !step.branchSkipped && step.status === "completed")
    .map((step) => step.stepId);

  const summary: Record<string, unknown> = {
    conditions,
    stepsThatRan: ran,
    stepsSkippedBecauseTheirBranchWasNotTaken: notTaken,
  };
  if (run.stoppedAt?.stepId) summary.stoppedAt = run.stoppedAt;
  // The one reading that is actively misleading, so it gets said in words.
  if (run.status === "killed" && ran.length) {
    summary.note =
      `The run is marked "killed" because a filter stopped one path, but ${ran.length} step(s) ran to completion first — ` +
      `a stopped leg ends the whole run's status, not its work.`;
  }
  return summary;
}

/**
 * After a create/update of an inbound-webhook automation, attach the bound
 * webhook's receive URL + mapping info to the response. The server's own
 * response is only `{ automationId, message }`, so without this the caller
 * has no way to learn where to POST payloads. Best-effort: any failure here
 * returns the original response untouched (the write itself succeeded).
 */
async function withInboundWebhookInfo(
  api: AxiosInstance,
  responseData: unknown,
  automationId: string | undefined,
): Promise<unknown> {
  try {
    if (!automationId) return responseData;
    const { webhookId, childKey } = await resolveAutomationInboundWebhook(api, automationId);
    if (!webhookId) return responseData;
    const inboundWebhook = await fetchInboundWebhookInfo(api, webhookId, childKey);
    const base =
      responseData && typeof responseData === "object" ? (responseData as object) : { data: responseData };
    return { ...base, inboundWebhook };
  } catch {
    return responseData;
  }
}

export function register(server: McpServer, client?: AxiosInstance, options: RegisterOptions = {}): void {
  if (!options.automations) return;
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "list_automations",
    "List automation rules in the workspace, with paging and filters. An automation the server switched off " +
      "(an app connection expired, or the owner must confirm a teammate's change) carries pausedReason and a " +
      "pausedNotice in plain words. Linked automations carry linkedAutomation ({ automationId, name, isActive }).",
    {
      page: z.number().int().min(0).optional().describe("0-based page index"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Results per page"),
      sortBy: z.string().optional().describe("Sort expression, e.g. \"createdAt:desc\""),
      query: z.string().optional().describe("Free-text search over automation names"),
      folderIds: z.string().optional().describe("Comma-separated folder ids to filter by"),
      isActive: z.boolean().optional().describe("Filter by active state"),
      runType: z.enum(["instant", "schedule"]).optional().describe("Filter by run type"),
    },
    {
      title: "List Automations",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/automations", { params });
        return {
          content: [{ type: "text", text: JSON.stringify(await withPausedNotices(api, result.data), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "list_automation_names",
    "List the names and ids of active automations that contain an AI chat (magic prompt) step. Inactive " +
      "automations and automations without an AI chat step are not included; use list_automations for the full list.",
    {},
    {
      title: "List Automation Names",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/automations/list");
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "get_automation",
    "Get detailed information about a specific automation rule, including its trigger and step graph. A " +
      "third-party app step shows composio.acknowledged: true when its send, post, share or delete action is " +
      "confirmed. When the automation is off because a connection expired or the owner must confirm a teammate's " +
      "change, the reply says so in pausedNotice. A linked automation shows linkedAutomationId and linkedAutomation " +
      "({ automationId, name, isActive }).",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
    },
    {
      title: "Get Automation Details",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ automationId }) => {
      try {
        const result = await api.get(`/v1/automations/${automationId}`);
        const saved = unwrapData(result.data) as { pausedReason?: unknown; owner?: unknown } | undefined;
        const names = await reconnectAppNames(api, [saved?.pausedReason]);
        const pausedNotice = describePause(saved?.pausedReason, saved?.owner, appNameFor(saved?.pausedReason, names));
        const data =
          pausedNotice && result.data && typeof result.data === "object"
            ? { ...(result.data as object), pausedNotice }
            : result.data;
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "get_automation_runs",
    "Get the run history (executions) for an automation, with paging and optional status filter.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
      page: z.number().int().min(0).optional().describe("0-based page index"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Results per page"),
      status: z
        .enum(["pending", "running", "completed", "failed", "killed"])
        .optional()
        .describe("Filter runs by status"),
    },
    {
      title: "Get Automation Runs",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ automationId, ...params }) => {
      try {
        const result = await api.get(`/v1/automations/${automationId}/runs`, { params });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "create_automation",
    "Create an automation: a trigger plus ordered steps (V2 graph model). The automation is active by default and " +
      "then runs on its own every time its trigger fires. Depending on its steps, each run can send email to any " +
      "address, post to the workspace's Slack, send HTTP requests to any webhook URL, fetch a file from a URL into " +
      "Speak, run actions in connected third-party apps through Composio. An inbound-webhook " +
      "trigger creates a public URL that accepts payloads (returned as inboundWebhook.inboundUrl). Connected apps " +
      "work both ways: an app trigger pulls something into Speak (for example an email attachment or a new file " +
      "becomes a recording), and an app action step pushes results out (for example a task, a CRM note or a " +
      "message). A Composio app-event trigger subscribes to events on the connected third-party account while the " +
      "automation is on. Valid apps, triggers and actions come from list_automation_apps, list_automation_triggers " +
      "and list_automation_actions. An action that sends, posts, shares or deletes needs composio.acknowledged: " +
      "true on its step, which you set only after the user confirms that exact action. To map inbound-webhook " +
      "payload fields, send a test payload to the URL with ?test=1, read the tokens with get_inbound_webhook, then " +
      "call update_automation.",
    {
      ...writeSchema,
      linkedAutomationBody: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "A second automation to create right after this one and link to it, with the same fields as this tool " +
            "(name, trigger, steps, ...). Use it for email or file intake: this automation is the intake, and " +
            "linkedAutomationBody is the act automation from suggest_automation_templates' linkedDraft. Both must use " +
            "the same folder: the intake's speak-upload folderId and the linked automation's trigger.folderIds.",
        ),
    },
    {
      title: "Create Automation",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ linkedAutomationBody, ...body }) => {
      try {
        // A template draft carries empty automationId and createdAt, which the API rejects as unknown fields.
        const { automationId: _draftId, createdAt: _draftCreated, ...linkedBody } = (linkedAutomationBody ?? {}) as WriteBody;
        const linked = linkedAutomationBody ? (linkedBody as WriteBody) : undefined;
        for (const candidate of linked ? [body, linked] : [body]) {
          const graphRefusal = refuseInvalidGraph(candidate.steps, candidate.trigger, candidate.runType);
          if (graphRefusal) return graphRefusal;
          const refusal = await refuseUngatedAnalysis(api, candidate.steps);
          if (refusal) return refusal;
        }

        const first = await createOne(api, body);
        if (!linked) return { content: [{ type: "text", text: JSON.stringify(first, null, 2) }] };

        const firstId = unwrapData(first)?.automationId as string | undefined;
        if (!firstId) {
          return {
            content: [
              {
                type: "text",
                text:
                  "Error: the first automation was saved but the reply carried no automationId, so the linked one was " +
                  `not created. Find it with list_automations and create the linked one with its linkedAutomationId.\n\n${JSON.stringify(first, null, 2)}`,
              },
            ],
            isError: true,
          };
        }
        try {
          const second = await createOne(api, { ...linked, linkedAutomationId: firstId });
          return {
            content: [{ type: "text", text: JSON.stringify({ automation: first, partnerAutomation: second }, null, 2) }],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text:
                  `Error: the first automation was created (automationId ${firstId}), but the linked one was not: ` +
                  `${formatAutomationError(err)}\n\nFix the linked automation and call create_automation for it alone ` +
                  `with linkedAutomationId "${firstId}".`,
              },
            ],
            isError: true,
          };
        }
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAutomationError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "update_automation",
    "Update an existing automation rule. This replaces the whole automation (name, trigger, and steps), " +
      "so fetch the current values with get_automation first and pass them all back with your changes. " +
      "The saved steps run automatically on later triggers and can send email, post to Slack, call webhook URLs, " +
      "and run actions in connected third-party apps. Changing a Composio app-event trigger updates the " +
      "subscription on that third-party account. A step that sends, posts, shares or deletes keeps its " +
      "confirmation only while it is unchanged: if you change such a step, show the user the new version and list " +
      "its stepId in confirmedStepIds once they confirm it. This check here only compares the step's own app, " +
      "action, account and arguments; the server's check is wider (it also covers the steps a confirmed step " +
      "depends on) and is the one that decides. If someone other than the owner changes a confirmed step, the " +
      "automation is saved but turned off until the owner confirms that step again, and the reply says so in " +
      "pausedNotice.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
      ...writeSchema,
      confirmedStepIds: z
        .array(z.string().min(1))
        .max(20)
        .optional()
        .describe(
          "Step ids of changed send, post, share or delete steps that the user has just confirmed in their new form. " +
            "A changed step that still carries composio.acknowledged: true from get_automation is refused unless it is listed here.",
        ),
    },
    {
      title: "Update Automation",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ automationId, confirmedStepIds, ...body }) => {
      try {
        const graphRefusal = refuseInvalidGraph(body.steps, body.trigger, body.runType);
        if (graphRefusal) return graphRefusal;
        const refusal = await refuseUngatedAnalysis(api, body.steps);
        if (refusal) return refusal;
        const staleRefusal = await refuseStaleConfirmations(api, automationId, body.steps, confirmedStepIds);
        if (staleRefusal) return staleRefusal;

        const result = await api.put(`/v1/automations/${automationId}`, withContractMarker(body));
        let data: unknown = await withPauseAfterUpdate(api, result.data);
        if (isInboundWebhookTrigger(body.trigger)) {
          data = await withInboundWebhookInfo(api, data, automationId);
        }
        const warnings = graphWarnings(body.steps, body.trigger, body.runType);
        if (warnings.length && data && typeof data === "object") {
          data = { ...(data as object), warnings };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAutomationError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "toggle_automation_status",
    "Toggle an automation rule between active and inactive. This flips the current state, so call get_automation " +
      "first if you need to know which way it will flip. An active automation runs on its own every time its trigger " +
      "fires, and its steps can send email, post to Slack, call webhook URLs, and run actions in connected third-party " +
      "apps. For a Composio app-event trigger, this also creates or removes the event subscription on the connected " +
      "third-party account. Turning on an automation that is off for a reason is refused until the reason is fixed: " +
      "an expired app connection must be reconnected (RECONNECT_REQUIRED), a teammate's change to a step that " +
      "sends from the owner's account must be confirmed by the owner (OWNER_RECONFIRM_REQUIRED), and a trigger " +
      "that imports files needs credits left on the account (OUT_OF_CREDITS). Turning on one of two linked " +
      "automations while its partner is off succeeds with a warning: tell the user, because nothing acts on what " +
      "the intake brings in until the partner is on too.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
    },
    {
      title: "Toggle Automation Status",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ automationId }) => {
      try {
        const result = await api.put(`/v1/automations/status/${automationId}`);
        const warning = (result.data as { warning?: unknown } | undefined)?.warning;
        const text = JSON.stringify(result.data, null, 2);
        return {
          content: [{ type: "text", text: typeof warning === "string" ? `Warning: ${warning}\n\n${text}` : text }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAutomationError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "bulk_update_automation_status",
    "Activate or deactivate multiple automations at once. An active automation runs on its own every time its " +
      "trigger fires, and its steps can send email, post to Slack, call webhook URLs, and run actions in connected " +
      "third-party apps. For Composio app-event triggers, this also creates or removes the event subscription on the " +
      "connected third-party account. Automations that cannot be turned on yet come back in failed[] with an " +
      "errorCode and the next step. An automation turned on while its linked partner stays off is listed in " +
      "warnings[] ({ automationId, warning }); tell the user.",
    {
      automationIds: z
        .array(z.string().min(1))
        .min(1)
        .max(100)
        .describe("Automation ids to update"),
      isActive: z.boolean().describe("true to activate, false to deactivate, for all listed automations"),
    },
    {
      title: "Bulk Update Automation Status",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.put("/v1/automations/bulk/status", body);
        return {
          content: [{ type: "text", text: JSON.stringify(withFailedNextSteps(result.data), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAutomationError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "bulk_assign_automation_folders",
    "Set the folder scope for multiple automations at once. Pass an empty folderIds array to remove the folder restriction (run on all folders).",
    {
      automationIds: z
        .array(z.string().min(1))
        .min(1)
        .max(100)
        .describe("Automation ids to update"),
      folderIds: z
        .array(z.string().min(1))
        .max(50)
        .describe("Folder ids to scope the automations to. Empty array = all folders."),
    },
    {
      title: "Bulk Assign Automation Folders",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.put("/v1/automations/bulk/folders", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "run_automations",
    "Manually run one or more automations against one or more media items now (outside the normal trigger). " +
      "Only active automations run; inactive or unknown automation ids and unknown media ids are skipped without " +
      "an error. The runs happen in the background and this returns only an acknowledgement, so check results " +
      "with get_automation_runs. Every step executes for real: it can send email, post to Slack, call webhook " +
      "URLs, and run actions in connected third-party apps.",
    {
      mediaIds: z.array(z.string().min(1)).min(1).describe("Media ids to run the automations against"),
      automationIds: z.array(z.string().min(1)).min(1).describe("Automation ids to run"),
    },
    {
      title: "Run Automations",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/automations/run", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "delete_automation",
    "Permanently delete an automation rule. If it has an inbound webhook URL, that URL stops accepting payloads, " +
      "and any event subscription it holds on a connected third-party account through Composio is removed.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation to delete"),
    },
    {
      title: "Delete Automation",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ automationId }) => {
      try {
        const result = await api.delete(`/v1/automations/${automationId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "get_automation_run",
    "Get one automation run in full: every step, in dependency order, with what it produced and why it stopped. " +
      "Use this after test_automation or to explain a run that went the wrong way. On a branched automation the " +
      "run's overall status is not the whole story — a filter that stops one leg marks the entire run \"killed\" " +
      "even when the other leg finished its work — so read the per-step summary this returns, not just the status.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
      runId: z.string().min(1).describe("Run id, from get_automation_runs or test_automation"),
    },
    {
      title: "Get Automation Run",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ automationId, runId }) => {
      try {
        const result = await api.get(`/v1/automations/${automationId}/runs/${runId}`);
        const data = unwrapData(result.data) ?? result.data;
        return {
          content: [
            { type: "text", text: JSON.stringify({ ...data, branchSummary: summariseBranching(data) }, null, 2) },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "get_automation_run_stats",
    "Aggregate run counts for an automation over a period — how many completed, failed, or were stopped.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe(
          "How many days back to count, 1-90. The run ledger is kept for 90 days, so that is the whole window.",
        ),
    },
    {
      title: "Get Automation Run Stats",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ automationId, ...params }) => {
      try {
        const result = await api.get(`/v1/automations/${automationId}/runs/stats`, { params });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "test_automation",
    "Run one automation once against one media item to see which way it branches. This is a real run, not a " +
      "dry run, and it works on inactive automations too. Only the run's own status notifications are suppressed " +
      "and translation steps are skipped. Notify steps still send their email or Slack message, outbound webhooks " +
      "still fire, and Composio actions still run against the connected third-party account. " +
      "Confirm with the user before testing an automation that sends anything outside Speak. " +
      "It needs a mediaId and sends no webhook payload, so on an inbound-webhook automation the payload tokens " +
      "resolve to empty. Returns a runId; read the result with get_automation_run.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation to test"),
      mediaId: z.string().min(1).describe("Media item to run the automation against"),
    },
    {
      title: "Test Automation",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.post(`/v1/automations/${body.automationId}/test-run`, {
          mediaId: body.mediaId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "validate_automation_graph",
    "Check a step graph without saving anything. Reports the same problems create_automation and " +
      "update_automation would refuse — branch wiring, rules a condition cannot actually read, shapes the Speak " +
      "web editor could not reopen — plus non-blocking warnings. Use it to iterate on a branched automation " +
      "instead of discovering the problems one failed save at a time.",
    {
      steps: z.array(z.record(z.string(), z.unknown())).min(1).describe(STEPS_DESCRIPTION),
      trigger: z.record(z.string(), z.unknown()).optional().describe(TRIGGER_DESCRIPTION),
      runType: z
        .enum(["instant", "schedule"])
        .optional()
        .describe("Run type the graph would be saved with. A schedule refuses any branch."),
    },
    {
      title: "Validate Automation Graph",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ steps, trigger, runType }) => {
      const triggerSlug = (trigger as { triggerSlug?: unknown } | undefined)?.triggerSlug;
      const { errors, warnings } = validateGraph(steps as unknown as WireStep[], {
        triggerSlug: typeof triggerSlug === "string" ? triggerSlug : undefined,
        runType,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                valid: errors.length === 0,
                errors,
                warnings,
                shape: describeGraph(steps as unknown as WireStep[]),
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  );

  registerSpeakTool(server,
    "describe_automation_graph",
    "Show a saved automation's steps as an indented branch tree instead of a flat list. " +
      "Worth calling before update_automation, which replaces the whole automation: editing one leg means " +
      "re-sending every step with its dependsOn intact, and this shows what the shape currently is.",
    {
      automationId: z.string().min(1).describe("Unique identifier of the automation"),
    },
    {
      title: "Describe Automation Graph",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ automationId }) => {
      try {
        const result = await api.get(`/v1/automations/${automationId}`);
        const data = unwrapData(result.data) ?? result.data;
        const steps = (data as { steps?: unknown })?.steps;
        if (!Array.isArray(steps) || !steps.length) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { automationId, shape: null, note: "This automation has no graph steps (it may be a legacy single-action rule)." },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        const triggerSlug = (data as { trigger?: { triggerSlug?: unknown } })?.trigger?.triggerSlug;
        const { errors, warnings } = validateGraph(steps as unknown as WireStep[], {
          triggerSlug: typeof triggerSlug === "string" ? triggerSlug : undefined,
          runType: (data as { runType?: string })?.runType,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  automationId,
                  name: (data as { name?: string })?.name,
                  runType: (data as { runType?: string })?.runType,
                  shape: describeGraph(steps as unknown as WireStep[]),
                  steps,
                  // A stored automation can predate a rule, or have been written through the
                  // raw API. Saying so here is cheaper than a failed round-trip on re-save.
                  problemsIfResaved: errors,
                  warnings,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "list_automation_apps",
    "List the apps in Speak's automation catalog: Speak's built-in apps plus, when enabled, every third-party app " +
      "available through Composio, with its connection state and connected accounts for this user. Each app says " +
      "what it brings in (pull: its triggers start an automation and can import files) and what it sends out " +
      "(push: its actions take Speak's results). Read-only: the list comes from Speak's own catalog and the user's " +
      "saved connections. Use the app slugs with list_automation_triggers and list_automation_actions. An app that " +
      "is not connected must be connected in the Speak web app first.",
    {
      for: z
        .enum(["trigger", "action"])
        .optional()
        .describe(
          "\"trigger\" lists only apps that can start an automation (pull), \"action\" only apps that can take its results (push). Omit for all apps.",
        ),
    },
    {
      title: "List Automation Apps",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/automations/catalog/apps", { params });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "list_automation_triggers",
    "List the triggers available in the automation catalog, optionally for one app: Speak's own triggers plus " +
      "every trigger of the connected third-party apps (pull). Each trigger has a slug, a configSchema for its " +
      "triggerConfig, outputPaths that later steps can read as {{trigger.payload.<path>}} tokens, and fileBearing " +
      "when it brings a file to import as a recording. Read-only: listing a trigger does not subscribe to it.",
    {
      app: z.string().min(1).max(100).optional().describe("App slug from list_automation_apps"),
    },
    {
      title: "List Automation Triggers",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/automations/catalog/triggers", { params });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "list_automation_actions",
    "List the step types (actions) available in Speak's automation catalog, optionally for one app slug, plus the " +
      "fields each filter or condition step can test. For a third-party app this includes every action it offers " +
      "(push), each with a configSchema for the step's argsTemplate, a group, and requiresConfirmation with a " +
      "riskKind (send, post, share or delete) when the step needs composio.acknowledged: true before it can be " +
      "saved. Deprecated actions are marked; pick a replacement. An action the flow cannot feed carries needsInput " +
      "({ reason, hint, next }): after an email or file trigger, next is create_folder_automation, which means " +
      "import with speak-upload here and act in a linked folder automation (see create_automation's " +
      "linkedAutomationBody). Read-only: listing an action does not run it.",
    {
      app: z.string().min(1).max(100).optional().describe("App slug from list_automation_apps"),
      q: z
        .string()
        .max(100)
        .optional()
        .describe(
          "Search action names, descriptions and groups, e.g. \"create task\". Without app it searches every connected app.",
        ),
      afterTrigger: z
        .string()
        .max(200)
        .optional()
        .describe(
          "Slug of the trigger the step will follow, so each action's needsInput hint fits what that trigger brings.",
        ),
    },
    {
      title: "List Automation Actions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/automations/catalog/actions", { params, headers: AUTOMATION_CONTRACT_HEADERS });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "suggest_automation_templates",
    "Suggest ready-made automations for a From app (where work starts) and a To app (where results go). Use app " +
      "slugs from list_automation_apps, or speak for Speak itself. Each suggestion has a status and, when ready, a " +
      "draft to adapt and save with create_automation; the draft leaves the folder empty for you to fill. An email " +
      "or file app paired with an app that takes results is two linked automations: draft is the intake (the " +
      "trigger, then speak-upload into a folder) and linkedDraft acts on it (media analysed in that folder, an AI " +
      "step, then the action). Put the one folder the user picks in the intake's speak-upload folderId and in " +
      "linkedDraft's trigger.folderIds, then call create_automation with the intake and linkedAutomationBody set to " +
      "linkedDraft. Read-only: nothing is created.",
    {
      from: z.string().min(1).max(100).optional().describe("App slug where the work starts, or speak"),
      to: z.string().min(1).max(100).optional().describe("App slug where the results go, or speak"),
    },
    {
      title: "Suggest Automation Templates",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/automations/catalog/templates/picker", { params });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );
}
