import { describe, it, expect } from "vitest";
import {
  compileGraph,
  hydrateLegs,
  validateGraph,
  incomingTypesByStep,
  describeGraph,
  type GraphNode,
  type WireStep,
} from "../src/tools/automation-graph.js";

// Step bodies are irrelevant to the graph layer; only stepType and the rule block matter.
// The default is TRANSLATION (media in, media out) so a fixture's own steps do not change
// what flows — a notify step outputs DATA, which would fail the IO check for a reason
// that has nothing to do with the rule under test.
const node = (stepId: string, stepType = "translation"): GraphNode => ({
  step: { stepId, stepType, translation: { targetLanguage: "es-ES" } } as WireStep,
});

const cond = (
  stepId: string,
  legs: { true?: GraphNode[]; false?: GraphNode[] } = {},
  exits: { true?: "rejoin" | "end"; false?: "rejoin" | "end" } = {},
): GraphNode => ({
  step: {
    stepId,
    stepType: "condition",
    condition: { logic: "AND", rules: [{ field: "tags", op: "contains", value: "vip" }] },
  } as WireStep,
  legs: { true: legs.true ?? [], false: legs.false ?? [] },
  legExit: { true: exits.true ?? "rejoin", false: exits.false ?? "rejoin" },
});

const byId = (steps: WireStep[]) => new Map(steps.map((s) => [s.stepId, s]));

describe("compileGraph", () => {
  it("leaves an unbranched automation without dependsOn, exactly as before branching existed", () => {
    const steps = compileGraph([node("s1"), node("s2")]);
    expect(steps).toEqual([
      { stepId: "s1", stepType: "translation", translation: { targetLanguage: "es-ES" } },
      { stepId: "s2", stepType: "translation", translation: { targetLanguage: "es-ES" } },
    ]);
  });

  it("chains a leg rather than fanning every leg step off the condition", () => {
    // The old flat compiler parented BOTH leg steps to the condition, which validates but
    // leaves no ordering edge between them.
    const steps = compileGraph([node("s1"), cond("c", { true: [node("a"), node("b")] })]);
    const map = byId(steps);
    expect(map.get("a")!.dependsOn).toEqual(["c"]);
    expect(map.get("b")!.dependsOn).toEqual(["a"]);
    expect(map.get("a")!.branch).toBe("true");
    expect(map.get("b")!.branch).toBe("true");
  });

  it("gives every step a dependsOn once the graph branches — no second entry point", () => {
    const steps = compileGraph([node("s1"), cond("c", { true: [node("a")] }), node("m")]);
    const roots = steps.filter((s) => !(s.dependsOn ?? []).length);
    expect(roots.map((s) => s.stepId)).toEqual(["s1"]);
  });

  it("merges on the tails of both legs, true leg first", () => {
    const steps = compileGraph([
      node("s1"),
      cond("c", { true: [node("a")], false: [node("b")] }),
      node("m"),
    ]);
    // Order is load-bearing: the server reads only the first incoming type when it checks
    // a merge's rule fields.
    expect(byId(steps).get("m")!.dependsOn).toEqual(["a", "b"]);
    expect(byId(steps).get("m")!.branch).toBeUndefined();
  });

  it("leaves the merge unmarked when both legs rejoin, even if one is empty", () => {
    // Either path reaches the merge, so no marker is needed: on the "false" run the true
    // leg's tail is dead but the condition itself is alive, and a merge stops only when
    // EVERY parent is dead.
    const steps = compileGraph([node("s1"), cond("c", { true: [node("a")] }), node("m")]);
    const merge = byId(steps).get("m")!;
    expect(merge.dependsOn).toEqual(["a", "c"]);
    expect(merge.branch).toBeUndefined();
  });

  it("marks the merge when the only rejoining leg is the empty one", () => {
    // Here the empty leg's tail IS the condition, which is never skipped — without the
    // marker the merge would also run on the branch whose leg ended the run.
    const steps = compileGraph([
      node("s1"),
      cond("c", { true: [node("a")] }, { true: "end" }),
      node("m"),
    ]);
    const merge = byId(steps).get("m")!;
    expect(merge.dependsOn).toEqual(["c"]);
    expect(merge.branch).toBe("false");
  });

  it("drops a leg's tail from the merge when that leg ends the run", () => {
    const steps = compileGraph([
      node("s1"),
      cond("c", { true: [node("a")], false: [node("b")] }, { true: "end" }),
      node("m"),
    ]);
    expect(byId(steps).get("m")!.dependsOn).toEqual(["b"]);
  });

  it("resolves a nested condition's tails through its own rejoining legs", () => {
    const inner = cond("c2", { true: [node("x")], false: [node("y")] });
    const steps = compileGraph([node("s1"), cond("c1", { true: [inner] }), node("m")]);
    // c1's true leg ends in c2, so the merge reaches back through BOTH of c2's legs.
    expect(byId(steps).get("m")!.dependsOn).toEqual(["x", "y", "c1"]);
  });
});

