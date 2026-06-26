import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";
import {
  WIDGET_TYPES,
  WIDGET_CATALOG,
  COMMON_WIDGET_CONFIG,
  DASHBOARD_EXAMPLES,
  buildDashboardWidgets,
  type WidgetInput,
} from "./dashboard-widgets.js";

// Analytics dashboards (speak-server @speak-dashboards, mounted at /v1/dashboards).
// `dashboardId` everywhere is the string business id (returned by list/get/create),
// NOT the Mongo _id. Request shapes mirror speak-client's features/dashboards/api.ts
// and the server's DashboardCreate/DashboardUpdate Joi validators exactly.

const FILTER_LIST_DESCRIPTION =
  "Field filters. filters.filterList is an array of " +
  "{ fieldName, fieldOperator?, fieldValue?: string[], fieldCondition? }. " +
  "Other keys pass through but only filterList is enforced.";

// Ergonomic widget spec — the MCP assigns the id and computes the grid layout the
// same way the UI does, so you only pick the type (and optionally a title/config).
const widgetInputSchema = z.object({
  type: z.enum(WIDGET_TYPES as unknown as [string, ...string[]]).describe(
    "Widget type: stat-cards | sentiment | media-list | field-distribution | upload-timeline | " +
      "themes | team-activity | kpi-trend | field-metric | metric-group | notes | people | comparison | sentiment-trend",
  ),
  title: z.string().max(200).optional().describe("Widget title (defaults to a per-type label)"),
  config: z
    .record(z.unknown())
    .optional()
    .describe(
      "Optional render settings. Per-type: fieldId+measure (field-distribution), fieldId+aggregator " +
        "(field-metric), metrics list (stat-cards, kpi-trend, comparison, metric-group), chartType (themes), " +
        "heading+content (notes). Any widget also accepts accentColor (hex) and scopeOverride " +
        "({datePreset, folderId}). Call list_dashboard_widgets for the full catalog + examples. " +
        "Leave empty for sensible defaults.",
    ),
});

const writeFields = {
  description: z.string().max(2000).optional().describe("Dashboard description"),
  icon: z.string().max(200).optional().describe("Icon identifier"),
  folderScope: z
    .array(z.string().max(100))
    .max(100)
    .optional()
    .describe("Folder ids to scope analytics to. Empty/omitted = all accessible folders."),
  assignTo: z
    .array(z.string())
    .max(100)
    .optional()
    .describe("User ids, or group ids in the \"<groupId> (G)\" convention, to share view access with"),
  dateRange: z
    .object({
      preset: z.string().max(50).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .optional()
    .describe("Date range: { preset?, startDate?, endDate? }"),
  filters: z.record(z.unknown()).optional().describe(FILTER_LIST_DESCRIPTION),
  widgets: z
    .array(widgetInputSchema)
    .max(50)
    .optional()
    .describe(
      "Widgets to place on the dashboard, in order. The MCP assigns ids and computes a tidy " +
        "two-per-row grid layout matching the Speak UI. Just list the widget types you want.",
    ),
  isDefault: z.boolean().optional().describe("Make this the company default dashboard"),
} as const;

// Map the ergonomic widget specs to the full wire shape (id + layout + config)
// the server/UI expect. Other fields pass through unchanged.
function withBuiltWidgets(body: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(body.widgets)) {
    return { ...body, widgets: buildDashboardWidgets(body.widgets as WidgetInput[]) };
  }
  return body;
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
    "List all analytics dashboards the caller can access, including share state.",
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
    "Get a single dashboard's full config (widgets, filters, date range, folder scope).",
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
    "Discovery + how-to helper for building and customizing dashboards. Returns every widget type with what it shows and the exact `config` keys it accepts (metrics, fieldId, aggregator, chartType, accentColor, scopeOverride, …), the config that applies to all widgets, two complete worked example payloads (including the field-metric and metric-group cards), and tips for managing dashboards. Call this before create_dashboard / update_dashboard.",
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
        commonConfig: COMMON_WIDGET_CONFIG,
        notes: [
          "Pass widgets to create_dashboard as a simple ordered list; ids and grid layout are computed for you.",
          "Field-driven widgets (field-distribution, field-metric, metric-group) need custom field ids from list_fields in their config.",
          "field-metric uses config.aggregator; metric-group items use the key `op` (both: sum|avg|min|max|count).",
          "accentColor (hex) and scopeOverride ({datePreset, folderId}) can be set on any widget's config to customize it.",
          "Most other widgets render on sensible defaults with no config.",
        ],
        managing: [
          "To customize an existing dashboard, call get_dashboard, edit the widgets array, and send the full array to update_dashboard (widgets are replaced, not merged).",
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
    "Create an analytics dashboard. Only `title` is required. Add widgets by listing their types " +
      "(the MCP assigns ids and lays them out automatically) and scope with folderScope, dateRange, and filters. " +
      "Call list_dashboard_widgets first to see the available widget types and their config keys, plus a full example.",
    {
      title: z.string().min(1).max(200).describe("Dashboard name (the only required field)"),
      ...writeFields,
    },
    {
      title: "Create Dashboard",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/dashboards", withBuiltWidgets(body));
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
    "Update a dashboard. Only the fields you pass are changed (partial update). NOTE: passing `widgets` " +
      "replaces the entire widget set — fetch the dashboard first if you want to preserve existing widgets.",
    {
      dashboardId: z.string().min(1).describe("Dashboard business id"),
      title: z.string().min(1).max(200).optional().describe("New dashboard name"),
      ...writeFields,
    },
    {
      title: "Update Dashboard",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ dashboardId, ...body }) => {
      try {
        const result = await api.put(`/v1/dashboards/${dashboardId}`, withBuiltWidgets(body));
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
    "Clone an existing dashboard. The copy gets fresh widget ids, a \"<name> (copy)\" title, and cleared sharing. Ideal for cloning a fully-configured dashboard, then tweaking it via update_dashboard.",
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
      openWorldHint: false,
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
