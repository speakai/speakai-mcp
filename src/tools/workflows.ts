import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";
import { MediaType } from "@speakai/shared";
import * as fs from "fs";
import * as path from "path";
import {
  getMimeType,
  isVideoFile,
  detectMediaType,
  mediaTypeFromUrl,
  SUPPORTED_URL_SOURCES,
  UNSUPPORTED_URL_SOURCES,
} from "../media-utils.js";
import { MULTIMODAL_DISABLED_MESSAGE, multimodalCapability } from "../capabilities.js";
import {
  fetchInboundWebhookInfo,
  resolveAutomationInboundWebhook,
  unwrapData,
} from "./inbound-webhook-utils.js";

// ---------------------------------------------------------------------------
// build_automation — high-level automation builder
// ---------------------------------------------------------------------------

type Dict = Record<string, unknown>;

/**
 * Convert friendly value shorthand into the server's token syntax:
 * - "payload.contact.email" -> "{{trigger.payload.contact.email}}"
 * - strings already containing {{...}} pass through untouched
 * - everything else is a literal
 */
function tokenize(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.includes("{{")) return value;
  if (value.startsWith("payload.")) return `{{trigger.payload.${value.slice("payload.".length)}}}`;
  return value;
}

/** Built-in filter/condition rule fields that must not be resolved as custom fields. */
const CANONICAL_FILTER_FIELDS = new Set([
  "name", "duration", "sourceLanguage", "tags", "transcript", "speakers", "answer",
  // server-side aliases
  "title", "language", "speakersCount",
]);

interface FolderEntry { folderId: string; name: string }
interface FieldEntry { id: string; name: string }

async function loadFolders(api: AxiosInstance): Promise<FolderEntry[]> {
  const res = await api.get("/v1/folder", { params: { pageSize: 500 } });
  const data = unwrapData(res.data) ?? {};
  const list = data.folderList ?? data.folders ?? (Array.isArray(data) ? data : []);
  return (list as Dict[]).map((f) => ({
    folderId: String(f.folderId ?? f.id ?? ""),
    name: String(f.name ?? ""),
  }));
}

async function loadFields(api: AxiosInstance): Promise<FieldEntry[]> {
  const res = await api.get("/v1/fields");
  const data = unwrapData(res.data) ?? [];
  return (data as Dict[]).map((f) => ({
    id: String(f.id ?? ""),
    name: String(f.name ?? ""),
  }));
}

/** Speak public ids (folders, media, automations) are 12 lowercase hex chars. */
const ID_PATTERN = /^[0-9a-f]{12}$/;

/** Resolve a folder reference (id or name, case-insensitive); create it when missing. */
async function resolveFolder(
  api: AxiosInstance,
  ref: string,
  folders: FolderEntry[],
  createdFolders: string[],
): Promise<string> {
  const byId = folders.find((f) => f.folderId === ref);
  if (byId) return byId.folderId;
  const byName = folders.find((f) => f.name.toLowerCase() === ref.toLowerCase());
  if (byName) return byName.folderId;
  // A ref that looks like a folder id but matches nothing is almost certainly a
  // typo'd id — creating a folder literally named "f990ec4b40ca" helps nobody.
  if (ID_PATTERN.test(ref)) {
    throw new Error(`Folder id "${ref}" not found in this workspace (and it looks like an id, so it was not created as a folder name)`);
  }
  const res = await api.post("/v1/folder", { name: ref });
  const folderId = unwrapData(res.data)?.folderId;
  if (!folderId) throw new Error(`Could not create folder "${ref}"`);
  folders.push({ folderId, name: ref });
  createdFolders.push(`${ref} (${folderId})`);
  return folderId;
}

/** Resolve a custom-field reference (id or name, case-insensitive); throws with the available names. */
function resolveField(ref: string, fields: FieldEntry[]): string {
  const byId = fields.find((f) => f.id === ref);
  if (byId) return byId.id;
  const byName = fields.find((f) => f.name.toLowerCase() === ref.toLowerCase());
  if (byName) return byName.id;
  const available = fields.map((f) => f.name).slice(0, 25).join(", ");
  throw new Error(`Unknown custom field "${ref}". Available fields: ${available || "(none — create one with create_field)"}`);
}

