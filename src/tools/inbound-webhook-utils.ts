import { AxiosInstance } from "axios";

/**
 * Helpers for the inbound-webhook automation flow. Not a tool module — imported
 * by automations.ts and webhooks.ts so both surface the same receive-URL and
 * payload-mapping info the web canvas gets from GET /v1/webhook/:id.
 */

/** Unwrap the server's `{ status, data }` success envelope, defensively. */
export function unwrapData(payload: unknown): any {
  const p = payload as any;
  return p && typeof p === "object" && "status" in p && "data" in p ? p.data : p;
}

export interface InboundWebhookInfo {
  webhookId: string;
  /** Public receive URL — POST payloads here to fire the automation. */
  inboundUrl: string | null;
  /** Whether a sample payload has been captured (mapping paths are only known after one). */
  sampleCaptured: boolean;
  samplePayload: unknown;
  /** Ready-to-paste tokens for step configs, narrowed by the trigger childKey. */
  mappableTokens: string[];
  childKey?: string;
  howToUse: string[];
}

/**
 * Narrow flattened payload paths through the trigger's childKey (mirrors the web
 * canvas): "data.contact.email" with childKey "data" -> "contact.email". The server
 * falls back to the full body when childKey doesn't resolve on a delivery, so if
 * nothing matches we surface the un-narrowed paths rather than none.
 */
export function narrowPathsToChildKey(paths: string[], childKey?: string): string[] {
  if (!childKey) return paths;
  const prefix = `${childKey}.`;
  const narrowed = paths
    .filter((p) => p.startsWith(prefix))
    .map((p) => p.slice(prefix.length))
    .filter(Boolean);
  return narrowed.length ? narrowed : paths;
}

function buildHowToUse(inboundUrl: string | null, sampleCaptured: boolean): string[] {
  const url = inboundUrl ?? "<inboundUrl>";
  const lines = [
    `Send events with: curl -X POST '${url}' -H 'Content-Type: application/json' -d '{"url": "https://example.com/file.mp3", "name": "My recording"}'`,
    `To capture/refresh a sample payload WITHOUT running the automation, POST to '${url}?test=1'.`,
    "Reference payload values in step configs with {{trigger.payload.<path>}} tokens — see mappableTokens.",
  ];
  if (!sampleCaptured) {
    lines.unshift(
      "No sample payload captured yet — send a test request first (see below) so payload paths become discoverable for mapping, then call get_inbound_webhook again.",
    );
  }
  return lines;
}

/** Fetch an inbound webhook's receive URL + captured sample and shape it for mapping. */
export async function fetchInboundWebhookInfo(
  api: AxiosInstance,
  webhookId: string,
  childKey?: string,
): Promise<InboundWebhookInfo> {
  const res = await api.get(`/v1/webhook/${webhookId}`);
  const payload = unwrapData(res.data);
  const wh = payload?.webhookData ?? payload ?? {};
  const flattened: string[] = Array.isArray(wh.flattenedPaths) ? wh.flattenedPaths : [];
  const sample = wh.samplePayload ?? null;
  const sampleCaptured =
    sample != null && (typeof sample !== "object" || Object.keys(sample).length > 0);
  const inboundUrl = typeof wh.inboundUrl === "string" ? wh.inboundUrl : null;
  return {
    webhookId,
    inboundUrl,
    sampleCaptured,
    samplePayload: sample,
    mappableTokens: narrowPathsToChildKey(flattened, childKey).map(
      (p) => `{{trigger.payload.${p}}}`,
    ),
    ...(childKey ? { childKey } : {}),
    howToUse: buildHowToUse(inboundUrl, sampleCaptured),
  };
}

/** Resolve the bound inbound webhookId + childKey from an automation's trigger. */
export async function resolveAutomationInboundWebhook(
  api: AxiosInstance,
  automationId: string,
): Promise<{ webhookId?: string; childKey?: string }> {
  const res = await api.get(`/v1/automations/${automationId}`);
  const automation = unwrapData(res.data);
  const trigger = automation?.trigger ?? {};
  return {
    webhookId:
      typeof trigger.webhookId === "string" && trigger.webhookId ? trigger.webhookId : undefined,
    childKey:
      typeof trigger.childKey === "string" && trigger.childKey ? trigger.childKey : undefined,
  };
}

/** True when a create/update body describes an inbound-webhook automation. */
export function isInboundWebhookTrigger(trigger: unknown): boolean {
  const t = trigger as Record<string, unknown> | undefined;
  return (
    !!t &&
    (t.triggerSlug === "inbound_webhook" || t.type === "webhook" || !!t.webhookId)
  );
}
