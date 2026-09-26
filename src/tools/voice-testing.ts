import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

// Scripted test suites and runs, under /v1/voice/testing/{agentId}; the run lifecycle is live but the simulated-conversation engine is not wired up yet.
const NOT_WIRED_NOTE =
  " The live execution engine is not wired up yet: a run created here stays queued, scenarioResults stays empty, and overallScore stays 0.";

const criterionSchema = z.object({
  criterionId: z.string().optional(),
  name: z.string(),
  evaluationPrompt: z.string().describe("What the LLM judge is asked to evaluate."),
  weight: z.number().min(1).max(10).optional(),
  isCritical: z.boolean().optional(),
  type: z
    .enum(["llm_judged", "response_length", "regex_match", "tool_called"])
    .optional()
    .describe("Defaults to llm_judged. The other three route through a deterministic code check before the LLM judge runs."),
  maxWords: z.number().int().optional().describe("For type=response_length: fails if any agent response exceeds this word count."),
  regexPattern: z.string().optional().describe("For type=regex_match: JS regex source, no slashes."),
  mustMatch: z.boolean().optional().describe("For type=regex_match: true (default) requires a match, false requires none."),
  expectedToolName: z.string().optional().describe("For type=tool_called: the tool name to look for in the transcript's tool calls."),
});

const scenarioSchema = z.object({
  scenarioId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  userMessages: z.array(z.string()).min(1).describe("The scripted turns sent to the agent."),
  criteria: z.array(criterionSchema).optional().describe("Defaults to an empty array."),
  category: z.enum(["greeting", "kb_retrieval", "off_topic", "edge_case", "custom"]).optional(),
  isEnabled: z.boolean().optional(),
});

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "get_voice_test_suite",
    "Get a voice agent's test suite (its scenarios and run settings). Returns null in data.suite if none has been created yet — not a 404.",
    { agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)") },
    { title: "Get Voice Test Suite", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ agentId }) => {
      try {
        const result = await api.get(`/v1/voice/testing/${agentId}/suite`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "update_voice_test_suite",
    "Create or update a voice agent's test suite. Requires the OWNER or ADMIN role. Upserts. Send the full scenarios array you want to keep — it replaces the stored one, it is not merged.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      scenarios: z.array(scenarioSchema).optional(),
      maxCostPerRun: z.number().min(0).optional(),
      autoRunOnKbUpdate: z.boolean().optional(),
      autoRunOnInstructionSave: z.boolean().optional(),
      scheduledCron: z.string().optional().nullable(),
    },
    { title: "Update Voice Test Suite", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ agentId, ...body }) => {
      try {
        const result = await api.put(`/v1/voice/testing/${agentId}/suite`, body);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "generate_voice_test_suite",
    "Auto-generate a default test suite for a voice agent from its own instructions and knowledge base, via an LLM call. Requires the OWNER or ADMIN role. Overwrites the suite's existing scenarios.",
    { agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)") },
    { title: "Generate Voice Test Suite", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    async ({ agentId }) => {
      try {
        const result = await api.post(`/v1/voice/testing/${agentId}/suite/generate`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "start_voice_test_run",
    "Start a test run against a voice agent's suite. Requires the OWNER or ADMIN role. Rejects with 409 if the agent has no test suite." + NOT_WIRED_NOTE,
    { agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)") },
    { title: "Start Voice Test Run", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ agentId }) => {
      try {
        const result = await api.post(`/v1/voice/testing/${agentId}/run`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "get_active_voice_test_run",
    "Get a voice agent's currently active test run (queued, running, or paused). Returns null in data.run if none is active — not a 404.",
    { agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)") },
    { title: "Get Active Voice Test Run", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ agentId }) => {
      try {
        const result = await api.get(`/v1/voice/testing/${agentId}/run/active`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "pause_voice_test_run",
    "Pause a voice agent's test run. Requires the OWNER or ADMIN role. Valid only from queued or running." + NOT_WIRED_NOTE,
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      runId: z.string().min(1).describe("ID of the run (from get_active_voice_test_run or list_voice_test_runs)"),
    },
    { title: "Pause Voice Test Run", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ agentId, runId }) => {
      try {
        const result = await api.post(`/v1/voice/testing/${agentId}/run/${runId}/pause`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "resume_voice_test_run",
    "Resume a paused voice agent test run, transitioning it back to running. Requires the OWNER or ADMIN role. Valid only from paused.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      runId: z.string().min(1).describe("ID of the run (from get_active_voice_test_run or list_voice_test_runs)"),
    },
    { title: "Resume Voice Test Run", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ agentId, runId }) => {
      try {
        const result = await api.post(`/v1/voice/testing/${agentId}/run/${runId}/resume`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "cancel_voice_test_run",
    "Cancel a voice agent test run. Requires the OWNER or ADMIN role. Valid from queued, running, or paused. Terminal — a cancelled run can never be resumed.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      runId: z.string().min(1).describe("ID of the run (from get_active_voice_test_run or list_voice_test_runs)"),
    },
    { title: "Cancel Voice Test Run", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    async ({ agentId, runId }) => {
      try {
        const result = await api.post(`/v1/voice/testing/${agentId}/run/${runId}/cancel`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "list_voice_test_runs",
    "List a voice agent's test runs, most recent first. Capped at 100 regardless of limit.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      limit: z.number().int().min(1).optional(),
    },
    { title: "List Voice Test Runs", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ agentId, ...params }) => {
      try {
        const result = await api.get(`/v1/voice/testing/${agentId}/runs`, { params });
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "get_voice_test_run",
    "Get a test run's full detail, including scenarioResults and recommendations. Scoped to your company; agentId is not used to filter this lookup, only runId.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      runId: z.string().min(1).describe("ID of the run (from list_voice_test_runs)"),
    },
    { title: "Get Voice Test Run", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ agentId, runId }) => {
      try {
        const result = await api.get(`/v1/voice/testing/${agentId}/runs/${runId}`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "apply_voice_test_recommendation",
    "Apply a test run recommendation's quick action to the agent (e.g. patch_instructions appends the suggested fix to the agent's instructions). Requires the OWNER or ADMIN role.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      runId: z.string().min(1).describe("ID of the run (from get_voice_test_run)"),
      recId: z.string().min(1).describe("ID of the recommendation within that run's recommendations list"),
    },
    { title: "Apply Voice Test Recommendation", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ agentId, runId, recId }) => {
      try {
        const result = await api.post(`/v1/voice/testing/${agentId}/runs/${runId}/recommendations/${recId}/apply`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "get_voice_test_baseline",
    "Get a voice agent's best-scoring completed test run, used to detect regressions on later runs. Returns null in data.baseline if no run has completed yet.",
    { agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)") },
    { title: "Get Voice Test Baseline", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ agentId }) => {
      try {
        const result = await api.get(`/v1/voice/testing/${agentId}/baseline`);
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );

  registerSpeakTool(server,
    "get_voice_test_score_history",
    "Get completed-run score points for a voice agent, most recent first, for charting. Capped at 100 regardless of limit. Only status=completed runs are included.",
    {
      agentId: z.string().min(1).describe("ID of the voice agent (from list_voice_agents)"),
      limit: z.number().int().min(1).optional(),
    },
    { title: "Get Voice Test Score History", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ agentId, ...params }) => {
      try {
        const result = await api.get(`/v1/voice/testing/${agentId}/score-history`, { params });
        return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }], isError: true };
      }
    }
  );
}
