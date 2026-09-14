/**
 * The automation graph layer.
 *
 * A branched automation is edited as a TREE (a condition owns two ordered legs) and
 * stored as a DAG (a flat `steps[]` where each step carries `dependsOn` and an optional
 * `branch` marker). Three functions bridge the two, and all three are deliberate ports
 * of code that already exists elsewhere rather than fresh implementations:
 *
 * - `compileGraph`   ← speak-client `flattenCanvasForWrite` / `legTails`
 * - `hydrateLegs`    ← speak-client `hydrateCanvasLegs`
 * - `resolveIncomingTypes` ← speak-server `catalogService.resolveIncomingTypes`
 *
 * Porting is the point. The shapes the canvas produces are exactly the shapes that
 * survive a reload in the canvas, and the shapes the server's edge-based IO resolution
 * expects are exactly the ones its save gate accepts. Re-deriving either from the prose
 * description is how a third writer drifts from the other two.
 *
 * `validateGraph` then refuses three different classes of problem — see its doc comment.
 */

/** Which outcome of a CONDITION a step belongs to. */
export type LegBranch = "true" | "false";

/** What a leg does once its own steps have finished. */
export type LegExit = "rejoin" | "end";

/** Both branch keys, in the order legs are rendered and serialized. Order is load-bearing — see `compileGraph`. */
export const LEG_BRANCHES: readonly LegBranch[] = ["true", "false"];

/** Deepest a branch may be nested, counting the outermost condition as one (mirrors the editor's MAX_BRANCH_DEPTH). */
export const MAX_BRANCH_DEPTH = 3;

/** The server's Joi cap on `steps[]`. Branching spends these fast. */
export const MAX_STEPS = 20;

export const CONDITION_STEP_TYPE = "condition";
export const FILTER_STEP_TYPE = "filter";

/** A step as it goes on the wire: identity, type, one config block, and the graph fields. */
export interface WireStep {
  stepId: string;
  stepType: string;
  dependsOn?: string[];
  branch?: LegBranch;
  [configKey: string]: unknown;
}

/** A node of the authoring tree: one step, plus its legs when it is a CONDITION. */
export interface GraphNode {
  step: WireStep;
  legs?: Record<LegBranch, GraphNode[]>;
  legExit?: Record<LegBranch, LegExit>;
}

// ── IO types ────────────────────────────────────────────────────────────────
// Mirrors speak-server's AutomationIOType + the ACTIONS catalog. Kept as a literal
// table rather than fetched: it is the contract the save gate validates against, and
// a network round-trip here would make local validation unavailable exactly when a
// caller most needs it (before their first successful save).

export type IOType = "media" | "insight" | "data" | "file" | "notify";

interface ActionIO {
  in: IOType[];
  out: IOType;
  /** FILTER/CONDITION forward their input unchanged instead of contributing a type. */
  passthrough?: boolean;
}

export const ACTION_IO: Record<string, ActionIO> = {
  "speak-upload": { in: ["data"], out: "media" },
  "magic-prompt": { in: ["media", "insight"], out: "insight" },
  translation: { in: ["media"], out: "media" },
  filter: { in: ["file", "media", "insight"], out: "media", passthrough: true },
  condition: { in: ["media", "insight", "data"], out: "media", passthrough: true },
  notify: { in: ["media", "insight", "data"], out: "data" },
  "outbound-webhook": { in: ["media", "insight", "data"], out: "data" },
  // Composio actions carry per-action overrides on the server; the generic entry is the
  // safe default and unknown actions are not type-checked locally.
  "composio-action": { in: ["media", "insight"], out: "notify" },
};

/** What each trigger hands to the first step. */
export const TRIGGER_OUT: Record<string, IOType> = {
  media_analyzed: "media",
  field_updated: "media",
  schedule: "media",
  inbound_webhook: "data",
  ai_chat_completed: "media",
  recording_received: "media",
  clip_created: "data",
};

/** Canonical rule fields per IO type (speak-server FILTER_FIELDS_BY_IOTYPE). */
const FILTER_FIELDS_BY_IOTYPE: Record<IOType, string[]> = {
  media: ["name", "duration", "sourceLanguage", "tags", "transcript", "speakers"],
  file: ["name"],
  insight: ["answer"],
  notify: [],
  data: [],
};

/** Aliases the runner accepts beyond the canonical names. */
const FILTER_FIELD_ALIASES: Record<string, string> = {
  title: "name",
  language: "sourceLanguage",
  speakersCount: "speakers",
};

export const canonicalFilterField = (field: string): string =>
  FILTER_FIELD_ALIASES[field] ?? field;

const ALL_CANONICAL_FILTER_FIELDS = new Set<string>([
  ...Object.values(FILTER_FIELDS_BY_IOTYPE).flat(),
  ...Object.keys(FILTER_FIELD_ALIASES),
]);

export const isCanonicalFilterField = (field: string): boolean =>
  ALL_CANONICAL_FILTER_FIELDS.has(canonicalFilterField(field));

