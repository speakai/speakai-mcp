import { randomUUID } from "crypto";

// Faithful port of the dashboard spec widget contract (@speakai/shared
// schemas/dashboard-spec + speak-client's widget-meta.ts): same 11 widget types,
// same per-type grid geometry, and the same two-per-row auto-layout, so
// MCP-created widgets match UI-built ones. Keep in sync with the shared schema.

export const GRID_COLS = 12;

// The widget-type union (mirrors widgetTypeSchema in @speakai/shared).
export const WIDGET_TYPES = [
  "narrative",
  "stat-cards",
  "metric-chart",
  "table",
  "comparison",
  "field-distribution",
  "sentiment-trend",
  "themes",
  "people",
  "team-activity",
  "notes",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

export const DATE_RANGE_PRESETS = [
  "last7days",
  "last30days",
  "last3months",
  "yearToDate",
  "allTime",
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

interface WidgetMeta {
  w: number;
  h: number;
  titleDefault: string;
}

// Default grid geometry per type (mirrors speak-client widget-meta.ts). The
// spec's layout schema is strict {x, y, w, h} — minW/minH are render-only in
// the UI and must never be sent to the server.
const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  narrative: { w: GRID_COLS, h: 3, titleDefault: "Insights" },
  "stat-cards": { w: GRID_COLS, h: 3, titleDefault: "Usage overview" },
  "metric-chart": { w: 6, h: 4, titleDefault: "Metric chart" },
  table: { w: GRID_COLS, h: 4, titleDefault: "Table" },
  comparison: { w: 6, h: 3, titleDefault: "Comparison" },
  "field-distribution": { w: 6, h: 4, titleDefault: "Field breakdown" },
  "sentiment-trend": { w: 6, h: 4, titleDefault: "Sentiment over time" },
  themes: { w: 6, h: 4, titleDefault: "Themes" },
  people: { w: 6, h: 4, titleDefault: "People" },
  "team-activity": { w: 6, h: 4, titleDefault: "Team activity" },
  notes: { w: GRID_COLS, h: 2, titleDefault: "Note" },
};

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetInput {
  type: WidgetType;
  id?: string;
  title?: string;
  config?: Record<string, unknown>;
  binding?: Record<string, unknown>;
  layout?: WidgetLayout;
}

export interface SectionInput {
  id: string;
  title: string;
  icon: string;
  widgetIds: string[];
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  config: Record<string, unknown>;
  binding?: Record<string, unknown>;
  layout: WidgetLayout;
}

// Valid default config per type, mirroring speak-client's
// defaultWidgetConfig — every widget built without an explicit config must
// parse against the shared spec schema as-is.
function defaultWidgetConfig(type: WidgetType): Record<string, unknown> {
  switch (type) {
    case "narrative":
      return { focus: "Summarize the key takeaways from this data." };
    case "stat-cards":
      return {
        tiles: [
          { metric: { kind: "builtin", name: "mediaCount" }, label: "Media files" },
          { metric: { kind: "builtin", name: "totalDuration" }, label: "Total duration" },
          { metric: { kind: "builtin", name: "wordCount" }, label: "Total words" },
          { metric: { kind: "builtin", name: "speakerCount" }, label: "Unique speakers" },
        ],
      };
    case "metric-chart":
      return {
        mark: "bar",
        metric: { kind: "builtin", name: "mediaCount" },
        groupBy: { kind: "folder" },
      };
    case "table":
      return {
        rowsAre: "groups",
        groupBy: { kind: "folder" },
        columns: [
          { header: "Recordings", metric: { kind: "builtin", name: "mediaCount" } },
          { header: "Duration", metric: { kind: "builtin", name: "totalDuration" } },
        ],
        sort: { column: "Recordings", dir: "desc" },
      };
    case "comparison":
      return {
        dimension: "folder",
        a: {},
        b: {},
        metrics: [{ kind: "builtin", name: "mediaCount" }],
      };
    case "field-distribution":
      // No safe default exists — fieldName must be a real custom field name.
      throw new Error(
        "field-distribution requires config.fieldName (a custom field NAME — not id — from list_fields), " +
          'plus measure ("count" | "percent") and chartType ("bar" | "donut").',
      );
    case "sentiment-trend":
      return { granularity: "week" };
    case "themes":
      return { limit: 10 };
    case "people":
      return { metrics: [{ kind: "builtin", name: "mediaCount" }], limit: 10 };
    case "team-activity":
      return { metrics: ["uploads", "minutes", "lastActive"] };
    case "notes":
      return { content: "Add notes or context for this dashboard." };
  }
}

const KEBAB_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Materialise ordered widget specs into concrete spec widgets: assign ids
 * (kebab-case, UUID when omitted), apply per-type default config, sanitize any
 * provided layout to the strict {x, y, w, h} shape, and auto-place the rest
 * with the UI's two-per-row geometry. Layout is computed PER SECTION GROUP —
 * `y` restarts at 0 in each section, exactly as the spec's collision check
 * resolves groups (unsectioned widgets form the implicit Overview group).
 */
export function buildDashboardWidgets(
  items: WidgetInput[],
  sections: SectionInput[] = [],
): DashboardWidget[] {
  for (const item of items) {
    if (item.id !== undefined && !KEBAB_ID.test(item.id)) {
      throw new Error(
        `widget id "${item.id}" must be kebab-case (lowercase letters, digits, single dashes)`,
      );
    }
  }

  const widgets = items.map((item) => makeWidget(item));

  const referenced = new Set(sections.flatMap((s) => s.widgetIds));
  const known = new Set(widgets.map((w) => w.id));
  for (const wid of referenced) {
    if (!known.has(wid)) {
      throw new Error(
        `section widgetIds reference unknown widget id "${wid}". ` +
          "Give each sectioned widget an explicit kebab-case `id` and list that id in the section.",
      );
    }
  }

  // Group widgets the way the spec resolves sections: unsectioned first
  // (implicit Overview), then each section in order.
  const sectionOf = new Map<string, number>();
  sections.forEach((s, i) => s.widgetIds.forEach((wid) => sectionOf.set(wid, i)));
  const groups: DashboardWidget[][] = [widgets.filter((w) => !sectionOf.has(w.id))];
  sections.forEach((_, i) =>
    groups.push(widgets.filter((w) => sectionOf.get(w.id) === i)),
  );

  for (const group of groups) {
    layoutGroup(group);
  }

  return widgets;
}

/**
 * Two-per-row auto-layout for one section group, mirroring speak-client's
 * layoutTemplateEntries: full-width types occupy a full row, half-width types
 * pair up. Widgets that arrived with an explicit layout are left untouched;
 * auto-placed ones start below the lowest explicit widget in the group.
 */
function layoutGroup(group: DashboardWidget[]): void {
  let y = group.reduce(
    (bottom, w) => (isAutoLayout(w) ? bottom : Math.max(bottom, w.layout.y + w.layout.h)),
    0,
  );
  let rowX = 0;
  let rowH = 0;

  for (const widget of group) {
    if (!isAutoLayout(widget)) continue;
    const meta = WIDGET_META[widget.type];
    const full = meta.w >= GRID_COLS;

    if (full) {
      if (rowX !== 0) {
        y += rowH;
        rowX = 0;
        rowH = 0;
      }
      widget.layout = { x: 0, y, w: meta.w, h: meta.h };
      y += meta.h;
      continue;
    }

    if (rowX + meta.w > GRID_COLS) {
      y += rowH;
      rowX = 0;
      rowH = 0;
    }
    widget.layout = { x: rowX, y, w: meta.w, h: meta.h };
    rowX += meta.w;
    rowH = Math.max(rowH, meta.h);
    if (rowX >= GRID_COLS) {
      y += rowH;
      rowX = 0;
      rowH = 0;
    }
  }
}

// Sentinel layout for widgets awaiting auto-placement (w=0 is impossible in
// the spec, whose minimum width is 1).
const AUTO_LAYOUT: WidgetLayout = { x: 0, y: 0, w: 0, h: 0 };

function isAutoLayout(widget: DashboardWidget): boolean {
  return widget.layout.w === 0;
}

function makeWidget(item: WidgetInput): DashboardWidget {
  const meta = WIDGET_META[item.type];
  const widget: DashboardWidget = {
    id: item.id ?? randomUUID(),
    type: item.type,
    title: item.title ?? meta.titleDefault,
    config: item.config ?? defaultWidgetConfig(item.type),
    layout: item.layout
      ? { x: item.layout.x, y: item.layout.y, w: item.layout.w, h: item.layout.h }
      : { ...AUTO_LAYOUT },
  };
  if (item.binding && Object.keys(item.binding).length > 0) {
    widget.binding = item.binding;
  }
  return widget;
}

// ── Discovery catalog ──────────────────────────────────────────────────────
// What each widget shows and the exact `config` shape it takes.
// Mirrors the shared zod schema (@speakai/shared schemas/dashboard-spec):
// configs are STRICT objects — unknown keys are rejected by the server.

export const WIDGET_CATALOG = [
  {
    type: "narrative",
    purpose: "AI-written insight narrative for the scope (full width).",
    config:
      "focus: string (1-400 chars) — what the narrative should analyse, e.g. " +
      '"Summarize the key objections raised in these calls." The server generates the text.',
  },
  {
    type: "stat-cards",
    purpose: "Headline stat tiles for the scope (full width).",
    config:
      "tiles: Array<{ metric: Metric, label: string (<=40), caption?: string (<=80), thresholds?: Threshold[] }> (1-6 tiles). " +
      "See metricGrammar for the Metric shape.",
  },
  {
    type: "metric-chart",
    purpose: "The chart workhorse: one metric, optionally grouped and split into series.",
    config:
      'mark: "line" | "bar" | "area" | "donut" | "stacked-bar"; metric: Metric; ' +
      "groupBy?: GroupBy; series?: GroupBy (2nd dimension, e.g. one line per person); " +
      'sort?: "value-desc" | "value-asc" | "label"; limit?: number (1-100); thresholds?: Threshold[]',
  },
  {
    type: "table",
    purpose: "Tabular records or grouped aggregates (full width).",
    config:
      'rowsAre: "records" | "groups"; groupBy?: GroupBy (required when rowsAre="groups", forbidden when "records"); ' +
      "columns: Array<{ header: string (<=40, unique), field: string } | { header: string, metric: Metric }> (1-12; " +
      "a column is EITHER a raw field OR a metric, never both; thresholds? allowed on both forms); " +
      'sort?: { column: <one of the headers>, dir: "asc" | "desc" }; limit?: number (1-500); ' +
      'searchable?: boolean; rowClick?: "openMedia" | "none"',
  },
  {
    type: "comparison",
    purpose: "Side-by-side A/B comparison of the same metrics across two scopes.",
    config:
      'dimension: "folder" | "time" | "fieldValue"; a: Binding; b: Binding (the two sides — ' +
      "see binding; {} inherits the dashboard scope); metrics: Metric[] (1-6)",
  },
  {
    type: "field-distribution",
    purpose: "Value-frequency breakdown for one custom field.",
    config:
      "fieldName: string — the custom field NAME (not id) from list_fields; " +
      'measure: "count" | "percent"; chartType: "bar" | "donut". All three keys are required.',
  },
  {
    type: "sentiment-trend",
    purpose: "Sentiment over time.",
    config: 'granularity: "day" | "week" | "month" (required)',
  },
  {
    type: "themes",
    purpose: "Dominant theme clusters.",
    config: "limit: number (1-50, required)",
  },
  {
    type: "people",
    purpose: "Speaker/people breakdown ranked by metrics.",
    config: "metrics: Metric[] (1-6, required); limit: number (1-100, required)",
  },
  {
    type: "team-activity",
    purpose:
      "Activity by team member. ONLY valid when the effective source is {type:\"team\"} " +
      "(dashboard source or the widget's binding.source).",
    config:
      'metrics: Array<"uploads" | "minutes" | "meetings" | "chatUsage" | "lastActive"> (1-5, required)',
  },
  {
    type: "notes",
    purpose: "Free-text note/context block (full width).",
    config: "content: string (1-4000 chars, required)",
  },
] as const;

// Shared config vocabulary referenced by the catalog above — the sub-shapes
// (Metric, GroupBy, Binding, Filter, Threshold) that widget configs compose.
export const SPEC_VOCABULARY = {
  metricGrammar: {
    builtin: '{ kind: "builtin", name: "mediaCount" | "totalDuration" | "avgSentiment" | "speakerCount" | "wordCount", filter?: Filter }',
    field:
      '{ kind: "field", fieldName: string (custom field NAME from list_fields), ' +
      'agg: "sum" | "avg" | "min" | "max" | "median" | "count" | "countDistinct", filter?: Filter } — ' +
      "sum/avg/median/min/max require a number or currency field",
    expr:
      '{ kind: "expr", expr: <one of the four ops>, filter?: Filter }. Ops (operands are builtin/field metrics, never nested exprs): ' +
      '{ op: "ratio", numerator: Metric, denominator: Metric } | { op: "diff", a: Metric, b: Metric } | ' +
      '{ op: "delta", metric: Metric, over: "first-to-last" | "prev-period" } | { op: "rank", metric: Metric, direction: "desc" | "asc" }',
  },
  groupBy:
    '{ kind: "field", fieldName } (non-date fields) | { kind: "time", fieldName, granularity: "record" | "day" | "week" | "month" | "quarter" } ' +
    '(date/datetime fields only) | { kind: "folder" } | { kind: "speaker" }',
  binding:
    "Per-widget scope override, set as `binding` on any widget (omit a key to inherit the dashboard's value): " +
    "{ source?: Source, dateRange?: { preset }, filter?: Filter }",
  filter:
    'Predicate tree: { field, op: "eq" | "neq" | "in" | "gt" | "gte" | "lt" | "lte" | "exists" | "notExists", value? } ' +
    '(op "in" takes an array value; "exists"/"notExists" take none) — or { and: Filter[] } / { or: Filter[] } (1-10 branches, max depth 5)',
  thresholds:
    "Color bands for stat tiles, chart marks, and table columns (max 8): " +
    '{ when: { op: "gte" | "gt" | "lt" | "lte", value: number } | { op: "between", value: [low, high] }, ' +
    'status: "good" | "warn" | "critical" | "neutral", label?: string (<=40) }',
  source:
    'Dashboard data source: { type: "folders", folderIds: string[] (1-50) } | { type: "team" } | { type: "workspace" }',
  dateRangePresets: DATE_RANGE_PRESETS,
  sections:
    "Optional named groups of widgets rendered as tabs/sections (max 12): " +
    "{ id: kebab-case string, title: string (<=24), icon: kebab-case lucide icon name, widgetIds: string[] (<=24) }. " +
    "Widget ids in sections must match explicit `id`s you set on the widgets; a widget may appear in at most one section; " +
    "widgets in no section form the implicit Overview group.",
} as const;

// Design rules mirroring speak-server's in-app dashboard generation prompt
// (@speak-dashboards/chat/generationPrompt.ts), so a dashboard built via MCP
// reads like one built by the in-app AI. Keep the two lists aligned.
export const DESIGN_RULES = [
  "Lead with a narrative widget: on a new dashboard, make it the first widget of the first section — it is the headline insight.",
  "Sections group widgets by the QUESTION they answer (e.g. \"How is pipeline trending?\"), not by widget type.",
  "Layout must never overlap within a section; side-by-side is x:0,w:6 and x:6,w:6, and y restarts at 0 in each section. " +
    "Omit `layout` and the auto-layout guarantees this — only pass explicit layout when you need a non-default arrangement.",
  "Don't pad — every widget earns its place. Aim for 4-16 widgets on a full build.",
  "If something can't be computed by the widget catalog, put it in a narrative widget's focus instead of faking it with the wrong widget.",
] as const;

// Worked examples of good create_dashboard payloads.
export const DASHBOARD_EXAMPLES = [
  {
    name: "Sales calls overview",
    payload: {
      title: "Customer Calls Overview",
      description: "Volume, sentiment, and themes for closed-won calls",
      source: { type: "folders", folderIds: ["<folderId>"] },
      dateRange: { preset: "last30days" },
      widgets: [
        { type: "narrative", config: { focus: "Summarize the key wins and objections in these calls." } },
        { type: "stat-cards" },
        {
          type: "metric-chart",
          title: "Calls per week",
          config: {
            mark: "line",
            metric: { kind: "builtin", name: "mediaCount" },
            groupBy: { kind: "time", fieldName: "createdAt", granularity: "week" },
          },
        },
        {
          type: "field-distribution",
          title: "Deals by stage",
          config: { fieldName: "Stage", measure: "count", chartType: "bar" },
        },
        { type: "themes", config: { limit: 10 } },
        { type: "sentiment-trend", config: { granularity: "week" } },
      ],
    },
  },
  {
    name: "Sectioned revenue dashboard (explicit widget ids + sections)",
    payload: {
      title: "Deal Metrics",
      source: { type: "workspace" },
      dateRange: { preset: "last3months" },
      widgets: [
        {
          id: "pipeline-stats",
          type: "stat-cards",
          title: "Pipeline",
          config: {
            tiles: [
              { metric: { kind: "field", fieldName: "Deal Size", agg: "sum" }, label: "Total pipeline" },
              { metric: { kind: "field", fieldName: "Deal Size", agg: "max" }, label: "Largest deal" },
              {
                metric: {
                  kind: "expr",
                  expr: {
                    op: "ratio",
                    numerator: { kind: "field", fieldName: "Deal Size", agg: "sum" },
                    denominator: { kind: "builtin", name: "mediaCount" },
                  },
                },
                label: "Revenue per call",
                thresholds: [{ when: { op: "gte", value: 5000 }, status: "good" }],
              },
            ],
          },
        },
        {
          id: "deals-table",
          type: "table",
          title: "Deals by folder",
          config: {
            rowsAre: "groups",
            groupBy: { kind: "folder" },
            columns: [
              { header: "Calls", metric: { kind: "builtin", name: "mediaCount" } },
              { header: "Pipeline", metric: { kind: "field", fieldName: "Deal Size", agg: "sum" } },
            ],
            sort: { column: "Pipeline", dir: "desc" },
          },
        },
        {
          id: "emea-vs-na",
          type: "comparison",
          title: "EMEA vs NA",
          config: {
            dimension: "folder",
            a: { source: { type: "folders", folderIds: ["<emeaFolderId>"] } },
            b: { source: { type: "folders", folderIds: ["<naFolderId>"] } },
            metrics: [{ kind: "builtin", name: "mediaCount" }],
          },
        },
      ],
      sections: [
        { id: "revenue", title: "Revenue", icon: "dollar-sign", widgetIds: ["pipeline-stats", "deals-table"] },
        { id: "regions", title: "Regions", icon: "globe", widgetIds: ["emea-vs-na"] },
      ],
    },
  },
];
