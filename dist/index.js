#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createSpeakClient: () => createSpeakClient,
  formatAxiosError: () => formatAxiosError,
  registerAllTools: () => registerAllTools
});
module.exports = __toCommonJS(index_exports);
var import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");

// src/tools/media.ts
var media_exports = {};
__export(media_exports, {
  register: () => register
});
var import_zod = require("zod");

// src/client.ts
var import_axios = __toESM(require("axios"));
var BASE_URL = process.env.SPEAK_BASE_URL ?? "https://api.speakai.co";
var API_KEY = process.env.SPEAK_API_KEY ?? "";
if (!API_KEY && !process.env.SPEAK_MCP_LIBRARY_MODE) {
  process.stderr.write(
    "[speak-mcp] Warning: SPEAK_API_KEY is not set. All requests will fail.\n"
  );
}
var accessToken = process.env.SPEAK_ACCESS_TOKEN ?? "";
var refreshToken = "";
var tokenExpiresAt = 0;
async function authenticate() {
  try {
    const res = await import_axios.default.post(
      `${BASE_URL}/v1/auth/accessToken`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          "x-speakai-key": API_KEY
        }
      }
    );
    if (res.data?.data?.accessToken) {
      accessToken = res.data.data.accessToken;
      refreshToken = res.data.data.refreshToken ?? "";
      tokenExpiresAt = Date.now() + 50 * 60 * 1e3;
      process.stderr.write("[speak-mcp] Authenticated successfully\n");
    }
  } catch (err) {
    process.stderr.write(
      `[speak-mcp] Authentication failed: ${err instanceof Error ? err.message : err}
`
    );
  }
}
async function refreshAccessToken() {
  if (!refreshToken) {
    return authenticate();
  }
  try {
    const res = await import_axios.default.post(
      `${BASE_URL}/v1/auth/refreshToken`,
      { refreshToken },
      {
        headers: {
          "Content-Type": "application/json",
          "x-speakai-key": API_KEY,
          "x-access-token": accessToken
        }
      }
    );
    if (res.data?.data?.accessToken) {
      accessToken = res.data.data.accessToken;
      refreshToken = res.data.data.refreshToken ?? refreshToken;
      tokenExpiresAt = Date.now() + 50 * 60 * 1e3;
      process.stderr.write("[speak-mcp] Token refreshed\n");
    }
  } catch {
    return authenticate();
  }
}
async function ensureAuthenticated() {
  if (!accessToken || Date.now() >= tokenExpiresAt) {
    if (accessToken && refreshToken) {
      await refreshAccessToken();
    } else {
      await authenticate();
    }
  }
}
var speakClient = import_axios.default.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 6e4
});
speakClient.interceptors.request.use(
  async (config) => {
    await ensureAuthenticated();
    config.headers.set("x-speakai-key", API_KEY);
    config.headers.set("x-access-token", accessToken);
    return config;
  }
);
speakClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retried) {
      originalRequest._retried = true;
      tokenExpiresAt = 0;
      await ensureAuthenticated();
      originalRequest.headers["x-speakai-key"] = API_KEY;
      originalRequest.headers["x-access-token"] = accessToken;
      return speakClient(originalRequest);
    }
    return Promise.reject(error);
  }
);
function createSpeakClient(options) {
  return import_axios.default.create({
    baseURL: options.baseUrl,
    headers: {
      "Content-Type": "application/json",
      "x-speakai-key": options.apiKey,
      "x-access-token": options.accessToken
    },
    timeout: 6e4
  });
}
function formatAxiosError(error) {
  if (import_axios.default.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;
    const message = typeof data === "object" && data !== null ? JSON.stringify(data, null, 2) : String(data ?? error.message);
    return status ? `HTTP ${status}: ${message}` : `Request failed: ${message}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

// src/tools/media.ts
function register(server2, client) {
  const api = client ?? speakClient;
  server2.tool(
    "get_signed_upload_url",
    "Get a pre-signed S3 URL for direct media file upload. Use this before uploading a file directly to Speak AI storage.",
    {
      isVideo: import_zod.z.boolean().describe("Set true for video files, false for audio files"),
      filename: import_zod.z.string().describe("Original filename including extension"),
      mimeType: import_zod.z.string().describe('MIME type of the file, e.g. "audio/mp4" or "video/mp4"')
    },
    async ({ isVideo, filename, mimeType }) => {
      try {
        const result = await api.get("/v1/media/upload/signedurl", {
          params: { isVideo, filename, mimeType }
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "upload_media",
    "Upload a media file to Speak AI by providing a publicly accessible URL. Speak AI will fetch and process the file asynchronously.",
    {
      name: import_zod.z.string().describe("Display name for the media file"),
      url: import_zod.z.string().describe("Publicly accessible URL of the media file (or pre-signed S3 URL)"),
      mediaType: import_zod.z.enum(["audio", "video"]).describe('Type of media: "audio" or "video"'),
      description: import_zod.z.string().optional().describe("Description of the media file"),
      sourceLanguage: import_zod.z.string().optional().describe('BCP-47 language code for transcription, e.g. "en-US" or "he-IL"'),
      tags: import_zod.z.string().optional().describe("Comma-separated tags for the media"),
      folderId: import_zod.z.string().optional().describe("ID of the folder to place the media in"),
      callbackUrl: import_zod.z.string().optional().describe("Webhook callback URL for this specific upload"),
      fields: import_zod.z.array(
        import_zod.z.object({
          id: import_zod.z.string().describe("Custom field ID"),
          value: import_zod.z.string().describe("Custom field value")
        })
      ).optional().describe("Custom field values to attach to the media")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/media/upload", body);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "list_media",
    "List all media files in the workspace with optional filtering, pagination, and sorting.",
    {
      mediaType: import_zod.z.enum(["audio", "video", "text"]).optional().describe('Filter by media type: "audio", "video", or "text"'),
      page: import_zod.z.number().int().positive().optional().describe("Page number for pagination (default: 1)"),
      pageSize: import_zod.z.number().int().positive().optional().describe("Number of results per page (default: 20)"),
      sortBy: import_zod.z.string().optional().describe('Sort field and direction, e.g. "createdAt:desc" or "name:asc"'),
      filterMedia: import_zod.z.number().int().optional().describe("Filter: 0=Uploaded, 1=Assigned, 2=Both (default: 2)"),
      filterName: import_zod.z.string().optional().describe("Filter media by partial name match"),
      folderId: import_zod.z.string().optional().describe("Filter media within a specific folder"),
      from: import_zod.z.string().optional().describe("Start date for date range filter (ISO 8601)"),
      to: import_zod.z.string().optional().describe("End date for date range filter (ISO 8601)"),
      isFavorites: import_zod.z.boolean().optional().describe("Filter to only show favorited media")
    },
    async (params) => {
      try {
        const result = await api.get("/v1/media", { params });
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "get_media_insights",
    "Retrieve AI-generated insights for a media file, including topics, sentiment, action items, and summaries.",
    {
      mediaId: import_zod.z.string().describe("Unique identifier of the media file")
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/media/insight/${mediaId}`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "get_transcript",
    "Retrieve the full transcript for a media file, including speaker labels and timestamps.",
    {
      mediaId: import_zod.z.string().describe("Unique identifier of the media file")
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/media/transcript/${mediaId}`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_transcript_speakers",
    "Update or rename speaker labels in a media transcript.",
    {
      mediaId: import_zod.z.string().describe("Unique identifier of the media file"),
      speakers: import_zod.z.array(
        import_zod.z.object({
          id: import_zod.z.string().describe("Speaker identifier from the transcript"),
          name: import_zod.z.string().describe("Display name to assign to the speaker")
        })
      ).describe("Array of speaker ID to name mappings")
    },
    async ({ mediaId, speakers }) => {
      try {
        const result = await api.put(
          `/v1/media/speakers/${mediaId}`,
          speakers
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "get_media_status",
    "Check the processing status of a media file (e.g. pending, transcribing, completed, failed).",
    {
      mediaId: import_zod.z.string().describe("Unique identifier of the media file")
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/media/status/${mediaId}`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_media_metadata",
    "Update metadata fields (name, description, tags, status) for an existing media file.",
    {
      mediaId: import_zod.z.string().describe("Unique identifier of the media file"),
      name: import_zod.z.string().optional().describe("New display name for the media"),
      description: import_zod.z.string().optional().describe("Description or notes for the media"),
      folderId: import_zod.z.string().optional().describe("Move media to this folder ID"),
      tags: import_zod.z.array(import_zod.z.string()).optional().describe("Array of tags to assign to the media"),
      status: import_zod.z.string().optional().describe("Media status value"),
      remark: import_zod.z.string().optional().describe("Internal remark or note"),
      manageBy: import_zod.z.string().optional().describe("User ID to assign management of this media to")
    },
    async ({ mediaId, ...body }) => {
      try {
        const result = await api.put(`/v1/media/${mediaId}`, body);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "delete_media",
    "Permanently delete a media file and all associated transcripts and insights.",
    {
      mediaId: import_zod.z.string().describe("Unique identifier of the media file to delete")
    },
    async ({ mediaId }) => {
      try {
        const result = await api.delete(`/v1/media/${mediaId}`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/text.ts
var text_exports = {};
__export(text_exports, {
  register: () => register2
});
var import_zod2 = require("zod");
function register2(server2, client) {
  const api = client ?? speakClient;
  server2.tool(
    "create_text_note",
    "Create a new text note in Speak AI for analysis. The content will be analyzed for insights, topics, and sentiment.",
    {
      name: import_zod2.z.string().describe("Title/name for the text note"),
      text: import_zod2.z.string().optional().describe("Full text content to analyze"),
      description: import_zod2.z.string().optional().describe("Description for the text note"),
      folderId: import_zod2.z.string().optional().describe("ID of the folder to place the note in"),
      tags: import_zod2.z.string().optional().describe("Comma-separated tags or array of tag strings"),
      callbackUrl: import_zod2.z.string().optional().describe("Webhook callback URL for completion notification"),
      fields: import_zod2.z.array(
        import_zod2.z.object({
          id: import_zod2.z.string().describe("Custom field ID"),
          value: import_zod2.z.string().describe("Custom field value")
        })
      ).optional().describe("Custom field values to attach to the text note")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/text/create", body);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "get_text_insight",
    "Retrieve AI-generated insights for a text note, including topics, sentiment, summaries, and action items.",
    {
      mediaId: import_zod2.z.string().describe("Unique identifier of the text note")
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/text/insight/${mediaId}`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "reanalyze_text",
    "Trigger a re-analysis of an existing text note to regenerate insights with the latest AI models.",
    {
      mediaId: import_zod2.z.string().describe("Unique identifier of the text note to reanalyze")
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/text/reanalyze/${mediaId}`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_text_note",
    "Update an existing text note's name, content, or metadata. Updating text content will trigger re-analysis.",
    {
      mediaId: import_zod2.z.string().describe("Unique identifier of the text note"),
      name: import_zod2.z.string().optional().describe("New name for the text note"),
      text: import_zod2.z.string().optional().describe("New text content (will trigger re-analysis)"),
      description: import_zod2.z.string().optional().describe("Updated description"),
      folderId: import_zod2.z.string().optional().describe("Move to a different folder"),
      tags: import_zod2.z.string().optional().describe("Updated comma-separated tags")
    },
    async ({ mediaId, ...body }) => {
      try {
        const result = await api.put(
          `/v1/text/update/${mediaId}`,
          body
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/exports.ts
var exports_exports = {};
__export(exports_exports, {
  register: () => register3
});
var import_zod3 = require("zod");
function register3(server2, client) {
  const api = client ?? speakClient;
  server2.tool(
    "export_media",
    "Export a media file's transcript or insights in various formats (pdf, docx, srt, vtt, txt, csv, md).",
    {
      mediaId: import_zod3.z.string().describe("Unique identifier of the media file"),
      fileType: import_zod3.z.enum(["pdf", "docx", "srt", "vtt", "txt", "csv", "md"]).describe("Desired export format"),
      isSpeakerNames: import_zod3.z.boolean().optional().describe("Include speaker names in export"),
      isSpeakerEmail: import_zod3.z.boolean().optional().describe("Include speaker emails in export"),
      isTimeStamps: import_zod3.z.boolean().optional().describe("Include timestamps in export"),
      isInsightVisualized: import_zod3.z.boolean().optional().describe("Include insight visualizations"),
      isRedacted: import_zod3.z.boolean().optional().describe("Apply PII redaction to export"),
      redactedCategories: import_zod3.z.array(import_zod3.z.string()).optional().describe("Specific categories to redact")
    },
    async ({ mediaId, fileType, ...query }) => {
      try {
        const result = await api.post(
          `/v1/media/export/${mediaId}/${fileType}`,
          null,
          { params: query }
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "export_multiple_media",
    "Export multiple media files at once, optionally merged into a single file.",
    {
      mediaIds: import_zod3.z.array(import_zod3.z.string()).describe("Array of media IDs to export"),
      fileType: import_zod3.z.enum(["pdf", "docx", "srt", "vtt", "txt", "csv", "md"]).describe("Desired export format"),
      isSpeakerNames: import_zod3.z.boolean().optional().describe("Include speaker names in export"),
      isSpeakerEmail: import_zod3.z.boolean().optional().describe("Include speaker emails in export"),
      isTimeStamps: import_zod3.z.boolean().optional().describe("Include timestamps in export"),
      isInsightVisualized: import_zod3.z.boolean().optional().describe("Include insight visualizations"),
      isRedacted: import_zod3.z.boolean().optional().describe("Apply PII redaction to export"),
      isMerged: import_zod3.z.boolean().optional().describe("Merge all exports into a single file"),
      folderId: import_zod3.z.string().optional().describe("Folder ID for the merged export")
    },
    async (body) => {
      try {
        const result = await api.post(
          "/v1/media/exportMultiple",
          body
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/folders.ts
var folders_exports = {};
__export(folders_exports, {
  register: () => register4
});
var import_zod4 = require("zod");
function register4(server2, client) {
  const api = client ?? speakClient;
  server2.tool(
    "get_all_folder_views",
    "Retrieve all saved views across all folders.",
    {},
    async () => {
      try {
        const result = await api.get("/v1/folders/views");
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "get_folder_views",
    "Retrieve all saved views for a specific folder.",
    {
      folderId: import_zod4.z.string().describe("Unique identifier of the folder")
    },
    async ({ folderId }) => {
      try {
        const result = await api.get(`/v1/folders/${folderId}/views`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "create_folder_view",
    "Create a new saved view for a folder with custom filters and display settings.",
    {
      folderId: import_zod4.z.string().describe("Unique identifier of the folder"),
      name: import_zod4.z.string().optional().describe("Display name for the view"),
      filters: import_zod4.z.record(import_zod4.z.unknown()).optional().describe("Filter configuration object")
    },
    async ({ folderId, ...body }) => {
      try {
        const result = await api.post(
          `/v1/folders/${folderId}/views`,
          body
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_folder_view",
    "Update an existing saved view's name, filters, or display settings.",
    {
      folderId: import_zod4.z.string().describe("Unique identifier of the folder"),
      viewId: import_zod4.z.string().describe("Unique identifier of the view to update"),
      name: import_zod4.z.string().optional().describe("New display name for the view"),
      filters: import_zod4.z.record(import_zod4.z.unknown()).optional().describe("Updated filter configuration")
    },
    async ({ folderId, viewId, ...body }) => {
      try {
        const result = await api.put(
          `/v1/folders/${folderId}/views/${viewId}`,
          body
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "clone_folder_view",
    "Duplicate an existing folder view.",
    {
      viewId: import_zod4.z.string().describe("Unique identifier of the view to clone")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/folders/views/clone", body);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "list_folders",
    "List all folders in the workspace with pagination and sorting.",
    {
      page: import_zod4.z.number().int().optional().describe("Page number (0-based)"),
      pageSize: import_zod4.z.number().int().optional().describe("Results per page"),
      sortBy: import_zod4.z.string().optional().describe('Sort field and direction, e.g. "createdAt:desc"')
    },
    async (params) => {
      try {
        const result = await api.get("/v1/folder", { params });
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "get_folder_info",
    "Get detailed information about a specific folder including its contents.",
    {
      folderId: import_zod4.z.string().describe("Unique identifier of the folder")
    },
    async ({ folderId }) => {
      try {
        const result = await api.get(`/v1/folder/${folderId}`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "create_folder",
    "Create a new folder in the workspace.",
    {
      name: import_zod4.z.string().describe("Display name for the new folder"),
      parentFolderId: import_zod4.z.string().optional().describe("ID of the parent folder for nesting")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/folder", body);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "clone_folder",
    "Duplicate an existing folder and all of its contents.",
    {
      folderId: import_zod4.z.string().describe("ID of the folder to clone")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/folder/clone", body);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_folder",
    "Update a folder's name or other properties.",
    {
      folderId: import_zod4.z.string().describe("Unique identifier of the folder"),
      name: import_zod4.z.string().optional().describe("New display name for the folder")
    },
    async ({ folderId, ...body }) => {
      try {
        const result = await api.put(`/v1/folder/${folderId}`, body);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "delete_folder",
    "Permanently delete a folder. Media within the folder will be moved, not deleted.",
    {
      folderId: import_zod4.z.string().describe("Unique identifier of the folder to delete")
    },
    async ({ folderId }) => {
      try {
        const result = await api.delete(`/v1/folder/${folderId}`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) }
          ]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/recorder.ts
var recorder_exports = {};
__export(recorder_exports, {
  register: () => register5
});
var import_zod5 = require("zod");
function register5(server2, client) {
  const api = client ?? speakClient;
  server2.tool(
    "check_recorder_status",
    "Check whether a recorder/survey is active and accepting submissions.",
    {
      token: import_zod5.z.string().describe("Unique token identifying the recorder")
    },
    async ({ token }) => {
      try {
        const result = await api.get(`/v1/recorder/status/${token}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "create_recorder",
    "Create a new recorder or survey for collecting audio/video submissions.",
    {
      name: import_zod5.z.string().optional().describe("Display name for the recorder"),
      folderId: import_zod5.z.string().optional().describe("Folder to store recordings in"),
      settings: import_zod5.z.record(import_zod5.z.unknown()).optional().describe("Recorder configuration settings")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/recorder/create", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "list_recorders",
    "List all recorders/surveys in the workspace.",
    {
      page: import_zod5.z.number().int().optional().describe("Page number (0-based)"),
      pageSize: import_zod5.z.number().int().optional().describe("Results per page"),
      sortBy: import_zod5.z.string().optional().describe('Sort field, e.g. "createdAt:desc"')
    },
    async (params) => {
      try {
        const result = await api.get("/v1/recorder", { params });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "clone_recorder",
    "Duplicate an existing recorder including all its settings and questions.",
    {
      recorderId: import_zod5.z.string().describe("ID of the recorder to clone")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/recorder/clone", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "get_recorder_info",
    "Get detailed information about a specific recorder including its settings and questions.",
    {
      recorderId: import_zod5.z.string().describe("Unique identifier of the recorder")
    },
    async ({ recorderId }) => {
      try {
        const result = await api.get(`/v1/recorder/${recorderId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "get_recorder_recordings",
    "List all submissions/recordings collected by a specific recorder.",
    {
      recorderId: import_zod5.z.string().describe("Unique identifier of the recorder")
    },
    async ({ recorderId }) => {
      try {
        const result = await api.get(`/v1/recorder/recordings/${recorderId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "generate_recorder_url",
    "Generate a shareable public URL for a recorder/survey.",
    {
      recorderId: import_zod5.z.string().describe("Unique identifier of the recorder")
    },
    async ({ recorderId }) => {
      try {
        const result = await api.get(`/v1/recorder/url/${recorderId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_recorder_settings",
    "Update configuration settings for a recorder (branding, permissions, etc.).",
    {
      recorderId: import_zod5.z.string().describe("Unique identifier of the recorder"),
      settings: import_zod5.z.record(import_zod5.z.unknown()).describe("Settings object with updated values")
    },
    async ({ recorderId, settings }) => {
      try {
        const result = await api.put(`/v1/recorder/settings/${recorderId}`, settings);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_recorder_questions",
    "Update the survey questions for a recorder.",
    {
      recorderId: import_zod5.z.string().describe("Unique identifier of the recorder"),
      questions: import_zod5.z.array(import_zod5.z.record(import_zod5.z.unknown())).describe("Array of question objects")
    },
    async ({ recorderId, questions }) => {
      try {
        const result = await api.put(`/v1/recorder/questions/${recorderId}`, { questions });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "delete_recorder",
    "Permanently delete a recorder/survey. Existing recordings are preserved.",
    {
      recorderId: import_zod5.z.string().describe("Unique identifier of the recorder to delete")
    },
    async ({ recorderId }) => {
      try {
        const result = await api.delete(`/v1/recorder/${recorderId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/embed.ts
var embed_exports = {};
__export(embed_exports, {
  register: () => register6
});
var import_zod6 = require("zod");
function register6(server2, client) {
  const api = client ?? speakClient;
  server2.tool(
    "create_embed",
    "Create an embeddable player/transcript widget for a media file.",
    {
      mediaId: import_zod6.z.string().describe("Unique identifier of the media file"),
      settings: import_zod6.z.record(import_zod6.z.unknown()).optional().describe("Embed configuration settings")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/embed", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_embed",
    "Update settings for an existing embed widget.",
    {
      embedId: import_zod6.z.string().describe("Unique identifier of the embed"),
      settings: import_zod6.z.record(import_zod6.z.unknown()).optional().describe("Updated embed settings")
    },
    async ({ embedId, ...body }) => {
      try {
        const result = await api.put(`/v1/embed/${embedId}`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "check_embed",
    "Check if an embed exists for a media file and retrieve its configuration.",
    {
      mediaId: import_zod6.z.string().describe("Unique identifier of the media file")
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/embed/${mediaId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "get_embed_iframe_url",
    "Get the iframe URL for embedding a media player/transcript on a webpage.",
    {
      mediaId: import_zod6.z.string().describe("Unique identifier of the media file")
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get("/v1/embed/iframe", {
          params: { mediaId }
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/prompt.ts
var prompt_exports = {};
__export(prompt_exports, {
  register: () => register7
});
var import_zod7 = require("zod");
function register7(server2, client) {
  const api = client ?? speakClient;
  server2.tool(
    "list_prompts",
    "List all available Magic Prompt templates for AI-powered questions about your media.",
    {},
    async () => {
      try {
        const result = await api.get("/v1/prompt");
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "ask_magic_prompt",
    "Ask an AI-powered question about a specific media file using Speak AI's Magic Prompt.",
    {
      mediaId: import_zod7.z.string().describe("Unique identifier of the media file to query"),
      prompt: import_zod7.z.string().describe("The question or prompt to ask about the media"),
      promptId: import_zod7.z.string().optional().describe("ID of a predefined prompt template to use")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/prompt", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/meeting.ts
var meeting_exports = {};
__export(meeting_exports, {
  register: () => register8
});
var import_zod8 = require("zod");
function register8(server2, client) {
  const api = client ?? speakClient;
  server2.tool(
    "list_meeting_events",
    "List scheduled or completed meeting assistant events with filtering and pagination.",
    {
      platformType: import_zod8.z.string().optional().describe("Filter by platform (e.g. zoom, teams, meet)"),
      meetingStatus: import_zod8.z.string().optional().describe("Filter by status (e.g. scheduled, completed, cancelled)"),
      page: import_zod8.z.number().int().optional().describe("Page number (0-based)"),
      pageSize: import_zod8.z.number().int().optional().describe("Results per page")
    },
    async (params) => {
      try {
        const result = await api.get("/v1/meeting-assistant/events", {
          params
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "schedule_meeting_event",
    "Schedule the Speak AI meeting assistant to join and record an upcoming meeting.",
    {
      meetingUrl: import_zod8.z.string().describe("URL of the meeting to join"),
      title: import_zod8.z.string().optional().describe("Display title for the event"),
      scheduledAt: import_zod8.z.string().optional().describe("ISO 8601 datetime for when the meeting starts")
    },
    async (body) => {
      try {
        const result = await api.post(
          "/v1/meeting-assistant/events/schedule",
          body
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "remove_assistant_from_meeting",
    "Remove the Speak AI assistant from an active or scheduled meeting.",
    {
      meetingAssistantEventId: import_zod8.z.string().describe("Unique identifier of the meeting assistant event")
    },
    async ({ meetingAssistantEventId }) => {
      try {
        const result = await api.put(
          "/v1/meeting-assistant/events/remove",
          null,
          { params: { meetingAssistantEventId } }
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "delete_scheduled_assistant",
    "Cancel and delete a scheduled meeting assistant event.",
    {
      meetingAssistantEventId: import_zod8.z.string().describe("Unique identifier of the meeting assistant event to cancel")
    },
    async ({ meetingAssistantEventId }) => {
      try {
        const result = await api.delete(
          "/v1/meeting-assistant/events",
          { params: { meetingAssistantEventId } }
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/fields.ts
var fields_exports = {};
__export(fields_exports, {
  register: () => register9
});
var import_zod9 = require("zod");
function register9(server2, client) {
  const api = client ?? speakClient;
  server2.tool(
    "list_fields",
    "List all custom fields defined in the workspace.",
    {},
    async () => {
      try {
        const result = await api.get("/v1/fields");
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "create_field",
    "Create a new custom field for categorizing and tagging media.",
    {
      name: import_zod9.z.string().describe("Display name for the field"),
      type: import_zod9.z.string().optional().describe("Field type (text, number, select, etc.)"),
      options: import_zod9.z.array(import_zod9.z.string()).optional().describe("Options for select/multi-select field types")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/fields", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_multiple_fields",
    "Update multiple custom fields in a single batch operation.",
    {
      fields: import_zod9.z.array(import_zod9.z.record(import_zod9.z.unknown())).describe("Array of field objects to update")
    },
    async ({ fields }) => {
      try {
        const result = await api.post("/v1/fields/multi", { fields });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_field",
    "Update a specific custom field by ID.",
    {
      id: import_zod9.z.string().describe("Unique identifier of the field"),
      name: import_zod9.z.string().optional().describe("New display name"),
      type: import_zod9.z.string().optional().describe("New field type"),
      options: import_zod9.z.array(import_zod9.z.string()).optional().describe("Updated options for select types")
    },
    async ({ id, ...body }) => {
      try {
        const result = await api.put(`/v1/fields/${id}`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/automations.ts
var automations_exports = {};
__export(automations_exports, {
  register: () => register10
});
var import_zod10 = require("zod");
function register10(server2, client) {
  const api = client ?? speakClient;
  server2.tool(
    "list_automations",
    "List all automation rules configured in the workspace.",
    {},
    async () => {
      try {
        const result = await api.get("/v1/automations");
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "get_automation",
    "Get detailed information about a specific automation rule.",
    {
      automationId: import_zod10.z.string().describe("Unique identifier of the automation")
    },
    async ({ automationId }) => {
      try {
        const result = await api.get(`/v1/automations/${automationId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "create_automation",
    "Create a new automation rule for automatic media processing workflows.",
    {
      name: import_zod10.z.string().optional().describe("Display name for the automation"),
      trigger: import_zod10.z.record(import_zod10.z.unknown()).optional().describe("Trigger configuration"),
      actions: import_zod10.z.array(import_zod10.z.record(import_zod10.z.unknown())).optional().describe("Array of action configurations"),
      config: import_zod10.z.record(import_zod10.z.unknown()).optional().describe("Full automation configuration object")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/automations/", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_automation",
    "Update an existing automation rule's configuration.",
    {
      automationId: import_zod10.z.string().describe("Unique identifier of the automation"),
      name: import_zod10.z.string().optional().describe("New display name"),
      trigger: import_zod10.z.record(import_zod10.z.unknown()).optional().describe("Updated trigger configuration"),
      actions: import_zod10.z.array(import_zod10.z.record(import_zod10.z.unknown())).optional().describe("Updated action configurations"),
      config: import_zod10.z.record(import_zod10.z.unknown()).optional().describe("Full updated configuration object")
    },
    async ({ automationId, ...body }) => {
      try {
        const result = await api.put(
          `/v1/automations/${automationId}`,
          body
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "toggle_automation_status",
    "Enable or disable an automation rule.",
    {
      automationId: import_zod10.z.string().describe("Unique identifier of the automation"),
      enabled: import_zod10.z.boolean().describe("Set to true to enable, false to disable")
    },
    async ({ automationId, enabled }) => {
      try {
        const result = await api.put(
          `/v1/automations/status/${automationId}`,
          { enabled }
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/webhooks.ts
var webhooks_exports = {};
__export(webhooks_exports, {
  register: () => register11
});
var import_zod11 = require("zod");
function register11(server2, client) {
  const api = client ?? speakClient;
  server2.tool(
    "create_webhook",
    "Create a new webhook to receive real-time notifications when events occur in Speak AI.",
    {
      url: import_zod11.z.string().url().describe("HTTPS endpoint URL to receive webhook payloads"),
      events: import_zod11.z.array(import_zod11.z.string()).optional().describe("Array of event types to subscribe to")
    },
    async (body) => {
      try {
        const result = await api.post("/v1/webhook", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "list_webhooks",
    "List all configured webhooks in the workspace.",
    {},
    async () => {
      try {
        const result = await api.get("/v1/webhook");
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "update_webhook",
    "Update an existing webhook's URL or subscribed events.",
    {
      webhookId: import_zod11.z.string().describe("Unique identifier of the webhook"),
      url: import_zod11.z.string().url().optional().describe("New endpoint URL"),
      events: import_zod11.z.array(import_zod11.z.string()).optional().describe("Updated array of event types")
    },
    async ({ webhookId, ...body }) => {
      try {
        const result = await api.put(`/v1/webhook/${webhookId}`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  server2.tool(
    "delete_webhook",
    "Delete a webhook and stop receiving notifications at its endpoint.",
    {
      webhookId: import_zod11.z.string().describe("Unique identifier of the webhook to delete")
    },
    async ({ webhookId }) => {
      try {
        const result = await api.delete(`/v1/webhook/${webhookId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
}

// src/tools/index.ts
var modules = [
  media_exports,
  text_exports,
  exports_exports,
  folders_exports,
  recorder_exports,
  embed_exports,
  prompt_exports,
  meeting_exports,
  fields_exports,
  automations_exports,
  webhooks_exports
];
function registerAllTools(server2, client) {
  for (const mod of modules) {
    mod.register(server2, client);
  }
}

// src/index.ts
var server = new import_mcp.McpServer({
  name: "speak-ai",
  version: "1.0.0"
});
registerAllTools(server);
async function main() {
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[speak-mcp] Server started on stdio transport\n");
}
main().catch((err) => {
  process.stderr.write(`[speak-mcp] Fatal error: ${err}
`);
  process.exit(1);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createSpeakClient,
  formatAxiosError,
  registerAllTools
});