/** A custom extracted field id, as the server's CUSTOM_FIELD_ID_PATTERN shapes it. */
const CUSTOM_FIELD_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * A dotted payload path such as `contact.email`. Distinguishable from a custom field id
 * only by the dot — which is why a single-segment payload key is indistinguishable from
 * a field id and is treated as a field id.
 */
const PAYLOAD_PATH_PATTERN = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/;

export const looksLikePayloadPath = (field: string): boolean =>
  typeof field === "string" && PAYLOAD_PATH_PATTERN.test(field);

export const looksLikeCustomFieldId = (field: string): boolean =>
  typeof field === "string" &&
  !isCanonicalFilterField(field) &&
  CUSTOM_FIELD_ID_PATTERN.test(field);

// ── tree helpers ────────────────────────────────────────────────────────────

export const isConditionNode = (node: GraphNode): boolean =>
  node.step.stepType === CONDITION_STEP_TYPE;

export const legOf = (node: GraphNode, branch: LegBranch): GraphNode[] =>
  node.legs?.[branch] ?? [];

export const exitOf = (node: GraphNode, branch: LegBranch): LegExit =>
  node.legExit?.[branch] ?? "rejoin";

const uniq = (ids: string[]): string[] => ids.filter((id, i) => ids.indexOf(id) === i);

/** True when the tree holds a condition anywhere, main line or any leg. */
export function containsCondition(nodes: GraphNode[]): boolean {
  return nodes.some(
    (node) =>
      isConditionNode(node) || LEG_BRANCHES.some((br) => containsCondition(legOf(node, br))),
  );
}

/** Every node in the tree, main line and legs, at any depth. */
export function flattenNodes(nodes: GraphNode[]): GraphNode[] {
  return nodes.flatMap((node) => [
    node,
    ...LEG_BRANCHES.flatMap((br) => flattenNodes(legOf(node, br))),
  ]);
}

// ── compile: tree → flat DAG ────────────────────────────────────────────────

/**
 * The ids a leg hands to whatever follows its condition.
 *
 * Usually the leg's last step. Two cases make it a SET rather than one id: an empty leg
 * reaches the merge through the condition itself, and a leg ending in another condition
 * reaches it through THAT condition's rejoining legs — so this recurses to whatever depth
 * the tree nests. An empty result means every path through the leg ends inside it.
 */
function legTails(leg: GraphNode[], enclosingConditionId: string): string[] {
  if (!leg.length) return [enclosingConditionId];
  const last = leg[leg.length - 1];
  if (!isConditionNode(last)) return [last.step.stepId];

  const rejoining = LEG_BRANCHES.filter((br) => exitOf(last, br) === "rejoin");
  if (!rejoining.length) return [];
  return uniq(rejoining.flatMap((br) => legTails(legOf(last, br), last.step.stepId)));
}

interface FlatStep {
  node: GraphNode;
  dependsOn: string[];
  branch?: LegBranch;
}

/**
 * Two rules do all the work:
 *
 * - A leg step depends on the step before it in its leg, or on the condition when it is
 *   first, and carries its leg's `branch` marker. A leg is a CHAIN, not a fan: only the
 *   head has the condition for a parent, and the runner resolves the marker by walking
 *   that chain.
 * - The step following a condition is a MERGE: it depends on the tails of every leg that
 *   rejoins. It carries a marker ONLY when exactly one leg rejoins AND that leg is empty —
 *   the one case where the leg's tail is the condition itself, which is never skipped, so
 *   nothing else would stop the ending leg falling through into the merge.
 *
 * LEG_BRANCHES order pins the order of a merge's `dependsOn`. That is not cosmetic: the
 * server's rule-field check reads only the FIRST incoming type of the resulting set
 * (catalogService.ts:1168), so the order chosen here decides whether some merges validate.
 */
function flatten(
  nodes: GraphNode[],
  parentIds: string[] = [],
  branch?: LegBranch,
): FlatStep[] {
  const out: FlatStep[] = [];
  let incoming = parentIds;
  let incomingBranch = branch;

  for (const node of nodes) {
    out.push({
      node,
      dependsOn: uniq(incoming),
      ...(incomingBranch ? { branch: incomingBranch } : {}),
    });

    if (!isConditionNode(node)) {
      incoming = [node.step.stepId];
      // Only the head of a leg needs the marker seeded from the caller; the rest route
      // by cascade through their own leg parent.
      incomingBranch = branch;
      continue;
    }

    for (const br of LEG_BRANCHES) {
      out.push(...flatten(legOf(node, br), [node.step.stepId], br));
    }

    const rejoining = LEG_BRANCHES.filter((br) => exitOf(node, br) === "rejoin");
    incoming = uniq(rejoining.flatMap((br) => legTails(legOf(node, br), node.step.stepId)));
    incomingBranch =
      rejoining.length === 1 && !legOf(node, rejoining[0]).length ? rejoining[0] : branch;
  }

  return out;
}

