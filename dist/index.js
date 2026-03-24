#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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

// src/client.ts
var client_exports = {};
__export(client_exports, {
  createSpeakClient: () => createSpeakClient,
  formatAxiosError: () => formatAxiosError,
  speakClient: () => speakClient
});
function getBaseUrl() {
  return process.env.SPEAK_BASE_URL ?? "https://api.speakai.co";
}
function getApiKey() {
  return process.env.SPEAK_API_KEY ?? "";
}
async function authenticate() {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("SPEAK_API_KEY is not set. Run 'speakai-mcp config set-key' or set the environment variable.");
  }
  try {
    const res = await import_axios.default.post(
      `${getBaseUrl()}/v1/auth/accessToken`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          "x-speakai-key": apiKey
        }
      }
    );
    if (res.data?.data?.accessToken) {
      accessToken = res.data.data.accessToken;
      refreshToken = res.data.data.refreshToken ?? "";
      tokenExpiresAt = Date.now() + 50 * 60 * 1e3;
      process.stderr.write("[speakai-mcp] Authenticated successfully\n");
    }
  } catch (err) {
    process.stderr.write(
      `[speakai-mcp] Authentication failed: ${err instanceof Error ? err.message : err}
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
      `${getBaseUrl()}/v1/auth/refreshToken`,
      { refreshToken },
      {
        headers: {
          "Content-Type": "application/json",
          "x-speakai-key": getApiKey(),
          "x-access-token": accessToken
        }
      }
    );
    if (res.data?.data?.accessToken) {
      accessToken = res.data.data.accessToken;
      refreshToken = res.data.data.refreshToken ?? refreshToken;
      tokenExpiresAt = Date.now() + 50 * 60 * 1e3;
      process.stderr.write("[speakai-mcp] Token refreshed\n");
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
var import_axios, accessToken, refreshToken, tokenExpiresAt, speakClient;
var init_client = __esm({
  "src/client.ts"() {
    "use strict";
    import_axios = __toESM(require("axios"));
    accessToken = process.env.SPEAK_ACCESS_TOKEN ?? "";
    refreshToken = "";
    tokenExpiresAt = 0;
    speakClient = import_axios.default.create({
      headers: { "Content-Type": "application/json" },
      timeout: 6e4
    });
    speakClient.interceptors.request.use(
      async (config) => {
        config.baseURL = getBaseUrl();
        await ensureAuthenticated();
        config.headers.set("x-speakai-key", getApiKey());
        config.headers.set("x-access-token", accessToken);
        return config;
      }
    );
    speakClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        const retryCount = originalRequest._retryCount ?? 0;
        if (error.response?.status === 401 && retryCount < 2) {
          originalRequest._retryCount = retryCount + 1;
          tokenExpiresAt = 0;
          await ensureAuthenticated();
          originalRequest.headers["x-speakai-key"] = getApiKey();
          originalRequest.headers["x-access-token"] = accessToken;
          return speakClient(originalRequest);
        }
        return Promise.reject(error);
      }
    );
  }
});

// src/tools/media.ts
var media_exports = {};
__export(media_exports, {
  register: () => register
});
function register(server, client) {
  const api = client ?? speakClient;
  server.tool(
    "get_signed_upload_url",
    "Get a pre-signed S3 URL for direct media file upload. Use this before uploading a file directly to Speak AI storage.",
    {
      isVideo: import_zod.z.boolean().describe("Set true for video files, false for audio files"),
      filename: import_zod.z.string().min(1).describe("Original filename including extension"),
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
  server.tool(
    "upload_media",
    "Upload a media file to Speak AI by providing a publicly accessible URL. Speak AI will fetch and process the file asynchronously.",
    {
      name: import_zod.z.string().min(1).describe("Display name for the media file"),
      url: import_zod.z.string().describe("Publicly accessible URL of the media file (or pre-signed S3 URL)"),
      mediaType: import_zod.z.enum(["audio", "video"]).describe('Type of media: "audio" or "video"'),
      description: import_zod.z.string().optional().describe("Description of the media file"),
      sourceLanguage: import_zod.z.string().optional().describe('BCP-47 language code for transcription, e.g. "en-US" or "he-IL"'),
      tags: import_zod.z.string().optional().describe("Comma-separated tags for the media"),
      folderId: import_zod.z.string().optional().describe("ID of the folder to place the media in"),
      callbackUrl: import_zod.z.string().optional().describe("Webhook callback URL for this specific upload"),
      fields: import_zod.z.array(
        import_zod.z.object({
          id: import_zod.z.string().min(1).describe("Custom field ID"),
          value: import_zod.z.string().min(1).describe("Custom field value")
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
  server.tool(
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
  server.tool(
    "get_media_insights",
    "Retrieve AI-generated insights for a media file, including topics, sentiment, action items, and summaries.",
    {
      mediaId: import_zod.z.string().min(1).describe("Unique identifier of the media file")
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
  server.tool(
    "get_transcript",
    "Retrieve the full transcript for a media file, including speaker labels and timestamps.",
    {
      mediaId: import_zod.z.string().min(1).describe("Unique identifier of the media file")
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
  server.tool(
    "update_transcript_speakers",
    "Update or rename speaker labels in a media transcript.",
    {
      mediaId: import_zod.z.string().min(1).describe("Unique identifier of the media file"),
      speakers: import_zod.z.array(
        import_zod.z.object({
          id: import_zod.z.string().min(1).describe("Speaker identifier from the transcript"),
          name: import_zod.z.string().min(1).describe("Display name to assign to the speaker")
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
  server.tool(
    "get_media_status",
    "Check the processing status of a media file (e.g. pending, transcribing, completed, failed).",
    {
      mediaId: import_zod.z.string().min(1).describe("Unique identifier of the media file")
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
  server.tool(
    "update_media_metadata",
    "Update metadata fields (name, description, tags, status) for an existing media file.",
    {
      mediaId: import_zod.z.string().min(1).describe("Unique identifier of the media file"),
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
  server.tool(
    "delete_media",
    "Permanently delete a media file and all associated transcripts and insights.",
    {
      mediaId: import_zod.z.string().min(1).describe("Unique identifier of the media file to delete")
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
var import_zod;
var init_media = __esm({
  "src/tools/media.ts"() {
    "use strict";
    import_zod = require("zod");
    init_client();
  }
});

// src/tools/text.ts
var text_exports = {};
__export(text_exports, {
  register: () => register2
});
function register2(server, client) {
  const api = client ?? speakClient;
  server.tool(
    "create_text_note",
    "Create a new text note in Speak AI for analysis. The content will be analyzed for insights, topics, and sentiment.",
    {
      name: import_zod2.z.string().min(1).describe("Title/name for the text note"),
      text: import_zod2.z.string().optional().describe("Full text content to analyze"),
      description: import_zod2.z.string().optional().describe("Description for the text note"),
      folderId: import_zod2.z.string().optional().describe("ID of the folder to place the note in"),
      tags: import_zod2.z.string().optional().describe("Comma-separated tags or array of tag strings"),
      callbackUrl: import_zod2.z.string().optional().describe("Webhook callback URL for completion notification"),
      fields: import_zod2.z.array(
        import_zod2.z.object({
          id: import_zod2.z.string().min(1).describe("Custom field ID"),
          value: import_zod2.z.string().min(1).describe("Custom field value")
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
  server.tool(
    "get_text_insight",
    "Retrieve AI-generated insights for a text note, including topics, sentiment, summaries, and action items.",
    {
      mediaId: import_zod2.z.string().min(1).describe("Unique identifier of the text note")
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
  server.tool(
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
  server.tool(
    "update_text_note",
    "Update an existing text note's name, content, or metadata. Updating text content will trigger re-analysis.",
    {
      mediaId: import_zod2.z.string().min(1).describe("Unique identifier of the text note"),
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
var import_zod2;
var init_text = __esm({
  "src/tools/text.ts"() {
    "use strict";
    import_zod2 = require("zod");
    init_client();
  }
});

// src/tools/exports.ts
var exports_exports = {};
__export(exports_exports, {
  register: () => register3
});
function register3(server, client) {
  const api = client ?? speakClient;
  server.tool(
    "export_media",
    "Export a media file's transcript or insights in various formats (pdf, docx, srt, vtt, txt, csv, md).",
    {
      mediaId: import_zod3.z.string().min(1).describe("Unique identifier of the media file"),
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
  server.tool(
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
var import_zod3;
var init_exports = __esm({
  "src/tools/exports.ts"() {
    "use strict";
    import_zod3 = require("zod");
    init_client();
  }
});

// src/tools/folders.ts
var folders_exports = {};
__export(folders_exports, {
  register: () => register4
});
function register4(server, client) {
  const api = client ?? speakClient;
  server.tool(
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
  server.tool(
    "get_folder_views",
    "Retrieve all saved views for a specific folder.",
    {
      folderId: import_zod4.z.string().min(1).describe("Unique identifier of the folder")
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
  server.tool(
    "create_folder_view",
    "Create a new saved view for a folder with custom filters and display settings.",
    {
      folderId: import_zod4.z.string().min(1).describe("Unique identifier of the folder"),
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
  server.tool(
    "update_folder_view",
    "Update an existing saved view's name, filters, or display settings.",
    {
      folderId: import_zod4.z.string().min(1).describe("Unique identifier of the folder"),
      viewId: import_zod4.z.string().min(1).describe("Unique identifier of the view to update"),
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
  server.tool(
    "clone_folder_view",
    "Duplicate an existing folder view.",
    {
      viewId: import_zod4.z.string().min(1).describe("Unique identifier of the view to clone")
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
  server.tool(
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
  server.tool(
    "get_folder_info",
    "Get detailed information about a specific folder including its contents.",
    {
      folderId: import_zod4.z.string().min(1).describe("Unique identifier of the folder")
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
  server.tool(
    "create_folder",
    "Create a new folder in the workspace.",
    {
      name: import_zod4.z.string().min(1).describe("Display name for the new folder"),
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
  server.tool(
    "clone_folder",
    "Duplicate an existing folder and all of its contents.",
    {
      folderId: import_zod4.z.string().min(1).describe("ID of the folder to clone")
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
  server.tool(
    "update_folder",
    "Update a folder's name or other properties.",
    {
      folderId: import_zod4.z.string().min(1).describe("Unique identifier of the folder"),
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
  server.tool(
    "delete_folder",
    "Permanently delete a folder. Media within the folder will be moved, not deleted.",
    {
      folderId: import_zod4.z.string().min(1).describe("Unique identifier of the folder to delete")
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
var import_zod4;
var init_folders = __esm({
  "src/tools/folders.ts"() {
    "use strict";
    import_zod4 = require("zod");
    init_client();
  }
});

// src/tools/recorder.ts
var recorder_exports = {};
__export(recorder_exports, {
  register: () => register5
});
function register5(server, client) {
  const api = client ?? speakClient;
  server.tool(
    "check_recorder_status",
    "Check whether a recorder/survey is active and accepting submissions.",
    {
      token: import_zod5.z.string().min(1).describe("Unique token identifying the recorder")
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
  server.tool(
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
  server.tool(
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
  server.tool(
    "clone_recorder",
    "Duplicate an existing recorder including all its settings and questions.",
    {
      recorderId: import_zod5.z.string().min(1).describe("ID of the recorder to clone")
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
  server.tool(
    "get_recorder_info",
    "Get detailed information about a specific recorder including its settings and questions.",
    {
      recorderId: import_zod5.z.string().min(1).describe("Unique identifier of the recorder")
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
  server.tool(
    "get_recorder_recordings",
    "List all submissions/recordings collected by a specific recorder.",
    {
      recorderId: import_zod5.z.string().min(1).describe("Unique identifier of the recorder")
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
  server.tool(
    "generate_recorder_url",
    "Generate a shareable public URL for a recorder/survey.",
    {
      recorderId: import_zod5.z.string().min(1).describe("Unique identifier of the recorder")
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
  server.tool(
    "update_recorder_settings",
    "Update configuration settings for a recorder (branding, permissions, etc.).",
    {
      recorderId: import_zod5.z.string().min(1).describe("Unique identifier of the recorder"),
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
  server.tool(
    "update_recorder_questions",
    "Update the survey questions for a recorder.",
    {
      recorderId: import_zod5.z.string().min(1).describe("Unique identifier of the recorder"),
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
  server.tool(
    "delete_recorder",
    "Permanently delete a recorder/survey. Existing recordings are preserved.",
    {
      recorderId: import_zod5.z.string().min(1).describe("Unique identifier of the recorder to delete")
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
var import_zod5;
var init_recorder = __esm({
  "src/tools/recorder.ts"() {
    "use strict";
    import_zod5 = require("zod");
    init_client();
  }
});

// src/tools/embed.ts
var embed_exports = {};
__export(embed_exports, {
  register: () => register6
});
function register6(server, client) {
  const api = client ?? speakClient;
  server.tool(
    "create_embed",
    "Create an embeddable player/transcript widget for a media file.",
    {
      mediaId: import_zod6.z.string().min(1).describe("Unique identifier of the media file"),
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
  server.tool(
    "update_embed",
    "Update settings for an existing embed widget.",
    {
      embedId: import_zod6.z.string().min(1).describe("Unique identifier of the embed"),
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
  server.tool(
    "check_embed",
    "Check if an embed exists for a media file and retrieve its configuration.",
    {
      mediaId: import_zod6.z.string().min(1).describe("Unique identifier of the media file")
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
  server.tool(
    "get_embed_iframe_url",
    "Get the iframe URL for embedding a media player/transcript on a webpage.",
    {
      mediaId: import_zod6.z.string().min(1).describe("Unique identifier of the media file")
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
var import_zod6;
var init_embed = __esm({
  "src/tools/embed.ts"() {
    "use strict";
    import_zod6 = require("zod");
    init_client();
  }
});

// src/tools/prompt.ts
var prompt_exports = {};
__export(prompt_exports, {
  register: () => register7
});
function register7(server, client) {
  const api = client ?? speakClient;
  server.tool(
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
  server.tool(
    "ask_magic_prompt",
    "Ask an AI-powered question about a specific media file using Speak AI's Magic Prompt.",
    {
      mediaId: import_zod7.z.string().min(1).describe("Unique identifier of the media file to query"),
      prompt: import_zod7.z.string().min(1).describe("The question or prompt to ask about the media"),
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
var import_zod7;
var init_prompt = __esm({
  "src/tools/prompt.ts"() {
    "use strict";
    import_zod7 = require("zod");
    init_client();
  }
});

// src/tools/meeting.ts
var meeting_exports = {};
__export(meeting_exports, {
  register: () => register8
});
function register8(server, client) {
  const api = client ?? speakClient;
  server.tool(
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
  server.tool(
    "schedule_meeting_event",
    "Schedule the Speak AI meeting assistant to join and record an upcoming meeting.",
    {
      meetingUrl: import_zod8.z.string().min(1).describe("URL of the meeting to join"),
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
  server.tool(
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
  server.tool(
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
var import_zod8;
var init_meeting = __esm({
  "src/tools/meeting.ts"() {
    "use strict";
    import_zod8 = require("zod");
    init_client();
  }
});

// src/tools/fields.ts
var fields_exports = {};
__export(fields_exports, {
  register: () => register9
});
function register9(server, client) {
  const api = client ?? speakClient;
  server.tool(
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
  server.tool(
    "create_field",
    "Create a new custom field for categorizing and tagging media.",
    {
      name: import_zod9.z.string().min(1).describe("Display name for the field"),
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
  server.tool(
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
  server.tool(
    "update_field",
    "Update a specific custom field by ID.",
    {
      id: import_zod9.z.string().min(1).describe("Unique identifier of the field"),
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
var import_zod9;
var init_fields = __esm({
  "src/tools/fields.ts"() {
    "use strict";
    import_zod9 = require("zod");
    init_client();
  }
});

// src/tools/automations.ts
var automations_exports = {};
__export(automations_exports, {
  register: () => register10
});
function register10(server, client) {
  const api = client ?? speakClient;
  server.tool(
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
  server.tool(
    "get_automation",
    "Get detailed information about a specific automation rule.",
    {
      automationId: import_zod10.z.string().min(1).describe("Unique identifier of the automation")
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
  server.tool(
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
  server.tool(
    "update_automation",
    "Update an existing automation rule's configuration.",
    {
      automationId: import_zod10.z.string().min(1).describe("Unique identifier of the automation"),
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
  server.tool(
    "toggle_automation_status",
    "Enable or disable an automation rule.",
    {
      automationId: import_zod10.z.string().min(1).describe("Unique identifier of the automation"),
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
var import_zod10;
var init_automations = __esm({
  "src/tools/automations.ts"() {
    "use strict";
    import_zod10 = require("zod");
    init_client();
  }
});

// src/tools/webhooks.ts
var webhooks_exports = {};
__export(webhooks_exports, {
  register: () => register11
});
function register11(server, client) {
  const api = client ?? speakClient;
  server.tool(
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
  server.tool(
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
  server.tool(
    "update_webhook",
    "Update an existing webhook's URL or subscribed events.",
    {
      webhookId: import_zod11.z.string().min(1).describe("Unique identifier of the webhook"),
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
  server.tool(
    "delete_webhook",
    "Delete a webhook and stop receiving notifications at its endpoint.",
    {
      webhookId: import_zod11.z.string().min(1).describe("Unique identifier of the webhook to delete")
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
var import_zod11;
var init_webhooks = __esm({
  "src/tools/webhooks.ts"() {
    "use strict";
    import_zod11 = require("zod");
    init_client();
  }
});

// src/tools/index.ts
var tools_exports = {};
__export(tools_exports, {
  registerAllTools: () => registerAllTools
});
function registerAllTools(server, client) {
  for (const mod of modules) {
    mod.register(server, client);
  }
}
var modules;
var init_tools = __esm({
  "src/tools/index.ts"() {
    "use strict";
    init_media();
    init_text();
    init_exports();
    init_folders();
    init_recorder();
    init_embed();
    init_prompt();
    init_meeting();
    init_fields();
    init_automations();
    init_webhooks();
    modules = [
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
  }
});

// src/cli/config.ts
var config_exports = {};
__export(config_exports, {
  getConfigPath: () => getConfigPath,
  loadConfig: () => loadConfig,
  resolveApiKey: () => resolveApiKey,
  resolveBaseUrl: () => resolveBaseUrl,
  saveConfig: () => saveConfig
});
function ensureDir() {
  if (!import_fs.default.existsSync(CONFIG_DIR)) {
    import_fs.default.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}
function loadConfig() {
  try {
    if (import_fs.default.existsSync(CONFIG_FILE)) {
      return JSON.parse(import_fs.default.readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch {
  }
  return {};
}
function saveConfig(config) {
  ensureDir();
  import_fs.default.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    mode: 384
    // Owner read/write only
  });
}
function resolveApiKey() {
  if (process.env.SPEAK_API_KEY) return process.env.SPEAK_API_KEY;
  const config = loadConfig();
  if (config.apiKey) {
    process.env.SPEAK_API_KEY = config.apiKey;
    return config.apiKey;
  }
  return void 0;
}
function resolveBaseUrl() {
  if (process.env.SPEAK_BASE_URL) return process.env.SPEAK_BASE_URL;
  const config = loadConfig();
  if (config.baseUrl) {
    process.env.SPEAK_BASE_URL = config.baseUrl;
    return config.baseUrl;
  }
  return "https://api.speakai.co";
}
function getConfigPath() {
  return CONFIG_FILE;
}
var import_fs, import_path, import_os, CONFIG_DIR, CONFIG_FILE;
var init_config = __esm({
  "src/cli/config.ts"() {
    "use strict";
    import_fs = __toESM(require("fs"));
    import_path = __toESM(require("path"));
    import_os = __toESM(require("os"));
    CONFIG_DIR = import_path.default.join(import_os.default.homedir(), ".speakai");
    CONFIG_FILE = import_path.default.join(CONFIG_DIR, "config.json");
  }
});

// src/cli/format.ts
function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}
function printTable(rows, columns) {
  if (rows.length === 0) {
    console.log("No results found.");
    return;
  }
  const widths = columns.map((col) => {
    const maxData = rows.reduce(
      (max, row) => Math.max(max, String(row[col.key] ?? "").length),
      0
    );
    return col.width ?? Math.max(col.label.length, Math.min(maxData, 50));
  });
  const header = columns.map((col, i) => col.label.padEnd(widths[i])).join("  ");
  console.log(header);
  console.log(widths.map((w) => "\u2500".repeat(w)).join("\u2500\u2500"));
  for (const row of rows) {
    const line = columns.map((col, i) => {
      const val = String(row[col.key] ?? "\u2014");
      return val.length > widths[i] ? val.slice(0, widths[i] - 1) + "\u2026" : val.padEnd(widths[i]);
    }).join("  ");
    console.log(line);
  }
  console.log(`
${rows.length} result${rows.length === 1 ? "" : "s"}`);
}
function printError(message) {
  console.error(`Error: ${message}`);
}
function printSuccess(message) {
  console.log(message);
}
var init_format = __esm({
  "src/cli/format.ts"() {
    "use strict";
  }
});

// src/cli/index.ts
var cli_exports = {};
__export(cli_exports, {
  createCli: () => createCli
});
async function getClient() {
  const { speakClient: speakClient2 } = await Promise.resolve().then(() => (init_client(), client_exports));
  return speakClient2;
}
function requireApiKey() {
  const key = resolveApiKey();
  resolveBaseUrl();
  if (!key) {
    printError(
      'No API key configured. Run "speakai-mcp config set-key" or set SPEAK_API_KEY.'
    );
    process.exit(1);
  }
}
function createCli() {
  const program = new import_commander.Command();
  program.name("speakai-mcp").description(
    "Speak AI CLI & MCP Server \u2014 transcribe, analyze, and manage media from the command line"
  ).version("1.0.0");
  const config = program.command("config").description("Manage configuration");
  config.command("set-key").description("Set your Speak AI API key").argument("[key]", "API key (omit for interactive prompt)").action(async (key) => {
    if (!key) {
      const rl = (0, import_readline.createInterface)({
        input: process.stdin,
        output: process.stdout
      });
      key = await new Promise(
        (resolve) => rl.question("Enter your Speak AI API key: ", (answer) => {
          rl.close();
          resolve(answer.trim());
        })
      );
    }
    if (!key) {
      printError("No key provided.");
      process.exit(1);
    }
    const cfg = loadConfig();
    cfg.apiKey = key;
    saveConfig(cfg);
    printSuccess(`API key saved to ${getConfigPath()}`);
  });
  config.command("show").description("Show current configuration").action(() => {
    const cfg = loadConfig();
    const envKey = process.env.SPEAK_API_KEY;
    console.log(`Config file: ${getConfigPath()}`);
    console.log(
      `API key:     ${cfg.apiKey ? cfg.apiKey.slice(0, 8) + "..." : "(not set)"}`
    );
    console.log(
      `Base URL:    ${cfg.baseUrl ?? "https://api.speakai.co (default)"}`
    );
    if (envKey) {
      console.log(
        `Env override: SPEAK_API_KEY=${envKey.slice(0, 8)}...`
      );
    }
  });
  config.command("set-url").description("Set custom API base URL").argument("<url>", "Base URL (e.g. https://api.speakai.co)").action((url) => {
    const cfg = loadConfig();
    cfg.baseUrl = url;
    saveConfig(cfg);
    printSuccess(`Base URL set to ${url}`);
  });
  program.command("list-media").alias("ls").description("List media files").option("-t, --type <type>", "Filter by type (audio, video, text)").option("-p, --page <n>", "Page number (0-based)", "0").option("-s, --page-size <n>", "Results per page", "20").option("--sort <field>", "Sort field", "createdAt:desc").option("-f, --folder <id>", "Filter by folder ID").option("-n, --name <filter>", "Filter by name").option("--favorites", "Show only favorites").option("--json", "Output raw JSON").action(async (opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const params = {
        page: parseInt(opts.page),
        pageSize: parseInt(opts.pageSize),
        sortBy: opts.sort,
        filterMedia: 2
        // 0=Uploaded, 1=Assigned, 2=Both
      };
      if (opts.type) params.mediaType = opts.type;
      if (opts.folder) params.folderId = opts.folder;
      if (opts.name) params.filterName = opts.name;
      if (opts.favorites) params.isFavorites = true;
      const res = await client.get("/v1/media", { params });
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
        return;
      }
      console.log(`Total: ${data.totalCount} | Page ${opts.page} of ${data.pages}
`);
      printTable(data.mediaList ?? [], [
        { key: "_id", label: "ID", width: 14 },
        { key: "name", label: "Name", width: 40 },
        { key: "mediaType", label: "Type", width: 6 },
        { key: "state", label: "Status", width: 12 },
        { key: "createdAt", label: "Created", width: 20 }
      ]);
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("get-transcript").alias("transcript").description("Get transcript for a media file").argument("<mediaId>", "Media file ID").option("--json", "Output raw JSON").option("--plain", "Output plain text only (no timestamps)").action(async (mediaId, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.get(`/v1/media/transcript/${mediaId}`);
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
        return;
      }
      if (opts.plain) {
        const segments2 = data?.transcript ?? data ?? [];
        for (const seg of segments2) {
          console.log(seg.text ?? "");
        }
        return;
      }
      const segments = data?.transcript ?? data ?? [];
      let lastSpeaker = "";
      for (const seg of segments) {
        const speaker = seg.speakerId ?? "?";
        const start = seg.instances?.[0]?.start ?? "";
        const text = seg.text ?? "";
        if (speaker !== lastSpeaker) {
          console.log(`
[Speaker ${speaker}] ${start}`);
          lastSpeaker = speaker;
        }
        process.stdout.write(text + " ");
      }
      console.log();
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("get-insights").alias("insights").description("Get AI-generated insights for a media file").argument("<mediaId>", "Media file ID").option("--json", "Output raw JSON").action(async (mediaId, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.get(`/v1/media/insight/${mediaId}`);
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
        return;
      }
      if (data?.summary) {
        console.log("\u2500\u2500 Summary \u2500\u2500");
        console.log(data.summary + "\n");
      }
      const categories = [
        "keywords",
        "topics",
        "people",
        "locations",
        "brands",
        "sentiment"
      ];
      for (const cat of categories) {
        const items = data?.[cat];
        if (items && Array.isArray(items) && items.length > 0) {
          console.log(`\u2500\u2500 ${cat.charAt(0).toUpperCase() + cat.slice(1)} \u2500\u2500`);
          for (const item of items.slice(0, 20)) {
            const name = typeof item === "string" ? item : item.name ?? item.text ?? JSON.stringify(item);
            console.log(`  ${name}`);
          }
          if (items.length > 20) console.log(`  ... and ${items.length - 20} more`);
          console.log();
        }
      }
      if (data?.sentiment && !Array.isArray(data.sentiment)) {
        console.log("\u2500\u2500 Sentiment \u2500\u2500");
        printJson(data.sentiment);
        console.log();
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("upload").description("Upload media from a URL").argument("<url>", "Publicly accessible media URL").option("-n, --name <name>", "Display name").option("-t, --type <type>", "Media type (audio or video)", "audio").option("-l, --language <lang>", "Source language (BCP-47)", "en-US").option("-f, --folder <id>", "Destination folder ID").option("--tags <tags>", "Comma-separated tags").option("--wait", "Wait for processing to complete").option("--json", "Output raw JSON").action(async (url, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const body = {
        name: opts.name ?? url.split("/").pop()?.split("?")[0] ?? "Upload",
        url,
        mediaType: opts.type,
        sourceLanguage: opts.language
      };
      if (opts.folder) body.folderId = opts.folder;
      if (opts.tags) body.tags = opts.tags;
      const res = await client.post("/v1/media/upload", body);
      const data = res.data?.data;
      if (opts.json && !opts.wait) {
        printJson(data);
        return;
      }
      const mediaId = data?.mediaId;
      printSuccess(`Uploaded: ${mediaId} (state: ${data?.state})`);
      if (opts.wait && mediaId) {
        process.stdout.write("Processing");
        let status = data?.state;
        while (status !== "processed" && status !== "failed") {
          await new Promise((r) => setTimeout(r, 5e3));
          process.stdout.write(".");
          const statusRes = await client.get(`/v1/media/status/${mediaId}`);
          status = statusRes.data?.data?.state;
        }
        console.log();
        if (status === "processed") {
          printSuccess(`Done! Media ${mediaId} is ready.`);
        } else {
          printError(`Processing failed for ${mediaId}`);
          process.exit(1);
        }
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("export").description("Export media transcript/insights").argument("<mediaId>", "Media file ID").option(
    "-f, --format <type>",
    "Export format (pdf, docx, srt, vtt, txt, csv, md)",
    "txt"
  ).option("--speakers", "Include speaker names").option("--timestamps", "Include timestamps").option("--redacted", "Apply PII redaction").option("--json", "Output raw JSON").action(async (mediaId, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const params = {};
      if (opts.speakers) params.isSpeakerNames = true;
      if (opts.timestamps) params.isTimeStamps = true;
      if (opts.redacted) params.isRedacted = true;
      const res = await client.post(
        `/v1/media/export/${mediaId}/${opts.format}`,
        null,
        { params }
      );
      if (opts.json) {
        printJson(res.data);
      } else {
        printJson(res.data?.data ?? res.data);
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("status").description("Check processing status of a media file").argument("<mediaId>", "Media file ID").option("--json", "Output raw JSON").action(async (mediaId, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.get(`/v1/media/status/${mediaId}`);
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
        return;
      }
      console.log(`Name:     ${data?.name ?? "\u2014"}`);
      console.log(`Status:   ${data?.state ?? "\u2014"}`);
      console.log(`Type:     ${data?.mediaType ?? "\u2014"}`);
      const dur = data?.duration;
      const durStr = dur?.inSecond ? `${Math.round(dur.inSecond)}s` : typeof dur === "number" ? `${Math.round(dur)}s` : "\u2014";
      console.log(`Duration: ${durStr}`);
      console.log(`Created:  ${data?.createdAt ?? "\u2014"}`);
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("create-text").description("Create a text note for AI analysis").argument("<name>", "Note title").option("-t, --text <text>", "Text content (or pipe via stdin)").option("-f, --folder <id>", "Folder ID").option("--tags <tags>", "Comma-separated tags").option("--json", "Output raw JSON").action(async (name, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      let text = opts.text;
      if (!text && !process.stdin.isTTY) {
        const chunks = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        text = Buffer.concat(chunks).toString("utf-8").trim();
      }
      if (!text) {
        printError("Provide text via --text or pipe via stdin");
        process.exit(1);
      }
      const body = { name, text, rawText: text };
      if (opts.folder) body.folderId = opts.folder;
      if (opts.tags) body.tags = opts.tags;
      const res = await client.post("/v1/text/create", body);
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
      } else {
        printSuccess(`Created text note: ${data?.mediaId ?? data?._id}`);
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("list-folders").alias("folders").description("List all folders").option("--json", "Output raw JSON").action(async (opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.get("/v1/folder", {
        params: { page: 0, pageSize: 100, sortBy: "createdAt:desc" }
      });
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
        return;
      }
      const folders = Array.isArray(data) ? data : data?.folderList ?? data?.folders ?? [];
      printTable(folders, [
        { key: "_id", label: "ID", width: 14 },
        { key: "name", label: "Name", width: 40 },
        { key: "createdAt", label: "Created", width: 20 }
      ]);
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("ask").description("Ask an AI question about a media file").argument("<mediaId>", "Media file ID").argument("<prompt>", "Your question").option("--assistant <type>", "Assistant type (general, researcher, marketer, sales, recruiter)", "general").option("--json", "Output raw JSON").action(async (mediaId, prompt, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.post("/v1/prompt", {
        mediaIds: [mediaId],
        prompt,
        assistantType: opts.assistant
      });
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
      } else {
        console.log(data?.answer ?? data?.message ?? JSON.stringify(data, null, 2));
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("schedule-meeting").description("Schedule AI assistant to join a meeting").argument("<url>", "Meeting URL (Zoom, Meet, Teams)").option("-t, --title <title>", "Meeting title").option("-d, --date <datetime>", "Meeting date/time (ISO 8601, omit to join now)").option("-l, --language <lang>", "Meeting language", "en-US").option("--json", "Output raw JSON").action(async (url, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const body = {
        meetingURL: url,
        title: opts.title ?? "Meeting",
        meetingLanguage: opts.language
      };
      if (opts.date) body.meetingDate = opts.date;
      const res = await client.post(
        "/v1/meeting-assistant/events/schedule",
        body
      );
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
      } else {
        printSuccess(`Meeting scheduled: ${data?._id ?? "OK"}`);
        if (!opts.date) console.log("Assistant will join immediately.");
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  return program;
}
var import_commander, import_readline;
var init_cli = __esm({
  "src/cli/index.ts"() {
    "use strict";
    import_commander = require("commander");
    import_readline = require("readline");
    init_config();
    init_format();
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createSpeakClient: () => createSpeakClient,
  formatAxiosError: () => formatAxiosError,
  registerAllTools: () => registerAllTools
});
module.exports = __toCommonJS(index_exports);
init_tools();
init_client();
var args = process.argv.slice(2);
var cliCommands = [
  "config",
  "list-media",
  "ls",
  "get-transcript",
  "transcript",
  "get-insights",
  "insights",
  "upload",
  "export",
  "status",
  "create-text",
  "list-folders",
  "folders",
  "ask",
  "schedule-meeting",
  "help"
];
var isCliMode = args.length > 0 && (args[0].startsWith("-") || cliCommands.includes(args[0]));
if (isCliMode) {
  Promise.resolve().then(() => (init_config(), config_exports)).then(({ resolveApiKey: resolveApiKey2, resolveBaseUrl: resolveBaseUrl2 }) => {
    resolveApiKey2();
    resolveBaseUrl2();
    Promise.resolve().then(() => (init_cli(), cli_exports)).then(({ createCli: createCli2 }) => {
      const program = createCli2();
      program.parseAsync(process.argv).catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      });
    });
  });
} else {
  import("@modelcontextprotocol/sdk/server/mcp.js").then(({ McpServer }) => {
    import("@modelcontextprotocol/sdk/server/stdio.js").then(
      ({ StdioServerTransport }) => {
        Promise.resolve().then(() => (init_tools(), tools_exports)).then(({ registerAllTools: registerAllTools2 }) => {
          const server = new McpServer({
            name: "speak-ai",
            version: "1.0.0"
          });
          registerAllTools2(server);
          const transport = new StdioServerTransport();
          server.connect(transport).then(() => {
            process.stderr.write(
              "[speakai-mcp] Server started on stdio transport\n"
            );
          });
        });
      }
    );
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createSpeakClient,
  formatAxiosError,
  registerAllTools
});