const TRIGGER_SPEC_DESCRIPTION =
  "What starts the automation. Object with:\n" +
  "- on (required): \"media_analyzed\" | \"inbound_webhook\" | \"field_updated\"\n" +
  "- folders: array of folder names or ids (required for media_analyzed; missing folders are created)\n" +
  "- childKey: dot-path narrowing the webhook payload root, e.g. \"data\" (inbound_webhook only)\n" +
  "- webhookId: reuse a webhook from provision_inbound_webhook (inbound_webhook only; omit to auto-provision)\n" +
  "- watchFields: array of { field: name-or-id, values?: string[] } (required for field_updated — fires when the " +
  "field changes; values restricts to specific new values)\n" +
  "- matchLogic: \"AND\"|\"OR\" for combining multiple watchFields value matches (default OR)";

const STEP_SPEC_DESCRIPTION =
  "Ordered actions. Each step is an object with a `do` key plus its options. String values may be literals, " +
  "\"payload.<path>\" shorthand (converted to {{trigger.payload.<path>}} only when it is the ENTIRE value), or raw " +
  "{{...}} tokens — inside longer text, write the full {{trigger.payload.<path>}} form.\n" +
  "- { do: \"filter\", rules: [{ field, op, value? }], logic?: \"AND\"|\"OR\" } — continue only if rules match. " +
  "Fields: media flows use name|duration|sourceLanguage|tags|transcript|speakers or a custom field name; " +
  "webhook payloads use payload paths like \"contact.status\". Ops: eq|neq|contains|ncontains|startsWith|gt|lt|exists\n" +
  "- { do: \"branch\", rules, logic? } — like filter but routes instead of stopping; later steps with " +
  "runWhen: \"true\"|\"false\" only run on that outcome. NOTE: branch routing requires the server's DAG runner " +
  "(feature-flagged); when it is off, steps run in order and runWhen markers are ignored — prefer filter for " +
  "guaranteed gating\n" +
  "- { do: \"upload\", source (URL or payload.<path>, required), name?, language? (e.g. \"en-US\"), " +
  "folder? (name or id; created if missing), folderFromPayload? (payload key holding the destination folder name " +
  "— dynamic routing), onNoFolderMatch?: \"create\"|\"default\", mapFields?: { <field name or id>: <value or payload.<path>> } " +
  "(writes payload values into custom fields on the uploaded media) }\n" +
  "- { do: \"ai_chat\", prompt? (required unless saveToFields given), title?, saveToFields?: [field names or ids] " +
  "(max 10 — values are extracted into these custom fields; prompt may be omitted for extraction-only steps), " +
  "model? (a Speak-supported LLM id, e.g. \"gemini-2.5-flash\", \"claude-sonnet-4-6\"; omit for the workspace default), " +
  "analyse?: \"transcript\" (default) | \"audio\" | \"video\" — what the model receives. \"audio\" lets it hear tone and " +
  "delivery, \"video\" also lets it see the screen; on a video file \"audio\" extracts the audio track first. Premium: " +
  "requires the account's audio/video analysis opt-in and costs credits per hour of media }\n" +
  "- { do: \"translate\", language: region-qualified code like \"es-ES\", \"fr-FR\" }\n" +
  "- { do: \"notify\", message (required, tokens allowed), channel?: \"in_app\"|\"email\"|\"slack\" (default in_app; " +
  "email currently falls back to an in-app notification), target? (reserved — not yet used for delivery) }\n" +
  "- { do: \"call_webhook\", url (required), method?, headers?, body? (string or object template, tokens allowed) }\n" +
  "Steps may also set runWhen (after a branch step). Composio app actions (Google Drive, Slack apps, …) are not " +
  "supported by this builder yet — use create_automation directly for those.";

/** Input shape for build_automation after zod validation. */
interface BuildAutomationArgs {
  name: string;
  trigger: Dict;
  steps: Dict[];
  automationId?: string;
  description?: string;
  isActive?: boolean;
  orTriggers?: Dict[];
}