/**
 * Flatten the authoring tree into the graph the server stores.
 *
 * `dependsOn` is emitted on every step only once the tree actually branches. An unbranched
 * automation serializes byte-for-byte as it did before branching existed, which is what
 * keeps existing MCP-authored automations unchanged.
 */
export function compileGraph(nodes: GraphNode[]): WireStep[] {
  const branched = containsCondition(nodes);
  return flatten(nodes).map(({ node, dependsOn, branch }) => ({
    ...node.step,
    ...(branched ? { dependsOn } : {}),
    ...(branch ? { branch } : {}),
  }));
}

// ── hydrate: flat DAG → tree ────────────────────────────────────────────────

/**
 * Rebuild the tree from the flat graph — the inverse of `compileGraph`, and the same
 * algorithm the canvas uses to reload an automation. Running the editor's own reader over
 * a graph is the only honest way to answer "will the user be able to edit this after we
 * write it", which is what the Tier-2 rules in `validateGraph` are asking.
 */
export function hydrateLegs(steps: WireStep[]): GraphNode[] {
  const byParent = new Map<string, WireStep[]>();
  for (const step of steps) {
    for (const parent of step.dependsOn ?? []) {
      const list = byParent.get(parent) ?? [];
      list.push(step);
      byParent.set(parent, list);
    }
  }
  const referenced = new Set(steps.flatMap((step) => step.dependsOn ?? []));
  const claimed = new Set<string>();

  /**
   * Does this leg hand anything to a step after the condition?
   *
   * For a leg WITH steps, whether its tail is referenced — nothing inside a leg depends on
   * its own last step, so a reference can only come from a merge. An EMPTY leg's tail IS
   * the condition, and the sibling leg's steps always depend on the condition, so the
   * question becomes whether anything OUTSIDE both legs reaches back to it.
   */
  function legReaches(leg: GraphNode[], conditionId: string, legMemberIds: Set<string>): boolean {
    if (!leg.length) {
      return steps.some(
        (step) =>
          step.stepId !== conditionId &&
          !legMemberIds.has(step.stepId) &&
          (step.dependsOn ?? []).includes(conditionId),
      );
    }
    const tails = legTails(leg, conditionId);
    // Every path through the leg already ended inside it, so nothing flows out whatever
    // the exit says. Restore the default rather than reading silence as a deliberate end.
    if (!tails.length) return true;
    return tails.some((id) => referenced.has(id));
  }

  function buildLeg(conditionId: string, branch: LegBranch): GraphNode[] {
    const leg: GraphNode[] = [];
    let cursor = conditionId;
    for (;;) {
      const next = (byParent.get(cursor) ?? []).find(
        (step) => step.branch === branch && !claimed.has(step.stepId),
      );
      if (!next) break;
      claimed.add(next.stepId);
      leg.push(next.stepType === CONDITION_STEP_TYPE ? withLegs(next) : { step: next });
      cursor = next.stepId;
    }
    return leg;
  }

  function withLegs(condition: WireStep): GraphNode {
    const legs = {
      true: buildLeg(condition.stepId, "true"),
      false: buildLeg(condition.stepId, "false"),
    };
    const legMemberIds = new Set(
      [...legs.true, ...legs.false].map((node) => node.step.stepId),
    );
    return {
      step: condition,
      legs,
      legExit: {
        true: legReaches(legs.true, condition.stepId, legMemberIds) ? "rejoin" : "end",
        false: legReaches(legs.false, condition.stepId, legMemberIds) ? "rejoin" : "end",
      },
    };
  }

  // Nest every condition FIRST so `claimed` is complete before the main line is selected.
  // Document order puts a condition ahead of its legs, so an outer condition claims a
  // nested one before the loop reaches it.
  const nested = new Map<string, GraphNode>();
  for (const step of steps) {
    if (claimed.has(step.stepId)) continue;
    if (step.stepType === CONDITION_STEP_TYPE) nested.set(step.stepId, withLegs(step));
  }

  return steps
    .filter((step) => !claimed.has(step.stepId))
    .map((step) => nested.get(step.stepId) ?? { step });
}

// ── IO resolution ───────────────────────────────────────────────────────────

/**
 * The IO types that can actually reach each step, resolved from `dependsOn`.
 *
 * Array order is the truth only for a linear graph. Once a condition splits the run the
 * wire order is [condition, …trueLeg, …falseLeg, merge], so walking with a single mutable
 * cursor validates the merge against whichever leg happened to serialize last. A merge
 * gets the UNION of its parents' outputs: exactly one leg arrives at runtime and the graph
 * cannot know which, so the step has to accept all of them.
 */
