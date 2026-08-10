/**
 * Per-company capability lookup.
 *
 * Multimodal (audio/video) analysis is a premium feature gated on the company. The chat
 * endpoint enforces it — an ungated account gets a 400. The automations endpoint does NOT:
 * it accepts `magicPrompt.analysisInput`, returns 200, persists the value, and then at run
 * time quietly ignores it. No error, no skip reason, no charge. The web client is shielded
 * because it renders step config from the action catalog, which omits the field for ungated
 * accounts. An MCP client does not render from the catalog, so this module is the only thing
 * standing between a user and an automation that claims to analyse video and never does.
 */

import type { AxiosInstance } from "axios";

/**
 * `unknown` is not a failure state to guard against — it means we could not ask. Treating it
 * as "disabled" would break every account whenever the profile call is slow or the shape
 * changes, refusing work the server would have accepted. Callers must let `unknown` through.
 */
export type Capability = "enabled" | "disabled" | "unknown";

/** Long enough that a session does not re-ask constantly, short enough that enabling the feature takes effect without a restart. */
const TTL_MS = 10 * 60 * 1000;

let cached: { value: Capability; expiresAt: number } | null = null;

/** Test seam. The cache is module-level, so a suite that does not clear it leaks across cases. */
export function __resetCapabilityCache(): void {
  cached = null;
}

/**
 * Is multimodal analysis enabled for the account behind the API key?
 *
 * Sourced from `GET /v1/user/profile`, which carries `isMultimodalAnalysis` precisely so a
 * client does not need a second request. Caveat worth knowing: that field reflects only the
 * per-company opt-in, NOT the server's global kill switch. If the global switch is off the
 * profile still reports true and runs fail anyway. `GET /v1/prompt/analysisQuote` is the only
 * endpoint that reflects both, which is why the quote — not this — decides an actual run.
 * This exists to answer "should we let the user configure it at all".
 */
export async function multimodalCapability(api: AxiosInstance): Promise<Capability> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: Capability = "unknown";
  try {
    const res = await api.get("/v1/user/profile");
    const flag = res.data?.data?.isMultimodalAnalysis;
    if (typeof flag === "boolean") value = flag ? "enabled" : "disabled";
  } catch {
    // Swallowed on purpose: a capability probe must never turn into a tool error. An
    // unreachable profile endpoint leaves `unknown`, which lets the call proceed.
  }

  // `unknown` is cached too, briefly — otherwise a persistent outage means every automation
  // write pays for a failed probe first.
  cached = { value, expiresAt: Date.now() + TTL_MS };
  return value;
}

/** Copy shown when an automation step would be saved but never run. */
export const MULTIMODAL_DISABLED_MESSAGE =
  "Audio and video analysis is not enabled for this account. " +
  "The step would be saved but would silently run on the transcript only, so it is refused here. " +
  "Remove analysisInput from the step, or contact Speak AI to enable the feature.";
