import axios from "axios";
import { formatAxiosError } from "../client.js";

// Shared by every automation write so a refused app step always comes back with the same code and next step.

/** The API's errorCode values for refused app steps and refused turn-ons. */
export type AutomationAppErrorCode =
  | "CONFIRMATION_REQUIRED"
  | "ACTION_NOT_ALLOWED"
  | "CATALOG_UNAVAILABLE"
  | "OWNER_RECONFIRM_REQUIRED"
  | "RECONNECT_REQUIRED"
  | "OUT_OF_CREDITS";

interface KnownRefusal {
  code: AutomationAppErrorCode;
  /** Older API versions send no errorCode, so their message text identifies the refusal. */
  message?: RegExp;
  nextStep: string;
}

const KNOWN_REFUSALS: KnownRefusal[] = [
  {
    code: "CONFIRMATION_REQUIRED",
    message: /tick the confirmation on the step/i,
    nextStep:
      "This step sends, posts, shares or deletes something outside Speak. Tell the user which app, which action " +
      "and what it will send, and ask them to confirm. Only after they agree, set composio.acknowledged: true on " +
      "that step and save again. Only the automation owner's confirmation counts.",
  },
  {
    code: "ACTION_NOT_ALLOWED",
    message: /is not an action speak automations can run/i,
    nextStep:
      "Pick the action from list_automation_actions for that app, and use the app slug the action belongs to.",
  },
  {
    code: "CATALOG_UNAVAILABLE",
    message: /could not check this action with the app right now/i,
    nextStep: "The app could not be reached to check the action. Nothing was saved; try again in a minute.",
  },
  {
    code: "OWNER_RECONFIRM_REQUIRED",
    message: /owner has to confirm it again/i,
    nextStep:
      "A teammate changed a step that sends from the owner's account, so the automation is off until the owner " +
      "confirms that step again. The owner saves the automation with composio.acknowledged: true on that step, " +
      "then turns it on.",
  },
  {
    code: "RECONNECT_REQUIRED",
    message: /^reconnect .+ to turn this automation on/i,
    nextStep:
      "The app's connection expired or was removed. Reconnect the app on Speak's Integrations page; that turns " +
      "the automation back on. Items that arrived while it was off are not imported.",
  },
  {
    code: "OUT_OF_CREDITS",
    nextStep:
      "The trigger imports files or notes and the account has no credits left. Nothing was turned on; to keep the " +
      "draft, save it with isActive: false. Ask the user to add credits or upgrade in the Speak web app, then turn it on.",
  },
];

/** A refusal by the API's own errorCode, else, for older API versions, by its message text. */
export function classifyAutomationRefusal(
  errorCode: unknown,
  message: unknown,
): { code: string; nextStep?: string } | undefined {
  if (typeof errorCode === "string" && errorCode) {
    const known = KNOWN_REFUSALS.find((refusal) => refusal.code === errorCode);
    return { code: errorCode, nextStep: known?.nextStep };
  }
  const text = typeof message === "string" ? message.trim() : "";
  const byText = text ? KNOWN_REFUSALS.find((refusal) => refusal.message?.test(text)) : undefined;
  return byText ? { code: byText.code, nextStep: byText.nextStep } : undefined;
}

/** formatAxiosError, plus the refusal's errorCode and the next step for app steps and turn-ons. */
export function formatAutomationError(error: unknown): string {
  const base = formatAxiosError(error);
  if (!axios.isAxiosError(error)) return base;
  const body = error.response?.data as { errorCode?: unknown; message?: unknown } | undefined;
  const refusal = body && typeof body === "object" ? classifyAutomationRefusal(body.errorCode, body.message) : undefined;
  if (!refusal) return base;
  return `${base}\n\nerrorCode: ${refusal.code}` + (refusal.nextStep ? `\nNext step: ${refusal.nextStep}` : "");
}