export function resolveIncomingTypes(
  steps: WireStep[],
  rootType: IOType,
): Map<string, Set<IOType>> {
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  const incoming = new Map<string, Set<IOType>>();
  const resolving = new Set<string>();

  const outputsOf = (step: WireStep, into: Set<IOType>): Set<IOType> => {
    const io = ACTION_IO[step.stepType];
    if (!io) return into;
    if (io.passthrough) return into;
    return new Set([io.out]);
  };

  const into = (step: WireStep): Set<IOType> => {
    const cached = incoming.get(step.stepId);
    if (cached) return cached;
    // Cycles are reported separately; guard so a cyclic body cannot hang this.
    if (resolving.has(step.stepId)) return new Set([rootType]);
    resolving.add(step.stepId);

    const parents = (step.dependsOn ?? [])
      .map((id) => byId.get(id))
      .filter((parent): parent is WireStep => parent !== undefined);

    const types = parents.length
      ? new Set(parents.flatMap((parent) => [...outputsOf(parent, into(parent))]))
      : new Set([rootType]);

    resolving.delete(step.stepId);
    incoming.set(step.stepId, types);
    return types;
  };

  steps.forEach(into);
  return incoming;
}

/**
 * What reaches each step, resolved the way the server resolves it.
 *
 * Edge-based ancestry is only correct once something declares a dependency. A linear graph
 * carries no `dependsOn` at all — array order IS execution order there — and resolving it
 * from edges would give every step the trigger's own type, because every step looks like a
 * root. The server makes exactly this switch (`hasDependencies ? resolveIncomingTypes(…)
 * : null`, catalogService.ts:1151) and falls back to a cursor walked down the array.
 */
export function incomingTypesByStep(
  steps: WireStep[],
  rootType: IOType,
): Map<string, Set<IOType>> {
  const hasDependencies = steps.some((step) => (step.dependsOn ?? []).length > 0);
  if (hasDependencies) return resolveIncomingTypes(steps, rootType);

  const byStep = new Map<string, Set<IOType>>();
  let cursor: IOType = rootType;
  for (const step of steps) {
    byStep.set(step.stepId, new Set([cursor]));
    const io = ACTION_IO[step.stepType];
    if (io && !io.passthrough) cursor = io.out;
  }
  return byStep;
}

/**
 * Whether a media item can be in the run's context by the time this step runs.
 *
 * This is the question a filter or condition really asks, and it is NOT the declared IO
 * flow. `evaluateFilterStep` reads the Media doc through `ctx.mediaId` whatever the graph
 * says is flowing — so a condition placed after a NOTIFY (which declares DATA out) still
 * resolves `duration` fine, and the server accepts it. What actually fails is a run where
 * `ctx.mediaId` was never set: an inbound-webhook trigger before any SPEAK_UPLOAD, where
 * `getMediaContext()` returns null and the step fails with "Media not found".
 *
 * A SPEAK_UPLOAD sets `ctx.mediaId` (graphRunner.ts:466), so anything downstream of one has
 * media even on a webhook run.
 */
function mediaAvailabilityByStep(steps: WireStep[], rootType: IOType): Map<string, boolean> {
  const available = new Map<string, boolean>();
  const rootHasMedia = rootType === "media";
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  const hasDependencies = steps.some((step) => (step.dependsOn ?? []).length > 0);

  if (!hasDependencies) {
    // Linear graph: array order is execution order.
    let seen = rootHasMedia;
    for (const step of steps) {
      available.set(step.stepId, seen);
      if (step.stepType === "speak-upload") seen = true;
    }
    return available;
  }

  const resolving = new Set<string>();
  const at = (stepId: string): boolean => {
    const cached = available.get(stepId);
    if (cached !== undefined) return cached;
    if (resolving.has(stepId)) return rootHasMedia;
    resolving.add(stepId);
    const parents = (byId.get(stepId)?.dependsOn ?? []).filter((id) => byId.has(id));
    // Every path into the step must carry media, or one of them fails.
    const result = parents.length
      ? parents.every((id) => byId.get(id)!.stepType === "speak-upload" || at(id))
      : rootHasMedia;
    resolving.delete(stepId);
    available.set(stepId, result);
    return result;
  };
  for (const step of steps) at(step.stepId);
  return available;
}

// ── validation ──────────────────────────────────────────────────────────────

