import axios from "axios";
import { formatAxiosError } from "../client.js";

// Shared by every automation write so a refused app step always comes back with the same code and next step.

/** Stable codes for the refusals around third-party app steps. */
export type AutomationAppErrorCode =
  | "confirmation_required"
  | "action_not_allowed"
  | "app_check_unavailable"
  | "awaiting_owner_confirmation"
  | "needs_reconnect";

interface KnownRefusal {
  code: AutomationAppErrorCode;
  /** Matches the API's message when the response carries no errorCode of its own. */
  message: RegExp;
  nextStep: string;
}

const KNOWN_REFUSALS: KnownRefusal[] = [
  {
    code: "confirmation_required",
    message: /tick the confirmation on the step/i,
    nextStep:
      "This step sends, posts, shares or deletes something outside Speak. Tell the user which app, which action " +
      "and what it will send, and ask them to confirm. Only after they agree, set composio.acknowledged: true on " +
      "that step and save again. Only the automation owner's confirmation counts.",
  },
  {
    code: "action_not_allowed",
    message: /is not an action speak automations can run/i,
    nextStep:
      "Pick the action from list_automation_actions for that app, and use the app slug the action belongs to.",
  },
  {
    code: "app_check_unavailable",
    message: /could not check this action with the app right now/i,
    nextStep: "The app could not be reached to check the action. Nothing was saved; try again in a minute.",
  },
  {
    code: "awaiting_owner_confirmation",
    message: /owner has to confirm it again/i,
    nextStep:
      "A teammate changed a step that sends from the owner's account, so the automation is off until the owner " +
      "confirms that step again. The owner opens the automation and saves it with composio.acknowledged: true " +
      "on that step, then turns it on.",
  },
  {
    code: "needs_reconnect",
    message: /^reconnect .+ to turn this automation on/i,
    nextStep:
      "The app's connection expired or was removed. Reconnect the app on Speak's Integrations page; that turns " +
      "the automation back on. Items that arrived while it was off are not imported.",
  },
];

function responseBody(error: unknown): Record<string, unknown> | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const data = error.response?.data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
}

/** The refusal behind an automations API error, by its errorCode when present, else by its message. */
export function classifyAutomationAppError(error: unknown): KnownRefusal | undefined {
  const body = responseBody(error);
  if (!body) return undefined;
  const errorCode = typeof body.errorCode === "string" ? body.errorCode : undefined;
  if (errorCode) {
    const byCode = KNOWN_REFUSALS.find((refusal) => refusal.code === errorCode);
    if (byCode) return byCode;
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  return message ? KNOWN_REFUSALS.find((refusal) => refusal.message.test(message)) : undefined;
}

/** formatAxiosError, plus a stable code and the next step for the refusals around app steps. */
export function formatAutomationError(error: unknown): string {
  const base = formatAxiosError(error);
  const refusal = classifyAutomationAppError(error);
  if (!refusal) return base;
  return `${base}\n\nerrorCode: ${refusal.code}\nNext step: ${refusal.nextStep}`;
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
export function describePause(pausedReason: unknown): string | undefined {
  const reason = pausedReason as { code?: unknown; provider?: unknown; stepId?: unknown } | undefined;
  if (!reason || typeof reason.code !== "string") return undefined;
  if (reason.code === "awaiting_owner_confirmation") {
    const step = typeof reason.stepId === "string" ? ` (step "${reason.stepId}")` : "";
    return (
      `Off until the owner confirms again: a teammate changed a step that sends from the owner's account${step}. ` +
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
