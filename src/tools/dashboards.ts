import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";
import {
  WIDGET_TYPES,
  DATE_RANGE_PRESETS,
  WIDGET_CATALOG,
  SPEC_VOCABULARY,
  DASHBOARD_EXAMPLES,
  buildDashboardWidgets,
  type WidgetInput,
  type SectionInput,
} from "./dashboard-widgets.js";

// Analytics dashboards (speak-server @speak-dashboards, mounted at /v1/dashboards).
// `dashboardId` everywhere is the string business id (returned by list/get/create),
// NOT the Mongo _id. Writes use the dashboard SPEC v2 envelope: the request body is
// { spec: { schemaVersion: 2, title, description?, source, dateRange, sections, widgets, revision? },
//   icon?, assignTo?, filters?, isDefault? } — validated server-side against the
// shared @speakai/shared dashboard-spec zod schema (strict shapes; unknown keys 400).

const FILTER_LIST_DESCRIPTION =
  "Field filters. filters.filterList is an array of " +
  "{ fieldName, fieldOperator?, fieldValue?: string[], fieldCondition? }. " +
  "Other keys pass through but only filterList is enforced.";

// Ergonomic widget spec — the MCP assigns ids and computes the grid layout the
// same way the UI does; you pick the type (and optionally title/config/binding).
const widgetInputSchema = z.object({
  type: z.enum(WIDGET_TYPES as unknown as [string, ...string[]]).describe(
    "Widget type: narrative | stat-cards | metric-chart | table | comparison | " +
      "field-distribution | sentiment-trend | themes | people | team-activity | notes",
  ),
  id: z
    .string()
    .max(64)
    .optional()
    .describe(
      "Optional explicit widget id (kebab-case). Required if you reference the widget from sections[].widgetIds; auto-generated otherwise.",
    ),
  title: z.string().min(1).max(40).optional().describe("Widget title, max 40 chars (defaults to a per-type label)"),
  config: z
    .record(z.unknown())
    .optional()
    .describe(
      "Per-type v2 config (STRICT — unknown keys are rejected). metric-chart: mark (line|bar|area|donut|stacked-bar) + " +
        "metric + groupBy/series + thresholds; table: rowsAre + columns [{header, field|metric}]; stat-cards: tiles; " +
        "field-distribution: fieldName+measure+chartType (required); narrative: focus; notes: content. " +
        "Call list_dashboard_widgets for the full per-type vocabulary + metric/filter grammar. " +
        "Omit for a sensible valid default (except field-distribution, which needs fieldName).",
    ),
  binding: z
    .record(z.unknown())
    .optional()
    .describe(
      "Per-widget scope override: { source?, dateRange?: {preset}, filter? }. Omit any key to inherit the dashboard's value.",
    ),
  layout: z
    .object({
      x: z.number().int().min(0).max(11),
      y: z.number().int().min(0).max(200),
      w: z.number().int().min(1).max(12),
      h: z.number().int().min(1).max(40),
    })
    .optional()
    .describe(
      "Explicit 12-column grid position. Omit to auto-place two-per-row like the UI. " +
        "Widgets must not overlap within a section group.",
    ),
});

const sectionInputSchema = z.object({
  id: z.string().min(1).max(64).describe("Section id (kebab-case)"),
  title: z.string().min(1).max(24).describe("Section title, max 24 chars"),
  icon: z.string().min(1).max(40).describe('Kebab-case lucide icon name, e.g. "dollar-sign"'),
  widgetIds: z
    .array(z.string().max(64))
    .max(24)
    .describe("Widget ids in this section — must match explicit `id`s set on widgets[]"),
});

const sourceInputSchema = z
  .object({
    type: z.enum(["folders", "team", "workspace"]).describe(
      "folders = specific folder ids; team = the caller's team scope; workspace = everything accessible",
    ),
    folderIds: z
      .array(z.string().min(1).max(64))
      .min(1)
      .max(50)
      .optional()
      .describe('Folder ids — required when type is "folders", forbidden otherwise'),
  })
  .describe(
    'Data source: {type:"folders", folderIds:[...]} | {type:"team"} | {type:"workspace"}',
  );