export interface ValidateOptions {
  /** Trigger slug, used to seed the IO chain. Unknown slugs skip IO checks. */
  triggerSlug?: string;
  /** "instant" | "schedule". A schedule refuses a branch outright — see below. */
  runType?: string;
  /**
   * Custom field ids that exist in this workspace. When supplied, a condition rule naming
   * an unknown id is refused — the server checks FILTER rule fields only, so nothing else
   * catches it and the automation silently takes the wrong branch forever.
   */
  knownFieldIds?: Set<string> | null;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const ruleBlockOf = (step: WireStep): { logic?: string; rules?: { field?: string; op?: string }[] } | undefined => {
  const block = step.stepType === CONDITION_STEP_TYPE ? step.condition : step.filter;
  return block && typeof block === "object" ? (block as { rules?: { field?: string; op?: string }[] }) : undefined;
};

/**
 * Refuse a graph that would be rejected, mis-stored, or silently mis-run.
 *
 * Three classes, and the split matters because they are enforced in three different
 * places and MCP passes through only one of them:
 *
 * - The server's save gate rejects some shapes (a marker with no condition, a second
 *   root, a condition nothing names). We mirror those so a caller gets a message that
 *   names the problem instead of a 400.
 * - The editor rejects others the server will happily store (nesting past three, a
 *   condition that is not last in its leg). Breaking those writes an automation the user
 *   cannot afterwards open on the canvas.
 * - A third group passes both and then runs wrong (a payload-path rule, a branch on a
 *   schedule, an unverified condition field id). Only the editor refuses some of these,
 *   and MCP is not the editor.
 */
export function validateGraph(steps: WireStep[], opts: ValidateOptions = {}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(steps) || steps.length === 0) {
    return { errors: ["The automation needs at least one step."], warnings };
  }
  if (steps.length > MAX_STEPS) {
    errors.push(
      `An automation can hold ${MAX_STEPS} steps; this one has ${steps.length}. A branch spends steps quickly — a condition plus two two-step legs plus a merge is six.`,
    );
  }

  const byId = new Map<string, WireStep>();
  for (const step of steps) {
    if (!step.stepId) {
      errors.push("Every step needs a stepId.");
      continue;
    }
    if (byId.has(step.stepId)) errors.push(`Two steps share the id "${step.stepId}".`);
    byId.set(step.stepId, step);
  }

  // A stepId that does not start with a letter resolves by id everywhere EXCEPT a whole-token
  // read inside a Composio argsTemplate, where the server's regex requires [A-Za-z_] and the
  // value arrives stringified instead of keeping its type.
  for (const step of steps) {
    if (step.stepId && !/^[A-Za-z_]/.test(step.stepId)) {
      warnings.push(
        `Step id "${step.stepId}" does not start with a letter, so a whole-value {{step.${step.stepId}.…}} token inside a Composio argsTemplate arrives as text instead of keeping its type.`,
      );
    }
  }

  for (const step of steps) {
    for (const parentId of step.dependsOn ?? []) {
      if (!byId.has(parentId)) {
        errors.push(`Step "${step.stepId}" depends on "${parentId}", which is not in this automation.`);
      }
    }
  }

  // Cycles. Only meaningful once something declares a dependency.
  const hasDependencies = steps.some((step) => (step.dependsOn ?? []).length > 0);
  if (hasDependencies) {
    const state = new Map<string, number>(); // 0 = visiting, 1 = done
    const walk = (id: string): boolean => {
      const status = state.get(id);
      if (status === 1) return false;
      if (status === 0) return true;
      state.set(id, 0);
      for (const parent of byId.get(id)?.dependsOn ?? []) {
        if (byId.has(parent) && walk(parent)) return true;
      }
      state.set(id, 1);
      return false;
    };
    for (const step of steps) {
      if (step.stepId && walk(step.stepId)) {
        errors.push(`The steps form a loop through "${step.stepId}" — a step cannot depend on itself, directly or indirectly.`);
        break;
      }
    }
  }

  const branchedSteps = steps.filter((step) => step.branch === "true" || step.branch === "false");
  const conditionSteps = steps.filter((step) => step.stepType === CONDITION_STEP_TYPE);
  const isBranched = branchedSteps.length > 0 || conditionSteps.length > 0;

  // ── rule blocks ───────────────────────────────────────────────────────────
  for (const step of steps) {
    if (step.stepType !== CONDITION_STEP_TYPE && step.stepType !== FILTER_STEP_TYPE) continue;
    const block = ruleBlockOf(step);
    const rules = block?.rules ?? [];
    if (!rules.length) {
      errors.push(
        step.stepType === CONDITION_STEP_TYPE
          ? `Condition "${step.stepId}" has no rules. An empty rule set counts as a match, so every run would take the "true" branch.`
          : `Filter "${step.stepId}" has no rules.`,
      );
    }
    if (rules.length > 20) {
      errors.push(`Step "${step.stepId}" has ${rules.length} rules; the limit is 20.`);
    }
  }

