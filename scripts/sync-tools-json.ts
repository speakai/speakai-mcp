/**
 * Regenerate the tool entries in `tools.json` (the catalog the docs HTML pages
 * fetch at runtime) from the live, registered MCP tools — so the docs never
 * drift from the actual tool surface. Idempotent: re-running only adds what's
 * missing and recomputes `totalTools`.
 *
 *   npx tsx scripts/sync-tools-json.ts
 */
import { registerAllTools } from "../src/tools/index.js";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

interface ToolEntry {
  name: string;
  title: string;
  description: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

// Capture each tool's metadata by registering against a stub server (no network).
const captured: Record<string, ToolEntry> = {};
const stub = {
  registerTool(name: string, def: any) {
    for (const key of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) {
      if (typeof def.annotations?.[key] !== "boolean") {
        throw new Error(`Tool "${name}" annotation "${key}" must be explicitly true or false`);
      }
    }

    captured[name] = {
      name,
      title: def.title ?? name,
      description: def.description ?? "",
      readOnlyHint: def.annotations.readOnlyHint,
      destructiveHint: def.annotations.destructiveHint,
      idempotentHint: def.annotations.idempotentHint,
      openWorldHint: def.annotations.openWorldHint,
    };
    return {} as any;
  },
} as any;
registerAllTools(stub, {} as any);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolsPath = path.join(root, "tools.json");
const json = JSON.parse(readFileSync(toolsPath, "utf8"));

const entry = (name: string): ToolEntry => {
  const t = captured[name];
  if (!t) throw new Error(`Tool "${name}" is not registered — cannot add to tools.json`);
  return t;
};

for (const cat of json.categories) {
  cat.tools = cat.tools.map((t: ToolEntry) => entry(t.name));
}

// New tools appended to an existing category.
const additions: Record<string, string[]> = {
  "automations-webhooks": [
    "list_automation_names",
    "get_automation_runs",
    "bulk_update_automation_status",
    "bulk_assign_automation_folders",
    "run_automations",
    "delete_automation",
    "list_automation_apps",
    "list_automation_triggers",
    "list_automation_actions",
  ],
};

// Brand-new categories.
const newCategories = [
  {
    id: "users-team",
    name: "Users & teams",
    iconKey: "users-team",
    shortDescription: "List workspace members and manage user groups.",
    tools: ["list_users", "list_user_groups", "create_user_group", "update_user_group", "delete_user_group"],
  },
  {
    id: "dashboards",
    name: "Dashboards",
    iconKey: "dashboards",
    shortDescription: "Create and manage analytics dashboards, widgets, and public sharing.",
    tools: [
      "list_dashboard_widgets",
      "list_dashboards",
      "get_dashboard",
      "create_dashboard",
      "update_dashboard",
      "delete_dashboard",
      "duplicate_dashboard",
      "share_dashboard",
      "get_dashboard_speakers_insight",
    ],
  },
];

for (const cat of json.categories) {
  const add = additions[cat.id];
  if (!add) continue;
  const existing = new Set(cat.tools.map((t: ToolEntry) => t.name));
  for (const name of add) if (!existing.has(name)) cat.tools.push(entry(name));
}

for (const nc of newCategories) {
  const existing = json.categories.find((c: { id: string }) => c.id === nc.id);
  if (existing) {
    // Category already present — reconcile to the declared tool list (in order),
    // keeping any extra tools already there.
    const canonical = nc.tools.map(entry);
    const extras = existing.tools.filter((t: ToolEntry) => !nc.tools.includes(t.name));
    existing.tools = [...canonical, ...extras];
    continue;
  }
  json.categories.push({
    id: nc.id,
    name: nc.name,
    iconKey: nc.iconKey,
    shortDescription: nc.shortDescription,
    tools: nc.tools.map(entry),
  });
}

json.totalTools = json.categories.reduce((s: number, c: { tools: unknown[] }) => s + c.tools.length, 0);

writeFileSync(toolsPath, JSON.stringify(json, null, 2) + "\n");
console.log(`tools.json synced. totalTools = ${json.totalTools}`);