describe("compileGraph → hydrateLegs round trip", () => {
  const cases: [string, GraphNode[]][] = [
    ["one leg", [node("s1"), cond("c", { true: [node("a")] }), node("m")]],
    ["both legs", [node("s1"), cond("c", { true: [node("a")], false: [node("b")] }), node("m")]],
    ["multi-step leg", [node("s1"), cond("c", { true: [node("a"), node("b")] }), node("m")]],
    [
      "one leg ends",
      [node("s1"), cond("c", { true: [node("a")], false: [node("b")] }, { true: "end" }), node("m")],
    ],
    [
      "nested, inner last in its leg",
      [node("s1"), cond("c1", { true: [cond("c2", { true: [node("x")] })] }), node("m")],
    ],
  ];

  // The canvas reloads an automation with exactly this algorithm. A shape that does not
  // survive the trip is a shape the user cannot edit after MCP writes it.
  it.each(cases)("survives the trip home: %s", (_label, tree) => {
    const compiled = compileGraph(tree);
    const rebuilt = hydrateLegs(compiled);
    expect(compileGraph(rebuilt)).toEqual(compiled);
  });
});

describe("validateGraph — shapes the server refuses", () => {
  const trigger = { triggerSlug: "media_analyzed" };

  it("refuses a branch marker that reaches no condition", () => {
    const steps: WireStep[] = [
      { stepId: "s1", stepType: "notify", dependsOn: [] },
      { stepId: "s2", stepType: "notify", dependsOn: ["s1"], branch: "true" },
    ];
    expect(validateGraph(steps, trigger).errors.join(" ")).toContain("nothing connects it to a condition");
  });

  it("refuses a second entry point in a branched graph", () => {
    const steps: WireStep[] = [
      { stepId: "s1", stepType: "condition", condition: { logic: "AND", rules: [{ field: "tags", op: "exists" }] } },
      { stepId: "s2", stepType: "notify", dependsOn: ["s1"], branch: "true" },
      { stepId: "s3", stepType: "notify" },
    ];
    expect(validateGraph(steps, trigger).errors.join(" ")).toContain("single entry step");
  });

  it("refuses a condition nothing is marked against", () => {
    const steps: WireStep[] = [
      { stepId: "s1", stepType: "condition", dependsOn: [], condition: { logic: "AND", rules: [{ field: "tags", op: "exists" }] } },
      { stepId: "s2", stepType: "notify", dependsOn: ["s1"] },
    ];
    expect(validateGraph(steps, trigger).errors.join(" ")).toContain("no steps on either side");
  });

  it("refuses a step that waits on the opposite leg", () => {
    const steps: WireStep[] = [
      { stepId: "c", stepType: "condition", dependsOn: [], condition: { logic: "AND", rules: [{ field: "tags", op: "exists" }] } },
      { stepId: "a", stepType: "notify", dependsOn: ["c"], branch: "true" },
      { stepId: "b", stepType: "notify", dependsOn: ["c", "a"], branch: "false" },
    ];
    expect(validateGraph(steps, trigger).errors.join(" ")).toContain("can never run");
  });

  it("refuses a condition with no rules", () => {
    const steps: WireStep[] = [
      { stepId: "c", stepType: "condition", dependsOn: [], condition: { logic: "AND", rules: [] } },
      { stepId: "a", stepType: "notify", dependsOn: ["c"], branch: "true" },
    ];
    expect(validateGraph(steps, trigger).errors.join(" ")).toContain("every run would take the \"true\" branch");
  });

  it("refuses a dependency loop", () => {
    const steps: WireStep[] = [
      { stepId: "a", stepType: "notify", dependsOn: ["b"] },
      { stepId: "b", stepType: "notify", dependsOn: ["a"] },
    ];
    expect(validateGraph(steps, trigger).errors.join(" ")).toContain("loop");
  });
});