  // ── branch routing ────────────────────────────────────────────────────────
  if (isBranched) {
    const anchorsOf = (stepId: string, seen = new Set<string>()): Set<string> => {
      const found = new Set<string>();
      if (seen.has(stepId)) return found;
      seen.add(stepId);
      const self = byId.get(stepId);
      for (const parentId of self?.dependsOn ?? []) {
        const parent = byId.get(parentId);
        if (!parent) continue;
        if (parent.stepType === CONDITION_STEP_TYPE) found.add(parent.stepId);
        else if (parent.branch && parent.branch === self?.branch) {
          for (const id of anchorsOf(parent.stepId, seen)) found.add(id);
        }
      }
      return found;
    };

    const ancestorsOf = (stepId: string): Set<string> => {
      const out = new Set<string>();
      const stack = [...(byId.get(stepId)?.dependsOn ?? [])];
      while (stack.length) {
        const id = stack.pop() as string;
        if (out.has(id) || !byId.has(id)) continue;
        out.add(id);
        stack.push(...(byId.get(id)?.dependsOn ?? []));
      }
      return out;
    };

    const anchored = new Set<string>();
    for (const step of branchedSteps) {
      const anchors = anchorsOf(step.stepId);
      if (!anchors.size) {
        errors.push(
          `Step "${step.stepId}" is marked as the "${step.branch}" branch but nothing connects it to a condition, so it would run on every path.`,
        );
        continue;
      }
      for (const id of anchors) anchored.add(id);

      const opposite = [...ancestorsOf(step.stepId)]
        .map((id) => byId.get(id))
        .find(
          (ancestor) =>
            (ancestor?.branch === "true" || ancestor?.branch === "false") &&
            ancestor.branch !== step.branch &&
            [...anchorsOf(ancestor.stepId)].some((id) => anchors.has(id)),
        );
      if (opposite) {
        errors.push(
          `Step "${step.stepId}" (on the "${step.branch}" branch) waits on "${opposite.stepId}", which is on the other branch of the same condition — so it can never run.`,
        );
      }
    }

    for (const condition of conditionSteps) {
      if (!anchored.has(condition.stepId)) {
        errors.push(
          `Condition "${condition.stepId}" has no steps on either side, so both paths do the same thing. Put a step on one of its branches, or use a filter to stop the run instead.`,
        );
      }
    }

    const roots = steps.filter((step) => !(step.dependsOn ?? []).length);
    if (branchedSteps.length && roots.length > 1) {
      errors.push(
        `A branched automation must have a single entry step, but ${roots.length} steps declare no dependsOn (${roots
          .map((step) => `"${step.stepId}"`)
          .join(", ")}) — each of those would run on every branch. Give every step after the first a dependsOn.`,
      );
    }
  }

  // ── a branch on a schedule ────────────────────────────────────────────────
  // A scheduled run carries a BATCH of media and a condition resolves once for the whole
  // batch: true when ANY media matches, narrowing nothing. The yes leg then runs against
  // every media in the batch, including the ones that did not match. A batch FILTER
  // narrows the set instead, which is the behaviour a branch reads as having.
  if (opts.runType === "schedule" && conditionSteps.length) {
    errors.push(
      "A scheduled automation cannot branch. A schedule runs over a batch of media and a condition resolves once for the whole batch — it answers \"true\" when any one media matches and narrows nothing, so the branch would run against media that did not match. Use a filter, which narrows the batch.",
    );
  }

  // ── Tier 2: shapes the editor cannot reload ───────────────────────────────
  if (isBranched) {
    const tree = hydrateLegs(steps);
    errors.push(...branchingReloadErrors(tree, 1));

    // The general form of the same question. The canvas reloads a graph with hydrateLegs
    // and re-saves it with the flattener; if that round trip does not return the graph it
    // was given, the automation the user opens is not the automation that was written.
    // A hand-listed rule (like "a nested condition must be last in its leg") only catches
    // the cases someone thought of — comparing the trip catches the shape itself.
    const rebuilt = new Map(compileGraph(tree).map((step) => [step.stepId, step]));
    const structurallyMoved: string[] = [];
    const reordered: string[] = [];
    for (const step of steps) {
      const after = rebuilt.get(step.stepId);
      if (!after) {
        structurallyMoved.push(step.stepId);
        continue;
      }
      const before = step.dependsOn ?? [];
      const now = after.dependsOn ?? [];
      if (step.branch !== after.branch || before.length !== now.length || now.some((id) => !before.includes(id))) {
        structurallyMoved.push(step.stepId);
      } else if (before.some((id, i) => now[i] !== id)) {
        reordered.push(step.stepId);
      }
    }
    if (structurallyMoved.length) {
      errors.push(
        `The Speak web editor would not reload this automation the way it is written: ${structurallyMoved
          .slice(0, 4)
          .map((id) => `"${id}"`)
          .join(", ")} would come back on a different branch or with different parents. ` +
          `The usual cause is a step placed after a nested condition — a branch inside a branch has to be the last step of the branch it sits on, because the leg marker cannot say which of the two branches it belongs to.`,
      );
    }
    if (reordered.length) {
      warnings.push(
        `Reopening this automation in the Speak web editor would reorder the dependsOn of ${reordered
          .slice(0, 4)
          .map((id) => `"${id}"`)
          .join(", ")}. The steps are the same; only the order the branches are listed in changes, which can affect which branch's fields a merge is validated against.`,
      );
    }
  }