const dateRangeInputSchema = z
  .object({
    preset: z
      .enum(DATE_RANGE_PRESETS as unknown as [string, ...string[]])
      .describe("One of: last7days | last30days | last3months | yearToDate | allTime"),
  })
  .describe("Date range — strict preset only, no free-form start/end dates");

// Fields shared by create and update writes (metadata that lives OUTSIDE the spec).
const metadataFields = {
  icon: z.string().max(200).optional().describe("Icon identifier"),
  assignTo: z
    .array(z.string())
    .max(100)
    .optional()
    .describe("User ids, or group ids in the \"<groupId> (G)\" convention, to share view access with"),
  filters: z.record(z.unknown()).optional().describe(FILTER_LIST_DESCRIPTION),
  isDefault: z.boolean().optional().describe("Make this the company default dashboard"),
} as const;

// Fields that make up the spec v2 envelope body.
const specFields = {
  description: z.string().max(280).optional().describe("Dashboard description, max 280 chars"),
  source: sourceInputSchema.optional(),
  dateRange: dateRangeInputSchema.optional(),
  sections: z
    .array(sectionInputSchema)
    .max(12)
    .optional()
    .describe(
      "Optional named widget groups (tabs). Each references widgets by their explicit ids; " +
        "widgets in no section form the implicit Overview group.",
    ),
  widgets: z
    .array(widgetInputSchema)
    .max(24)
    .optional()
    .describe(
      "Widgets to place on the dashboard, in order (max 24). The MCP assigns ids and computes a tidy " +
        "two-per-row grid layout matching the Speak UI unless you pass explicit id/layout.",
    ),
} as const;

interface SpecFieldValues {
  title?: string;
  description?: string;
  source?: { type: "folders" | "team" | "workspace"; folderIds?: string[] };
  dateRange?: { preset: string };
  sections?: SectionInput[];
  widgets?: WidgetInput[];
}

// Normalize the discriminated source shape: folderIds only travels with type "folders".
function buildSource(source: NonNullable<SpecFieldValues["source"]>): Record<string, unknown> {
  if (source.type === "folders") {
    if (!source.folderIds?.length) {
      throw new Error('source.type "folders" requires source.folderIds (1-50 folder ids)');
    }
    return { type: "folders", folderIds: source.folderIds };
  }
  return { type: source.type };
}

// Assemble the spec v2 envelope from tool inputs (widgets materialised with
// ids + layout). `revision` is appended by the update path only.
function buildSpec(input: SpecFieldValues & { title: string }): Record<string, unknown> {
  const sections = input.sections ?? [];
  const spec: Record<string, unknown> = {
    schemaVersion: 2,
    title: input.title,
    source: buildSource(input.source ?? { type: "workspace" }),
    dateRange: input.dateRange ?? { preset: "last30days" },
    sections,
    widgets: buildDashboardWidgets(input.widgets ?? [], sections),
  };
  if (input.description !== undefined) spec.description = input.description;
  return spec;
}

