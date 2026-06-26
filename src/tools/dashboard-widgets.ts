import { randomUUID } from "crypto";

// Faithful port of speak-client's dashboard widget contract
// (src/features/dashboards/widget-meta.ts) so MCP-created widgets are byte-for-byte
// identical to UI-built ones: same 12 widget types, same per-type grid geometry,
// and the same two-per-row auto-layout. Keep in sync with the client if it changes.

export const GRID_COLS = 12;

export const WIDGET_TYPES = [
  "stat-cards",
  "sentiment",
  "media-list",
  "field-distribution",
  "upload-timeline",
  "themes",
  "team-activity",
  "kpi-trend",
  "notes",
  "people",
  "comparison",
  "sentiment-trend",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

interface WidgetMeta {
  w: number;
  h: number;
  minW: number;
  minH: number;
  titleDefault: string;
}

const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  "stat-cards": { w: GRID_COLS, h: 3, minW: 4, minH: 2, titleDefault: "Usage overview" },
  sentiment: { w: 6, h: 4, minW: 3, minH: 3, titleDefault: "Sentiment" },
  "media-list": { w: GRID_COLS, h: 4, minW: 4, minH: 3, titleDefault: "Recent media" },
  "field-distribution": { w: 6, h: 4, minW: 3, minH: 3, titleDefault: "Field breakdown" },
  "upload-timeline": { w: 6, h: 4, minW: 3, minH: 3, titleDefault: "Uploads over time" },
  themes: { w: 6, h: 4, minW: 3, minH: 3, titleDefault: "Themes" },
  "team-activity": { w: 6, h: 4, minW: 3, minH: 3, titleDefault: "Team activity" },
  "kpi-trend": { w: 3, h: 2, minW: 2, minH: 2, titleDefault: "Total files" },
  notes: { w: GRID_COLS, h: 2, minW: 2, minH: 1, titleDefault: "Note" },
  people: { w: 6, h: 4, minW: 3, minH: 3, titleDefault: "People" },
  comparison: { w: 6, h: 3, minW: 3, minH: 2, titleDefault: "Comparison" },
  "sentiment-trend": { w: 6, h: 4, minW: 3, minH: 3, titleDefault: "Sentiment over time" },
};

export interface WidgetInput {
  type: WidgetType;
  title?: string;
  config?: Record<string, unknown>;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  config: Record<string, unknown>;
  layout: { x: number; y: number; w: number; h: number; minW: number; minH: number };
}

/**
 * Materialise an ordered list of widget specs into concrete dashboard widgets
 * with two-per-row geometry — full-width types take a whole row, half-width
 * types pair up. Mirrors speak-client's `buildTemplateWidgets` so MCP-created
 * dashboards open with the same tidy layout the UI produces.
 */
export function buildDashboardWidgets(items: WidgetInput[]): DashboardWidget[] {
  let y = 0;
  let rowX = 0;
  let rowH = 0;

  return items.map((item) => {
    const meta = WIDGET_META[item.type];
    const full = meta.w >= GRID_COLS;

    let x: number;
    if (full) {
      if (rowX !== 0) {
        y += rowH;
        rowX = 0;
        rowH = 0;
      }
      x = 0;
      const widget = makeWidget(item, x, y);
      y += meta.h;
      return widget;
    }

    if (rowX + meta.w > GRID_COLS) {
      y += rowH;
      rowX = 0;
      rowH = 0;
    }
    x = rowX;
    const widget = makeWidget(item, x, y);
    rowX += meta.w;
    rowH = Math.max(rowH, meta.h);
    if (rowX >= GRID_COLS) {
      y += rowH;
      rowX = 0;
      rowH = 0;
    }
    return widget;
  });
}

// Discovery catalog: what each widget shows and which `config` keys it accepts.
// Config vocabulary mirrors speak-client's widget-settings-panel exactly. Most
// widgets render with no config; the ones below take optional render settings.
export const WIDGET_CATALOG = [
  {
    type: "stat-cards",
    purpose: "Headline totals for the scope (full width).",
    config: 'metrics?: string[] — any of "media", "storage", "words", "speakers", "duration", "sentiment"',
  },
  { type: "sentiment", purpose: "Sentiment distribution + representative sentences.", config: "none" },
  { type: "media-list", purpose: "Most recent media in scope (full width).", config: "none" },
  {
    type: "field-distribution",
    purpose: "Value-frequency breakdown for one custom field.",
    config:
      'fieldId: string (a custom field id from list_fields); measure?: "count" | "words" | "duration" | "avg:<numericFieldId>" | "sum:<numericFieldId>"',
  },
  { type: "upload-timeline", purpose: "Uploads over time per media type.", config: "none" },
  { type: "themes", purpose: "Dominant theme clusters.", config: 'chartType?: "cloud" | "bar"' },
  { type: "team-activity", purpose: "Activity by team member.", config: "none" },
  {
    type: "kpi-trend",
    purpose: "A KPI with period-over-period delta.",
    config: 'metrics?: string[] — any of "totalFiles", "totalDurationSeconds", "totalWords", "uniqueSpeakers"',
  },
  {
    type: "notes",
    purpose: "Free-text note/context block (full width).",
    config: "heading?: string; content?: string",
  },
  { type: "people", purpose: "Speaker/people breakdown.", config: "none" },
  {
    type: "comparison",
    purpose: "Period-over-period comparison of KPIs.",
    config: 'metrics?: string[] — any of "totalFiles", "totalDurationSeconds", "totalWords", "uniqueSpeakers"',
  },
  { type: "sentiment-trend", purpose: "Sentiment over time.", config: "none" },
] as const;

// A worked example to show what a good create_dashboard payload looks like.
export const DASHBOARD_EXAMPLE = {
  title: "Customer Calls Overview",
  folderScope: ["<folderId>"],
  dateRange: { preset: "last30days" },
  filters: { filterList: [{ fieldName: "Stage", fieldOperator: "is", fieldValue: ["Closed Won"] }] },
  widgets: [
    { type: "stat-cards", config: { metrics: ["media", "words", "speakers"] } },
    { type: "sentiment" },
    { type: "field-distribution", title: "Deals by stage", config: { fieldId: "<fieldId>", measure: "count" } },
    { type: "themes", config: { chartType: "bar" } },
    { type: "media-list" },
  ],
};

function makeWidget(item: WidgetInput, x: number, y: number): DashboardWidget {
  const meta = WIDGET_META[item.type];
  return {
    id: randomUUID(),
    type: item.type,
    title: item.title ?? meta.titleDefault,
    config: item.config ?? {},
    layout: { x, y, w: meta.w, h: meta.h, minW: meta.minW, minH: meta.minH },
  };
}