  // ── IO chain and rule fields ──────────────────────────────────────────────
  const rootType = opts.triggerSlug ? TRIGGER_OUT[opts.triggerSlug] : undefined;
  if (rootType) {
    const incomingByStep = incomingTypesByStep(steps, rootType);
    const hasMedia = mediaAvailabilityByStep(steps, rootType);

    for (const step of steps) {
      const incomingTypes = incomingByStep.get(step.stepId) ?? new Set([rootType]);
      const io = ACTION_IO[step.stepType];
      if (!io) continue;

      const unacceptable = [...incomingTypes].filter((type) => !io.in.includes(type));
      if (unacceptable.length && step.stepType !== "composio-action") {
        errors.push(
          `Step "${step.stepId}" (${step.stepType}) cannot accept "${unacceptable.join('", "')}" from the step before it — it expects one of: ${io.in.join(", ")}.`,
        );
      }

      if (step.stepType !== CONDITION_STEP_TYPE && step.stepType !== FILTER_STEP_TYPE) continue;

      // The server reads only the FIRST incoming type when checking rule fields
      // (catalogService.ts:1168) even though it resolved the full union. Whether a merge
      // validates therefore depends on dependsOn order, which compileGraph pins. Say so
      // rather than let a save succeed or fail for a reason nothing explains.
      if (incomingTypes.size > 1) {
        warnings.push(
          `Step "${step.stepId}" merges branches carrying different kinds of data (${[...incomingTypes].join(", ")}). The server checks its rule fields against "${[...incomingTypes][0]}" only, so a rule valid on the other branch may be refused.`,
        );
      }

      const flowing = [...incomingTypes][0] ?? rootType;
      for (const rule of ruleBlockOf(step)?.rules ?? []) {
        const field = String(rule.field ?? "");
        if (!field) {
          errors.push(`Step "${step.stepId}" has a rule with no field.`);
          continue;
        }

        // Neither the FILTER nor the CONDITION executor resolves the trigger payload:
        // both read the Media doc (plus `answer` from earlier steps) and nothing else.
        //
        // Two shapes, one cause. While DATA is flowing no media exists yet, so the step
        // fails the run outright ("Media not found for filter evaluation"). After an
        // upload the payload path instead falls through to a custom-field lookup, comes
        // back undefined, and the condition routes "false" on every run forever. The save
        // gate accepts both — it shape-checks payload paths against a contract the runner
        // does not implement — so this is the only place either is caught.
        const payloadAdvice =
          `Upload the payload first and use fieldsMap (create_automation) or mapFields (build_automation) to write ` +
          `"${field}" onto the media as a custom field, then test that field id here.`;

        if (!hasMedia.get(step.stepId)) {
          errors.push(
            `Step "${step.stepId}" tests "${field}", but at this point in the automation nothing has produced a media item yet — ` +
              `and a ${step.stepType} can only read a media item and earlier step answers, never the trigger payload. ` +
              `As written the run would stop here with "Media not found". ${payloadAdvice}`,
          );
          continue;
        }

        if (looksLikePayloadPath(field)) {
          errors.push(
            `Step "${step.stepId}" tests "${field}", which reads the trigger payload — and a ${step.stepType} cannot read the payload. ` +
              `It would silently find nothing and take the same branch on every run. ${payloadAdvice}`,
          );
          continue;
        }

        if (isCanonicalFilterField(field)) {
          // On a DATA/NOTIFY flow the server shape-checks the field as a payload path
          // instead of matching the typed table (catalogService.ts:1180), and the runner
          // reads the media doc regardless — so a media field after a NOTIFY saves AND
          // works. Only the strict flows get the table.
          const strictFlow = flowing === "media" || flowing === "insight" || flowing === "file";
          const allowed = FILTER_FIELDS_BY_IOTYPE[flowing] ?? [];
          if (strictFlow && !allowed.includes(canonicalFilterField(field))) {
            errors.push(
              `Step "${step.stepId}" tests "${field}", which is not available here: what reaches this step is "${flowing}"` +
                (flowing === "insight"
                  ? `, so only "answer" can be tested. Move the ${step.stepType} before the AI step to test media fields.`
                  : `, which offers: ${allowed.join(", ") || "no built-in fields"}.`),
            );
          }
          continue;
        }

        // A custom extracted field. Only MEDIA carries them (FILE/INSIGHT reached here
        // means the field is simply not available), and the server checks ownership for
        // FILTER rules only — a CONDITION naming a stranger's field id is accepted and
        // then routes wrongly forever, which is why the id is checked for both here.
        if (flowing === "insight" || flowing === "file") {
          errors.push(
            `Step "${step.stepId}" tests the custom field "${field}", but straight after an AI step only "answer" can be tested. Move the ${step.stepType} before the AI step.`,
          );
          continue;
        }
        if (!looksLikeCustomFieldId(field)) {
          errors.push(`Step "${step.stepId}": "${field}" is not a valid field name or id.`);
          continue;
        }
        if (opts.knownFieldIds && !opts.knownFieldIds.has(field)) {
          errors.push(
            `Step "${step.stepId}" tests custom field "${field}", which does not exist in this workspace. ` +
              `A condition naming an unknown field is not rejected by the server and silently takes the same branch every time — use list_fields to get a real field id.`,
          );
        }
      }
    }
  }