function pickMetadata(body: {
  icon?: string;
  assignTo?: string[];
  filters?: Record<string, unknown>;
  isDefault?: boolean;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (body.icon !== undefined) out.icon = body.icon;
  if (body.assignTo !== undefined) out.assignTo = body.assignTo;
  if (body.filters !== undefined) out.filters = body.filters;
  if (body.isDefault !== undefined) out.isDefault = body.isDefault;
  return out;
}

const SPEAKERS_FILTER_SCHEMA = {
  folderScope: z.array(z.string().max(100)).max(100).optional().describe("Folder ids to scope to"),
  startDate: z.string().optional().describe("ISO start date"),
  endDate: z.string().optional().describe("ISO end date"),
  filterList: z
    .array(
      z.object({
        fieldName: z.string().max(100),
        fieldOperator: z.string().max(50).optional(),
        fieldValue: z.array(z.string().max(500)).optional(),
        fieldCondition: z.string().max(50).optional(),
      }),
    )
    .max(20)
    .optional()
    .describe("Field filter rules"),
} as const;

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "list_dashboards",
    "List all analytics dashboards the caller can access, including share state and each dashboard's " +
      "current `revision` (needed for update_dashboard).",
    {},
    {
      title: "List Dashboards",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/dashboards");
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
    "get_dashboard",
    "Get a single dashboard's full spec: title, description, source, date range, sections, widgets, " +
      "and the current `revision` (pass that revision back to update_dashboard).",
    {
      dashboardId: z
        .string()
        .min(1)
        .describe("Dashboard business id (the dashboardId field from list_dashboards, not the Mongo _id)"),
    },
    {
      title: "Get Dashboard",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ dashboardId }) => {
      try {
        const result = await api.get(`/v1/dashboards/${dashboardId}`);
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
    "list_dashboard_widgets",
    "Discovery + how-to helper for building and customizing dashboards (spec v2). Returns every widget " +
      "type with what it shows and the exact strict `config` shape it accepts, the shared vocabulary " +
      "(metric grammar, groupBy, per-widget binding, filters, thresholds, sources, date-range presets, " +
      "sections), two complete worked example payloads, and tips for managing dashboards. " +
      "Call this before create_dashboard / update_dashboard.",
    {},
    {
      title: "List Dashboard Widgets",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      const data = {
        widgets: WIDGET_CATALOG,
        vocabulary: SPEC_VOCABULARY,
        notes: [
          "Pass widgets to create_dashboard as a simple ordered list; ids and grid layout are computed for you.",
          "Widget configs are STRICT: unknown keys are rejected. Metrics reference custom fields by NAME (list_fields), not id.",
          "field-distribution requires config.fieldName; most other widgets render on valid defaults with no config.",
          "team-activity is only valid when the dashboard source (or the widget's binding.source) is {type:\"team\"}.",
          "To group widgets into sections, give each sectioned widget an explicit kebab-case `id` and reference those ids in sections[].widgetIds.",
        ],
        managing: [
          "To edit an existing dashboard, call get_dashboard, modify the widgets/sections, and send the FULL spec to " +
            "update_dashboard including the `revision` you loaded (widgets are replaced, not merged).",
          "To start from a working layout, duplicate_dashboard a good one, then update_dashboard to tweak it.",
          "share_dashboard returns a public token; chain it after the dashboard is built.",
        ],
        examples: DASHBOARD_EXAMPLES,
      };
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  registerSpeakTool(server,
    "create_dashboard",
    "Create an analytics dashboard (spec v2). Only `title` is required — source defaults to the whole " +
      "workspace and dateRange to last30days. Add widgets by listing their types (the MCP assigns ids and " +
      "lays them out automatically), scope with source ({type:\"folders\",folderIds} | {type:\"team\"} | " +
      "{type:\"workspace\"}) and dateRange ({preset}), and optionally group widgets into sections. " +
      "Call list_dashboard_widgets first for the widget catalog, config vocabulary, and full examples.",
    {
      title: z.string().min(1).max(60).describe("Dashboard name, max 60 chars (the only required field)"),
      ...specFields,
      ...metadataFields,
    },
    {
      title: "Create Dashboard",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ title, description, source, dateRange, sections, widgets, ...metadata }) => {
      try {
        const body = {
          spec: buildSpec({
            title,
            description,
            source: source as SpecFieldValues["source"],
            dateRange: dateRange as SpecFieldValues["dateRange"],
            sections: sections as SectionInput[] | undefined,
            widgets: widgets as WidgetInput[] | undefined,
          }),
          ...pickMetadata(metadata),
        };
        const result = await api.post("/v1/dashboards", body);
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
    "update_dashboard",
    "Update a dashboard. Two modes. (1) Metadata-only: pass just icon/assignTo/filters/isDefault — no " +
      "spec fields, no revision needed. (2) Spec update: pass the FULL spec — title, source, dateRange, " +
      "sections, widgets — plus `revision`. Widgets and sections are REPLACED, not merged, so call " +
      "get_dashboard first and resend everything you want to keep. `revision` is the optimistic-concurrency " +
      "token from get_dashboard/list_dashboards: the server accepts the write only if it still matches, " +
      "then increments it. A 409 conflict means another writer saved first — re-fetch with get_dashboard, " +
      "rebuild your changes on the fresh spec, and retry with the new revision.",
    {
      dashboardId: z.string().min(1).describe("Dashboard business id"),
      title: z
        .string()
        .min(1)
        .max(60)
        .optional()
        .describe("Dashboard name — required (with revision) when updating the spec"),
      revision: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
          "The revision loaded from get_dashboard. Required for spec updates; mismatch returns a 409 conflict.",
        ),
      ...specFields,
      ...metadataFields,
    },
    {
      title: "Update Dashboard",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ dashboardId, title, revision, description, source, dateRange, sections, widgets, ...metadata }) => {
      try {
        const specTouched =
          title !== undefined ||
          description !== undefined ||
          source !== undefined ||
          dateRange !== undefined ||
          sections !== undefined ||
          widgets !== undefined;

        const body: Record<string, unknown> = pickMetadata(metadata);

        if (specTouched) {
          if (title === undefined || revision === undefined) {
            throw new Error(
              "Spec updates replace the whole spec: call get_dashboard first, then pass the FULL spec " +
                "(title, source, dateRange, sections, widgets) together with the loaded `revision`.",
            );
          }
          body.spec = {
            ...buildSpec({
              title,
              description,
              source: source as SpecFieldValues["source"],
              dateRange: dateRange as SpecFieldValues["dateRange"],
              sections: sections as SectionInput[] | undefined,
              widgets: widgets as WidgetInput[] | undefined,
            }),
            revision,
          };
        }

        if (Object.keys(body).length === 0) {
          throw new Error("Nothing to update: pass spec fields (with revision) or metadata fields.");
        }

        const result = await api.put(`/v1/dashboards/${dashboardId}`, body);
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
    "delete_dashboard",
    "Soft-delete a dashboard. This also deactivates its public share link.",
    {
      dashboardId: z.string().min(1).describe("Dashboard business id to delete"),
    },
    {
      title: "Delete Dashboard",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ dashboardId }) => {
      try {
        const result = await api.delete(`/v1/dashboards/${dashboardId}`);
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
    "duplicate_dashboard",
    "Clone an existing dashboard. The copy gets fresh widget ids, a \"<name> (copy)\" title, cleared " +
      "sharing, and its revision reset to 0. Ideal for cloning a fully-configured dashboard, then tweaking " +
      "it via update_dashboard.",
    {
      dashboardId: z.string().min(1).describe("Source dashboard business id to clone"),
    },
    {
      title: "Duplicate Dashboard",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ dashboardId }) => {
      try {
        const result = await api.post(`/v1/dashboards/${dashboardId}/duplicate`, {});
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
    "share_dashboard",
    "Enable public sharing for a dashboard and return its share token + embed id. WARNING: by default the public link resolves with no passphrase, so anyone with the token can view the dashboard data until an owner sets one.",
    {
      dashboardId: z.string().min(1).describe("Dashboard business id to share"),
    },
    {
      title: "Share Dashboard",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ dashboardId }) => {
      try {
        const result = await api.put(`/v1/dashboards/${dashboardId}/share`, {});
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
    "get_dashboard_speakers_insight",
    "Compute a speakers breakdown for a given folder scope, date range, and field filters. Standalone analytics — does not require a dashboard to exist.",
    SPEAKERS_FILTER_SCHEMA,
    {
      title: "Get Dashboard Speakers Insight",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/dashboards/insights/speakers", body);
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