describe("validateGraph — shapes the editor cannot reload", () => {
  const trigger = { triggerSlug: "media_analyzed" };

  it("refuses a nested condition that is not the last step of its leg", () => {
    const tree = [
      node("s1"),
      cond("c1", { true: [cond("c2", { true: [node("x")] }), node("after")] }),
      node("m"),
    ];
    const errors = validateGraph(compileGraph(tree), trigger).errors.join(" ");
    // Caught by the round-trip check: "after" was authored as a merge in c1's leg and
    // reloads inside c2's leg instead.
    expect(errors).toContain("would not reload this automation the way it is written");
    expect(errors).toContain('"after"');
  });

  it("refuses nesting past three deep", () => {
    const tree = [
      node("s1"),
      cond("c1", { true: [cond("c2", { true: [cond("c3", { true: [cond("c4", { true: [node("x")] })] })] })] }),
    ];
    expect(validateGraph(compileGraph(tree), trigger).errors.join(" ")).toContain("nested");
  });

  it("accepts three levels", () => {
    const tree = [
      node("s1"),
      cond("c1", { true: [cond("c2", { true: [cond("c3", { true: [node("x")] })] })] }),
    ];
    expect(validateGraph(compileGraph(tree), trigger).errors).toEqual([]);
  });
});

describe("validateGraph — accepted, then wrong at run time", () => {
  it("refuses a branch on a scheduled automation", () => {
    const tree = [node("s1"), cond("c", { true: [node("a")] }), node("m")];
    const result = validateGraph(compileGraph(tree), {
      triggerSlug: "schedule",
      runType: "schedule",
    });
    expect(result.errors.join(" ")).toContain("scheduled automation cannot branch");
  });

  it("allows the same branch on an instant automation", () => {
    const tree = [node("s1"), cond("c", { true: [node("a")] }), node("m")];
    expect(
      validateGraph(compileGraph(tree), { triggerSlug: "media_analyzed", runType: "instant" }).errors,
    ).toEqual([]);
  });

  it("refuses a payload path once media is flowing", () => {
    const steps: WireStep[] = [
      { stepId: "s1", stepType: "filter", filter: { logic: "AND", rules: [{ field: "contact.status", op: "eq", value: "churn" }] } },
    ];
    const errors = validateGraph(steps, { triggerSlug: "media_analyzed" }).errors.join(" ");
    expect(errors).toContain("reads the trigger payload");
    expect(errors).toContain("fieldsMap");
  });

  it("refuses any rule before something has produced media", () => {
    const steps: WireStep[] = [
      { stepId: "s1", stepType: "condition", condition: { logic: "AND", rules: [{ field: "status", op: "eq", value: "done" }] } },
      { stepId: "s2", stepType: "notify", dependsOn: ["s1"], branch: "true" },
    ];
    const errors = validateGraph(steps, { triggerSlug: "inbound_webhook" }).errors.join(" ");
    expect(errors).toContain("nothing has produced a media item yet");
  });

  it("refuses a media field tested straight after an AI step", () => {
    // The runner would evaluate it fine; the save gate refuses it, so catching it here is
    // the difference between a useful message and a 400.
    const steps: WireStep[] = [
      { stepId: "s1", stepType: "magic-prompt", magicPrompt: { prompt: "summarise" } },
      { stepId: "s2", stepType: "filter", dependsOn: ["s1"], filter: { logic: "AND", rules: [{ field: "duration", op: "gt", value: 60 }] } },
    ];
    const errors = validateGraph(steps, { triggerSlug: "media_analyzed" }).errors.join(" ");
    expect(errors).toContain("Move the filter before the AI step");
  });

  it("refuses a condition naming a field id that does not exist", () => {
    const steps: WireStep[] = [
      { stepId: "c", stepType: "condition", condition: { logic: "AND", rules: [{ field: "fldGhost", op: "eq", value: "x" }] } },
      { stepId: "a", stepType: "notify", dependsOn: ["c"], branch: "true" },
    ];
    const errors = validateGraph(steps, {
      triggerSlug: "media_analyzed",
      knownFieldIds: new Set(["fldReal"]),
    }).errors.join(" ");
    expect(errors).toContain("does not exist in this workspace");
  });

  it("refuses a positional step token once the graph branches", () => {
    const tree: GraphNode[] = [
      node("s1"),
      cond("c", {
        true: [
          {
            step: {
              stepId: "a",
              stepType: "notify",
              notify: { channel: "in_app", message: "answer was {{step.1.answer}}" },
            } as WireStep,
          },
        ],
      }),
    ];
    const errors = validateGraph(compileGraph(tree), { triggerSlug: "media_analyzed" }).errors.join(" ");
    expect(errors).toContain("numbered step token cannot be trusted");
  });

  it("leaves a positional token alone on an unbranched graph", () => {
    const steps: WireStep[] = [
      { stepId: "s1", stepType: "magic-prompt", magicPrompt: { prompt: "x" } },
      { stepId: "s2", stepType: "notify", notify: { channel: "in_app", message: "{{step.0.answer}}" } },
    ];
    expect(validateGraph(steps, { triggerSlug: "media_analyzed" }).errors).toEqual([]);
  });

  it("warns when a merge joins branches carrying different data", () => {
    const tree = [
      node("s1"),
      cond("c", {
        true: [{ step: { stepId: "ai", stepType: "magic-prompt", magicPrompt: { prompt: "x" } } as WireStep }],
        false: [node("tr")],
      }),
      // a filter at the merge is what makes the rule-field check (and the warning) fire
      {
        step: {
          stepId: "m",
          stepType: "filter",
          filter: { logic: "AND", rules: [{ field: "answer", op: "contains", value: "x" }] },
        } as WireStep,
      },
    ];
    const { warnings } = validateGraph(compileGraph(tree), { triggerSlug: "media_analyzed" });
    expect(warnings.join(" ")).toContain("different kinds of data");
  });

  it("warns about a step id a Composio arg template would read as text", () => {
    const steps: WireStep[] = [{ stepId: "9abc", stepType: "translation", translation: { targetLanguage: "es-ES" } }];
    expect(validateGraph(steps, { triggerSlug: "media_analyzed" }).warnings.join(" ")).toContain(
      "does not start with a letter",
    );
  });
});