  // ── positional step tokens ────────────────────────────────────────────────
  // {{step.N.*}} indexes the steps array, whose order once branched is
  // [condition, …trueLeg, …falseLeg, merge] — not execution order. A step on the untaken
  // leg has no output, so the token resolves to an empty string in whatever the step sends.
  if (isBranched) {
    const positional = new Set<string>();
    for (const step of steps) {
      for (const match of JSON.stringify(step).matchAll(/\{\{\s*step\.(\d+)\.[^}\s]+\s*\}\}/g)) {
        positional.add(match[0].replace(/\\"/g, '"'));
      }
    }
    if (positional.size) {
      errors.push(
        `This automation branches, so a numbered step token cannot be trusted: ${[...positional].slice(0, 3).join(", ")}. ` +
          `The number indexes the stored order ([condition, true leg, false leg, merge]), not the order steps run, and a step on the branch that was not taken produces nothing. Address the step by its id instead: {{step.<stepId>.answer}}.`,
      );
    }
  }

  return { errors, warnings };
}

/**
 * Shapes the server stores happily but the canvas reloads wrongly or not at all. Walks the
 * tree because every one of these is a statement about nesting, which the flat list hides.
 */
function branchingReloadErrors(nodes: GraphNode[], depth: number): string[] {
  const errors: string[] = [];
  for (const [index, node] of nodes.entries()) {
    if (!isConditionNode(node)) continue;

    if (depth > MAX_BRANCH_DEPTH) {
      errors.push(
        `Condition "${node.step.stepId}" is nested ${depth} branches deep; the editor supports ${MAX_BRANCH_DEPTH}. Deeper than that cannot be opened on the canvas.`,
      );
      continue;
    }

    const yesExit = exitOf(node, "true");
    const noExit = exitOf(node, "false");

    if (yesExit === "end" && noExit === "end" && index < nodes.length - 1) {
      errors.push(
        `Both branches of condition "${node.step.stepId}" end the run, but "${nodes[index + 1].step.stepId}" comes after it — nothing would reach that step.`,
      );
    }

    // NOTE: "a nested condition must be the last step of its leg" is not checked here.
    // It is a special case of the round-trip check in validateGraph, and checking it on the
    // already-hydrated tree cannot work — by then the steps have been moved.

    const reaches = LEG_BRANCHES.some(
      (branch) => exitOf(node, branch) === "rejoin" && legReachesOnward(legOf(node, branch)),
    );
    if (!reaches && index < nodes.length - 1) {
      errors.push(
        `Every path through condition "${node.step.stepId}" ends inside it, so "${nodes[index + 1].step.stepId}" would be left with nothing to run after.`,
      );
    }

    for (const branch of LEG_BRANCHES) {
      errors.push(...branchingReloadErrors(legOf(node, branch), depth + 1));
    }
  }
  return errors;
}

/** Whether anything can come out of the far end of this leg. */
function legReachesOnward(leg: GraphNode[]): boolean {
  if (!leg.length) return true;
  const last = leg[leg.length - 1];
  if (!isConditionNode(last)) return true;
  return LEG_BRANCHES.some(
    (branch) => exitOf(last, branch) === "rejoin" && legReachesOnward(legOf(last, branch)),
  );
}

// ── rendering ───────────────────────────────────────────────────────────────

/**
 * Render a stored graph as the indented tree the canvas shows.
 *
 * `update_automation` replaces the whole automation, so editing one leg means re-sending
 * the entire DAG. Handing a caller a flat array and asking it to re-derive the topology is
 * how a dropped `dependsOn` turns into a multi-root rejection.
 */
export function describeGraph(steps: WireStep[]): string {
  const lines: string[] = [];

  const summarise = (step: WireStep): string => {
    const block = ruleBlockOf(step);
    if (block?.rules?.length) {
      const logic = (block.logic ?? "AND") as string;
      const rules = block.rules
        .map((rule) => `${rule.field} ${rule.op}${"value" in rule ? ` ${JSON.stringify((rule as { value?: unknown }).value)}` : ""}`)
        .join(` ${logic} `);
      return `${step.stepType} [${rules}]`;
    }
    return step.stepType;
  };

  const walk = (nodes: GraphNode[], indent: string): void => {
    for (const node of nodes) {
      lines.push(`${indent}${node.step.stepId}  ${summarise(node.step)}`);
      if (!isConditionNode(node)) continue;
      for (const branch of LEG_BRANCHES) {
        const leg = legOf(node, branch);
        const exit = exitOf(node, branch);
        const label = branch === "true" ? "yes" : "no";
        const tail = exit === "end" ? " (ends the run)" : "";
        lines.push(`${indent}  ├─ ${label}:${leg.length ? tail : ` (no steps)${tail}`}`);
        walk(leg, `${indent}  │  `);
      }
    }
  };

  walk(hydrateLegs(steps), "");
  return lines.join("\n");
}