// Typed loosely (z.ZodRawShape) on purpose: the fully-inferred generic for this
// schema blows past TypeScript's instantiation-depth limit at the
// registerSpeakTool call site. Validation behavior is unchanged.
const buildAutomationSchema: z.ZodRawShape = {
  name: z.string().min(1).max(150).describe("Display name for the automation"),
  trigger: z.record(z.unknown()).describe(TRIGGER_SPEC_DESCRIPTION),
  steps: z.array(z.record(z.unknown())).min(1).max(20).describe(STEP_SPEC_DESCRIPTION),
  automationId: z
    .string()
    .optional()
    .describe("Update this existing automation instead of creating a new one (full replace)"),
  description: z.string().max(1000).optional().describe("Optional description"),
  isActive: z.boolean().optional().describe("Whether the automation is active (default true)"),
  orTriggers: z
    .array(z.record(z.unknown()))
    .max(10)
    .optional()
    .describe(
      "Additional \"Or\" triggers (same shape as trigger, but inbound_webhook is not allowed here). " +
        "The automation runs when ANY trigger fires.",
    ),
};

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "build_automation",
    "High-level automation builder: create (or update) a Speak automation from a friendly spec without knowing the " +
      "wire format. Accepts folder/custom-field NAMES (resolved to ids; missing folders are auto-created), " +
      "payload.<path> shorthand for webhook tokens, and simple step types (filter, branch, upload, ai_chat, " +
      "translate, notify, call_webhook). For inbound-webhook automations the result includes the receive URL and " +
      "mappable payload tokens. Prefer this over create_automation unless you need raw control.",
    buildAutomationSchema,
    {
      title: "Build Automation",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (args: unknown) => {
      const { name, trigger, steps, automationId, description, isActive, orTriggers } =
        args as BuildAutomationArgs;
      const createdFolders: string[] = [];
      // Payload-path fields used in FILTER steps on the webhook DATA flow —
      // hoisted so the catch block can translate the server's misleading 403.
      const dataFlowFilterFields: string[] = [];
      try {
        // Lazy catalogs — fetched at most once each, only when something needs resolving.
        let folders: FolderEntry[] | null = null;
        let fields: FieldEntry[] | null = null;
        const getFolders = async () => (folders ??= await loadFolders(api));
        const getFields = async () => (fields ??= await loadFields(api));

        const buildTrigger = async (spec: Dict, allowWebhook: boolean): Promise<Dict> => {
          const on = String(spec.on ?? "");
          // provider/app/folderIds always present — matches the web canvas's
          // trigger envelope exactly (graph-mapper sends them on every trigger).
          if (on === "media_analyzed") {
            const refs = (spec.folders as string[]) ?? [];
            if (!refs.length) throw new Error("media_analyzed trigger requires `folders` (names or ids)");
            const folderIds: string[] = [];
            for (const ref of refs) folderIds.push(await resolveFolder(api, String(ref), await getFolders(), createdFolders));
            return { type: "folders", provider: "speak", app: "speak", triggerSlug: "media_analyzed", folderIds };
          }
          if (on === "inbound_webhook") {
            if (!allowWebhook) throw new Error("inbound_webhook cannot be used as an Or-trigger — make it the primary trigger");
            const t: Dict = { type: "folders", provider: "speak", app: "speak", triggerSlug: "inbound_webhook", folderIds: [] };
            if (spec.webhookId) t.webhookId = spec.webhookId;
            if (spec.childKey) t.childKey = spec.childKey;
            return t;
          }
          if (on === "field_updated") {
            const watch = (spec.watchFields as Array<Dict>) ?? [];
            if (!watch.length) throw new Error("field_updated trigger requires `watchFields`: [{ field, values? }]");
            const fieldList = await getFields();
            const values: string[] = [];
            const fieldValueMatches: Dict[] = [];
            for (const w of watch) {
              const fieldId = resolveField(String(w.field), fieldList);
              values.push(fieldId);
              if (Array.isArray(w.values) && w.values.length) {
                fieldValueMatches.push({ fieldId, values: w.values.map(String) });
              }
            }
            const t: Dict = { type: "folders", provider: "speak", app: "speak", triggerSlug: "field_updated", folderIds: [], values };
            if (fieldValueMatches.length) t.fieldValueMatches = fieldValueMatches;
            if (spec.matchLogic === "AND") t.fieldMatchLogic = "AND";
            return t;
          }
          throw new Error(`Unknown trigger \`on\`: "${on}". Use media_analyzed, inbound_webhook, or field_updated.`);
        };

        const isWebhookAutomation = trigger.on === "inbound_webhook";

        // Custom-field rules are only valid while MEDIA is flowing; on a DATA
        // flow (webhook payload before any upload) rule fields are payload
        // paths. Mirror the server's per-step flow tracking so a filter after
        // an upload step in a webhook automation still gets names resolved.
        const buildRules = async (rules: Array<Dict>, flowing: string, isFilterStep: boolean): Promise<Dict[]> => {
          const out: Dict[] = [];
          for (const r of rules) {
            let field = String(r.field ?? "");
            if (flowing === "media" && !CANONICAL_FILTER_FIELDS.has(field) && !field.includes(".")) {
              field = resolveField(field, await getFields());
            } else if (isFilterStep && flowing === "data" && !CANONICAL_FILTER_FIELDS.has(field)) {
              // Only FILTER steps are subject to the server's field-ownership check.
              dataFlowFilterFields.push(field);
            }
            const op = String(r.op ?? "eq");
            const rule: Dict = { field, op };
            if (r.value !== undefined) {
              // gt/lt compare numerically — coerce like the web canvas does.
              rule.value =
                (op === "gt" || op === "lt") && Number.isFinite(Number(r.value))
                  ? Number(r.value)
                  : r.value;
            }
            out.push(rule);
          }
          return out;
        };

        // ---- steps ----
        const wireSteps: Dict[] = [];
        let lastBranchStepId: string | null = null;
        // IO type flowing into the next step (the server's catalog contract).
        let flowing = isWebhookAutomation ? "data" : "media";
        for (let i = 0; i < steps.length; i++) {
          const spec = steps[i] as Dict;
          const stepId = `s${i + 1}`;
          const doType = String(spec.do ?? "");
          const step: Dict = { stepId };
          if (spec.runWhen === "true" || spec.runWhen === "false") {
            if (!lastBranchStepId) throw new Error(`Step ${i + 1}: runWhen requires an earlier branch step`);
            step.branch = spec.runWhen;
            step.dependsOn = [lastBranchStepId];
          }

          if (doType === "filter" || doType === "branch") {
            step.stepType = doType === "filter" ? "filter" : "condition";
            const block = {
              logic: spec.logic === "OR" ? "OR" : "AND",
              rules: await buildRules((spec.rules as Array<Dict>) ?? [], flowing, doType === "filter"),
            };
            step[doType === "filter" ? "filter" : "condition"] = block;
            if (doType === "branch") lastBranchStepId = stepId;
            // passthrough: flowing type unchanged
          } else if (doType === "upload") {
            if (!spec.source) throw new Error(`Step ${i + 1} (upload): \`source\` is required (URL or payload.<path>)`);
            const upload: Dict = {
              sourceMode: "url",
              sourceUrl: tokenize(spec.source),
              // Always defer until the uploaded media is PROCESSED so downstream
              // steps (ai_chat, translate) see the transcript — the web canvas
              // hardcodes this too.
              waitForProcessing: true,
            };
            if (spec.name) upload.name = tokenize(spec.name);
            if (spec.language) upload.language = tokenize(spec.language);
            if (spec.folderFromPayload) {
              // sourceKey must be a {{trigger.payload.*}} token (the canvas always
              // stores tokens; a bare key does not resolve at run time). Accept
              // "clinicName", "payload.clinicName", or a full token.
              const rawKey = String(spec.folderFromPayload);
              const sourceKey = rawKey.includes("{{")
                ? rawKey
                : `{{trigger.payload.${rawKey.startsWith("payload.") ? rawKey.slice("payload.".length) : rawKey}}}`;
              upload.folderRouting = {
                mode: "dynamic",
                sourceKey,
                onNoMatch: spec.onNoFolderMatch === "default" ? "default" : "create",
              };
              if (spec.folder) upload.folderId = await resolveFolder(api, String(spec.folder), await getFolders(), createdFolders);
            } else {
              if (!spec.folder) throw new Error(`Step ${i + 1} (upload): provide \`folder\` (name or id) or \`folderFromPayload\``);
              upload.folderId = await resolveFolder(api, String(spec.folder), await getFolders(), createdFolders);
            }
            if (spec.mapFields && typeof spec.mapFields === "object") {
              const fieldList = await getFields();
              const fieldsMap: Dict = {};
              for (const [ref, value] of Object.entries(spec.mapFields as Dict)) {
                if (value !== null && typeof value === "object") {
                  throw new Error(`Step ${i + 1} (upload): mapFields["${ref}"] must be a string or number, not an object`);
                }
                // The server's fieldsMap validation requires string values.
                fieldsMap[resolveField(ref, fieldList)] = tokenize(String(value));
              }
              if (Object.keys(fieldsMap).length) upload.fieldsMap = fieldsMap;
            }
            step.stepType = "speak-upload";
            step.speakUpload = upload;
            flowing = "media";
          } else if (doType === "ai_chat") {
            const hasSaveToFields = Array.isArray(spec.saveToFields) && spec.saveToFields.length > 0;
            if (!spec.prompt && !hasSaveToFields) {
              throw new Error(`Step ${i + 1} (ai_chat): provide \`prompt\`, \`saveToFields\`, or both`);
            }
            const magicPrompt: Dict = { prompt: spec.prompt ?? "", assistantType: "general" };
            if (spec.title) magicPrompt.title = spec.title;
            if (spec.model) magicPrompt.modelId = spec.model;
            if (spec.analyse || spec.analyze) {
              // Two spellings because the model picks either; the wire name is analysisInput.
              const analysis = String(spec.analyse ?? spec.analyze);
              if (!["transcript", "audio", "video"].includes(analysis)) {
                throw new Error(
                  `Step ${i + 1} (ai_chat): analyse must be "transcript", "audio" or "video", got "${analysis}"`,
                );
              }
              // transcript is the default; sending it would persist a key that means nothing.
              if (analysis !== "transcript") magicPrompt.analysisInput = analysis;
            }
            if (Array.isArray(spec.saveToFields) && spec.saveToFields.length) {
              if (spec.saveToFields.length > 10) {
                throw new Error(`Step ${i + 1} (ai_chat): saveToFields supports at most 10 fields`);
              }
              const fieldList = await getFields();
              magicPrompt.fieldIds = (spec.saveToFields as string[]).map((ref) => resolveField(String(ref), fieldList));
            }
            step.stepType = "magic-prompt";
            step.magicPrompt = magicPrompt;
            flowing = "insight";
          } else if (doType === "translate") {
            if (!spec.language) throw new Error(`Step ${i + 1} (translate): \`language\` is required (e.g. "es-ES")`);
            step.stepType = "translation";
            step.translation = { targetLanguage: spec.language };
            flowing = "media";
          } else if (doType === "notify") {
            if (!spec.message) throw new Error(`Step ${i + 1} (notify): \`message\` is required`);
            const channel = spec.channel === undefined ? "in_app" : String(spec.channel);
            if (!["in_app", "email", "slack"].includes(channel)) {
              throw new Error(`Step ${i + 1} (notify): channel must be "in_app", "email", or "slack" (got "${channel}")`);
            }
            const notify: Dict = { channel, message: tokenize(spec.message) };
            if (spec.target) notify.target = String(spec.target);
            step.stepType = "notify";
            step.notify = notify;
            flowing = "data";
          } else if (doType === "call_webhook") {
            if (!spec.url) throw new Error(`Step ${i + 1} (call_webhook): \`url\` is required`);
            const method = spec.method === undefined ? "POST" : String(spec.method).toUpperCase();
            if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
              throw new Error(`Step ${i + 1} (call_webhook): method must be GET, POST, PUT, PATCH, or DELETE (got "${spec.method}")`);
            }
            const outbound: Dict = {
              url: tokenize(spec.url),
              method,
            };
            if (spec.headers && typeof spec.headers === "object") outbound.headers = spec.headers;
            if (spec.body !== undefined) {
              outbound.bodyTemplate = typeof spec.body === "string" ? tokenize(spec.body) : spec.body;
            }
            step.stepType = "outbound-webhook";
            step.outboundWebhook = outbound;
            flowing = "data";
          } else {
            throw new Error(
              `Step ${i + 1}: unknown \`do\`: "${doType}". Use filter, branch, upload, ai_chat, translate, notify, or call_webhook.`,
            );
          }
          wireSteps.push(step);
        }

        // ---- assemble + send ----
        const body: Dict = {
          name,
          trigger: await buildTrigger(trigger as Dict, true),
          steps: wireSteps,
        };
        if (description) body.description = description;
        if (isActive !== undefined) body.isActive = isActive;
        if (orTriggers?.length) {
          const entries: Dict[] = [];
          for (const spec of orTriggers) entries.push(await buildTrigger(spec as Dict, false));
          body.triggers = entries;
        }

        // Same gate as create_automation/update_automation: the server accepts analysisInput
        // from an ungated account and then silently ignores it at run time.
        if (
          wireSteps.some((s) => {
            const input = (s as { magicPrompt?: { analysisInput?: unknown } })?.magicPrompt?.analysisInput;
            return input === "audio" || input === "video";
          }) &&
          (await multimodalCapability(api)) === "disabled"
        ) {
          return {
            content: [{ type: "text" as const, text: `Error: ${MULTIMODAL_DISABLED_MESSAGE}` }],
            isError: true as const,
          };
        }

        const result = automationId
          ? await api.put(`/v1/automations/${automationId}`, body)
          : await api.post("/v1/automations/", body);
        const resolvedId = unwrapData(result.data)?.automationId ?? automationId;

        const response: Dict = {
          ...(typeof result.data === "object" ? result.data : { data: result.data }),
        };
        if (createdFolders.length) response.createdFolders = createdFolders;

        if (isWebhookAutomation && resolvedId) {
          try {
            const resolved = await resolveAutomationInboundWebhook(api, resolvedId);
            if (resolved.webhookId) {
              response.inboundWebhook = await fetchInboundWebhookInfo(api, resolved.webhookId, resolved.childKey);
            }
          } catch {
            // Best-effort — the automation itself was saved.
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        let message = formatAxiosError(err);
        // The server's publish-time ownership check mistakes payload-path
        // filter fields (valid on webhook DATA flows per its own graph
        // validator) for custom-field ids and rejects them with a misleading
        // 403 — translate it into something actionable.
        if (dataFlowFilterFields.length && message.includes("fieldIds do not belong")) {
          message +=
            `\n\nLikely cause: this server rejects filter rules on webhook payload fields ` +
            `(${dataFlowFilterFields.join(", ")}) at publish time (known server-side validation gap). ` +
            `Workarounds: move the filter AFTER the upload step and filter on media/custom fields instead, ` +
            `or filter in the sending system before it posts to the webhook.`;
        }
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  registerSpeakTool(server,
    "upload_and_analyze",
    `Upload and transcribe media from a URL — a direct/public file URL, OR a shareable social/video page link, which Speak resolves to the underlying media automatically. Supported page links: ${SUPPORTED_URL_SOURCES}. ${UNSUPPORTED_URL_SOURCES} Returns media_id immediately; after this returns, poll get_media_status until state is 'processed' (typically 1-3 min for under 60min audio), then call get_media_insights for AI summaries. This async pattern is required for remote MCP transports — long blocking calls die at proxy idle timeouts.`,
    {
      url: z.string().describe(`Direct/public media file URL, or a shareable social/video page link — page links are resolved to the underlying media server-side. Accepts links from: ${SUPPORTED_URL_SOURCES}. Pass the URL the user gave you as-is; do not try to convert it to a file URL first.`),
      name: z.string().optional().describe("Display name for the media (defaults to filename from URL)"),
      mediaType: z.enum([MediaType.AUDIO, MediaType.VIDEO] as [string, ...string[]]).optional().describe('Type of media: "audio" or "video". Omit for a social/video page link (recommended) — the server picks the best available track for that platform. Set it only when the URL has no usable extension and you know which you want; a video labelled "audio" here can never be analysed as video.'),
      sourceLanguage: z.string().optional().describe("BCP-47 language code (e.g., 'en-US', 'he-IL')"),
      folderId: z.string().optional().describe("Folder ID to place the media in"),
      tags: z.string().optional().describe("Comma-separated tags"),
    },
    {
      title: "Upload and Analyze Media",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (params) => {
      try {
        // Upload only — do not block on processing.
        // Remote MCP transports (Claude.ai web, ChatGPT) sit behind proxies
        // (CloudFront / ALB / Anthropic edge) whose idle timeouts kill long
        // synchronous calls before processing finishes. Return media_id and
        // let the caller poll get_media_status.
        // Send mediaType only when the caller chose one or the URL's extension proves it.
        // Defaulting a page link to "audio" is indistinguishable, server-side, from a caller
        // who asked for audio — which is how YouTube videos were imported audio-only.
        const mediaType = params.mediaType ?? mediaTypeFromUrl(params.url);

        const uploadBody: Record<string, unknown> = {
          name: params.name ?? params.url.split("/").pop()?.split("?")[0] ?? "Upload",
          url: params.url,
        };
        if (mediaType) uploadBody.mediaType = mediaType;
        if (params.sourceLanguage) uploadBody.sourceLanguage = params.sourceLanguage;
        if (params.folderId) uploadBody.folderId = params.folderId;
        if (params.tags) uploadBody.tags = params.tags;

        const uploadRes = await api.post("/v1/media/upload", uploadBody);
        const mediaId = uploadRes.data?.data?.mediaId;
        const state = uploadRes.data?.data?.state ?? "pending";

        if (!mediaId) {
          return {
            content: [{ type: "text", text: `Error: Upload succeeded but no mediaId returned.\n${JSON.stringify(uploadRes.data, null, 2)}` }],
            isError: true,
          };
        }

        const result = {
          mediaId,
          state,
          message: "Upload accepted. Processing has started in the background.",
          nextSteps: [
            `1. Poll get_media_status with mediaId="${mediaId}" every 10-30 seconds.`,
            `2. When state is "processed" (typically 1-3 min for audio under 60 min), call get_media_insights for the AI summary and get_transcript for the full transcript.`,
            `3. If state becomes "failed", processing did not complete — surface the error to the user.`,
          ],
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
    "upload_local_file",
    [
      "Upload a local file to Speak AI for transcription and analysis.",
      "Reads the file from disk, gets a pre-signed S3 URL, uploads the file, then creates the media entry.",
      "Works with any audio or video file on the local filesystem.",
      "After upload, use get_media_status to poll for completion, then get_transcript and get_media_insights.",
    ].join(" "),
    {
      filePath: z.string().describe("Absolute path to the local audio or video file"),
      name: z.string().optional().describe("Display name (defaults to filename)"),
      mediaType: z.enum([MediaType.AUDIO, MediaType.VIDEO] as [string, ...string[]]).optional().describe("Media type (auto-detected from extension if omitted)"),
      sourceLanguage: z.string().optional().describe("BCP-47 language code (e.g., 'en-US')"),
      folderId: z.string().optional().describe("Folder ID to place the media in"),
      tags: z.string().optional().describe("Comma-separated tags"),
    },
    {
      title: "Upload Local File",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (params) => {
      try {
        const filePath = params.filePath;
        if (!fs.existsSync(filePath)) {
          return {
            content: [{ type: "text", text: `Error: File not found: ${filePath}` }],
            isError: true,
          };
        }

        const filename = path.basename(filePath);
        const isVideo = isVideoFile(filePath);
        const mediaType = params.mediaType ?? detectMediaType(filePath);
        const mimeType = getMimeType(filePath);

        // 1. Get signed upload URL
        const signedRes = await api.get("/v1/media/upload/signedurl", {
          params: { isVideo, filename, mimeType },
        });
        const signedData = signedRes.data?.data;
        const uploadUrl = signedData?.preSignedUrl ?? signedData?.signedUrl ?? signedData?.url;

        if (!uploadUrl) {
          return {
            content: [{ type: "text", text: `Error: Could not get signed upload URL.\n${JSON.stringify(signedRes.data, null, 2)}` }],
            isError: true,
          };
        }

        // 2. Upload file to S3
        const fileBuffer = fs.readFileSync(filePath);
        const axios = (await import("axios")).default;
        await axios.put(uploadUrl, fileBuffer, {
          headers: {
            "Content-Type": mimeType,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        // 3. Create media entry
        const createBody: Record<string, unknown> = {
          name: params.name ?? filename,
          url: uploadUrl.split("?")[0], // S3 URL without query params; server re-signs via CloudFront
          mediaType,
        };
        if (params.sourceLanguage) createBody.sourceLanguage = params.sourceLanguage;
        if (params.folderId) createBody.folderId = params.folderId;
        if (params.tags) createBody.tags = params.tags;

        const createRes = await api.post("/v1/media/upload", createBody);
        const data = createRes.data?.data;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mediaId: data?.mediaId,
                  state: data?.state,
                  message: `File uploaded successfully. Use get_media_status to poll until state is 'processed', then use get_transcript and get_media_insights.`,
                },
                null,
                2
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
}
