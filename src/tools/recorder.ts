import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

// Config keys shared by create_recorder and update_recorder_settings.
// Nested objects use z.record to keep TS type-inference light; the exact keys
// are documented in each .describe() and validated server-side.
const recorderConfigShape = {
  description: z.string().optional().describe("Recorder description"),
  sourceLanguage: z.string().optional().describe("Transcription language code (e.g. en-US)"),
  folderId: z.string().optional().describe("Folder to store recordings in"),
  isAutoAnalyze: z.boolean().optional().describe("Whether to auto-analyze submissions"),
  notifyUsers: z.array(z.string()).optional().describe("User IDs to notify on new submissions"),
  duration: z
    .record(z.unknown())
    .optional()
    .describe("Recording duration: { minDuration, maxDuration } in seconds"),
  options: z
    .record(z.unknown())
    .optional()
    .describe(
      "Capture options: { audio, video, screenShare, liveTranscription, upload:{ file, text, multiple, url } } — all booleans",
    ),
  notification: z
    .record(z.unknown())
    .optional()
    .describe("Notification toggles: { upload, client } — booleans"),
  meta: z
    .record(z.unknown())
    .optional()
    .describe(
      "Branding/customization: { primaryColor, backgroundImg, logo, fontColor, fontFamily, theme, customCSS, hideWaveform, hideTitle, hideDescription, hideSubmitButton, submitButtonLabel, countdown, hideImages }",
    ),
};

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  registerSpeakTool(server, 
    "check_recorder_status",
    "Check whether a recorder/survey is active and accepting submissions.",
    {
      token: z.string().min(1).describe("Unique token identifying the recorder"),
    },
    {
      title: "Check Recorder Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ token }) => {
      try {
        const result = await api.get(`/v1/recorder/status/${token}`);
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
    "create_recorder",
    "Create a new recorder or survey for collecting audio/video submissions.",
    {
      name: z.string().describe("Display name for the recorder"),
      ...recorderConfigShape,
      clientInformation: z
        .record(z.unknown())
        .optional()
        .describe(
          "Respondent info & questions: { name:boolean, email:boolean, questions:[{ question, isRequired, answerType, options?, includeOther?, fieldId? }], consent?:{ isEnabled, title, description, yesButtonLabel, noButtonLabel, isRequired, fieldId? } }",
        ),
    },
    {
      title: "Create Recorder",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/recorder/create", body);
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
    "list_recorders",
    "List all recorders/surveys in the workspace.",
    {
      page: z.number().int().min(0).optional().describe("Page number (0-based, default: 0)"),
      pageSize: z.number().int().min(1).max(500).optional().describe("Results per page (default: 20, max: 500)"),
      sortBy: z.string().optional().describe('Sort field, e.g. "createdAt:desc"'),
    },
    {
      title: "List Recorders",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/recorder", { params });
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
    "clone_recorder",
    "Duplicate an existing recorder including all its settings and questions.",
    {
      recorderId: z.string().min(1).describe("ID of the recorder to clone"),
      name: z.string().optional().describe("Name for the cloned recorder"),
      description: z.string().optional().describe("Description for the cloned recorder"),
      folderId: z.string().optional().describe("Folder for the cloned recorder"),
    },
    {
      title: "Clone Recorder",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/recorder/clone", body);
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
    "get_recorder_info",
    "Get detailed information about a specific recorder including its settings and questions.",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder"),
    },
    {
      title: "Get Recorder Info",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ recorderId }) => {
      try {
        const result = await api.get(`/v1/recorder/${recorderId}`);
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
    "get_recorder_recordings",
    "List all submissions/recordings collected by a specific recorder.",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder"),
    },
    {
      title: "Get Recorder Submissions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ recorderId }) => {
      try {
        const result = await api.get(`/v1/recorder/recordings/${recorderId}`);
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
    "generate_recorder_url",
    "Generate a shareable public URL for a recorder/survey.",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder"),
    },
    {
      title: "Generate Recorder Share URL",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ recorderId }) => {
      try {
        const result = await api.get(`/v1/recorder/url/${recorderId}`);
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
    "update_recorder_settings",
    "Update configuration settings for a recorder (branding, capture options, etc.). `name` must always be supplied.",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder"),
      name: z.string().describe("Display name for the recorder"),
      ...recorderConfigShape,
    },
    {
      title: "Update Recorder Settings",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ recorderId, ...body }) => {
      try {
        const result = await api.put(`/v1/recorder/settings/${recorderId}`, body);
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
    "update_recorder_questions",
    "Update the survey questions and respondent-info settings for a recorder.",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder"),
      name: z.boolean().optional().describe("Whether to collect the respondent's name"),
      email: z.boolean().optional().describe("Whether to collect the respondent's email"),
      questions: z
        .array(z.record(z.unknown()))
        .describe(
          "Survey questions. Each: { question, isRequired, answerType, options?, includeOther?, fieldId?, id? }",
        ),
      consent: z
        .record(z.unknown())
        .optional()
        .describe(
          "Consent screen: { isEnabled, title, description, yesButtonLabel, noButtonLabel, isRequired, fieldId? }",
        ),
    },
    {
      title: "Update Recorder Questions",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ recorderId, ...body }) => {
      try {
        const result = await api.put(`/v1/recorder/questions/${recorderId}`, body);
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
    "delete_recorder",
    "Permanently delete a recorder/survey. Existing recordings are preserved.",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder to delete"),
    },
    {
      title: "Delete Recorder",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ recorderId }) => {
      try {
        const result = await api.delete(`/v1/recorder/${recorderId}`);
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