describe("incomingTypesByStep", () => {
  it("walks the array for a linear graph, where order IS execution order", () => {
    const steps: WireStep[] = [
      { stepId: "s1", stepType: "speak-upload" },
      { stepId: "s2", stepType: "filter" },
    ];
    const map = incomingTypesByStep(steps, "data");
    expect([...map.get("s1")!]).toEqual(["data"]);
    // speak-upload turns DATA into MEDIA; a filter after it sees media.
    expect([...map.get("s2")!]).toEqual(["media"]);
  });

  it("uses the edges once anything declares a dependency, so legs do not leak into each other", () => {
    const tree = [
      { step: { stepId: "s1", stepType: "speak-upload" } as WireStep },
      cond("c", {
        true: [{ step: { stepId: "ai", stepType: "magic-prompt" } as WireStep }],
        false: [{ step: { stepId: "tr", stepType: "translation" } as WireStep }],
      }),
    ];
    const map = incomingTypesByStep(compileGraph(tree), "data");
    // The false leg sees what the CONDITION forwarded, not what the true leg produced.
    expect([...map.get("tr")!]).toEqual(["media"]);
  });
});

describe("describeGraph", () => {
  it("renders legs as an indented tree and names the side that ends", () => {
    const tree = [
      node("s1"),
      cond("c", { true: [node("a")] }, { false: "end" }),
    ];
    const text = describeGraph(compileGraph(tree));
    expect(text).toContain("c  condition [tags contains \"vip\"]");
    expect(text).toContain("├─ yes:");
    expect(text).toContain("├─ no: (no steps) (ends the run)");
    expect(text).toContain("a  translation");
  });
});