/** The bulk turn-on reports refused automations in failed[]; each gets the same next step as the single toggle. */
export function withFailedNextSteps(responseData: unknown): unknown {
  const data = responseData as { data?: { failed?: unknown } } | undefined;
  const failed = data?.data?.failed;
  if (!Array.isArray(failed)) return responseData;
  const annotated = failed.map((entry) => {
    const refusal = classifyAutomationRefusal(entry?.errorCode, entry?.message);
    return refusal?.nextStep ? { ...entry, nextStep: refusal.nextStep } : entry;
  });
  return { ...data, data: { ...data!.data, failed: annotated } };
}

interface ComposioStepConfig {
  app?: unknown;
  action?: unknown;
  connectedAccountId?: unknown;
  argsTemplate?: unknown;
  acknowledged?: unknown;
}

interface StepLike {
  stepId?: unknown;
  stepType?: unknown;
  composio?: ComposioStepConfig;
}

const COMPOSIO_STEP_TYPE = "composio-action";

function isConfirmedAppStep(step: unknown): step is StepLike & { stepId: string } {
  const s = step as StepLike | undefined;
  return (
    !!s &&
    s.stepType === COMPOSIO_STEP_TYPE &&
    typeof s.stepId === "string" &&
    s.composio?.acknowledged === true
  );
}

/** Key order must not make two equal argument maps look different. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** What a confirmation covers on the step itself: the app, the action, the account and the arguments. */
function confirmedPart(composio: ComposioStepConfig | undefined): string {
  return stableJson({
    app: composio?.app ?? "",
    action: composio?.action ?? "",
    connectedAccountId: composio?.connectedAccountId ?? "",
    argsTemplate: composio?.argsTemplate ?? {},
  });
}

// get_automation returns acknowledged: true, so a read-modify-write would re-confirm changed arguments the user never saw.
export function staleConfirmations(
  requestedSteps: unknown,
  savedSteps: unknown,
  confirmedStepIds: readonly string[] = [],
): string[] {
  if (!Array.isArray(requestedSteps) || !Array.isArray(savedSteps)) return [];
  const savedById = new Map<string, StepLike>();
  for (const step of savedSteps) {
    const s = step as StepLike;
    if (typeof s?.stepId === "string") savedById.set(s.stepId, s);
  }
  const reconfirmed = new Set(confirmedStepIds);
  return requestedSteps
    .filter(isConfirmedAppStep)
    .filter((step) => {
      const saved = savedById.get(step.stepId);
      if (!saved || saved.stepType !== COMPOSIO_STEP_TYPE) return false;
      return confirmedPart(saved.composio) !== confirmedPart(step.composio) && !reconfirmed.has(step.stepId);
    })
    .map((step) => step.stepId);
}

export function hasConfirmedAppStep(steps: unknown): boolean {
  return Array.isArray(steps) && steps.some(isConfirmedAppStep);
}

/** Plain words for a saved automation's pausedReason, when the API returns one. */
export function describePause(pausedReason: unknown, owner?: unknown): string | undefined {
  const reason = pausedReason as { code?: unknown; provider?: unknown; stepId?: unknown } | undefined;
  if (!reason || typeof reason.code !== "string") return undefined;
  if (reason.code === "awaiting_owner_confirmation") {
    const step = typeof reason.stepId === "string" ? ` (step "${reason.stepId}")` : "";
    const ownerName = (owner as { name?: unknown } | undefined)?.name;
    const who = typeof ownerName === "string" && ownerName ? `the owner, ${ownerName},` : "the owner";
    return (
      `Off until ${who} confirms again: a teammate changed a step that sends from the owner's account${step}. ` +
      "Only the owner can confirm it and turn the automation back on."
    );
  }
  if (reason.code === "needs_reconnect") {
    const app = typeof reason.provider === "string" ? reason.provider : "the app";
    return (
      `Off because the connection to ${app} expired or was removed. Reconnecting it on the Integrations page ` +
      "turns the automation back on. Items that arrived while it was off are not imported."
    );
  }
  return undefined;
}
