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
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[speakai-mcp] Authentication failed: ${message}
`);
    throw new Error(`Authentication failed: ${message}`);
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
function redactValue(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") {
    return value.length > MAX_STRING_LEN ? value.slice(0, MAX_STRING_LEN) + "\u2026" : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? "[redacted]" : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}
function formatAxiosError(error) {
  if (import_axios.default.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;
    const safe = redactValue(data);
    const message = typeof safe === "object" && safe !== null ? JSON.stringify(safe, null, 2) : String(safe ?? error.message);
    return status ? `HTTP ${status}: ${message}` : `Request failed: ${message}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
var import_axios, accessToken, refreshToken, tokenExpiresAt, speakClient, SENSITIVE_KEY_PATTERN, MAX_STRING_LEN;
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
        if (!originalRequest) {
          return Promise.reject(error);
        }
        const retryCount = originalRequest._retryCount ?? 0;
        if (error.response?.status === 401 && retryCount < 2) {
          originalRequest._retryCount = retryCount + 1;
          tokenExpiresAt = 0;
          await ensureAuthenticated();
          originalRequest.headers["x-speakai-key"] = getApiKey();
          originalRequest.headers["x-access-token"] = accessToken;
          return speakClient(originalRequest);
        }
        if (error.response?.status === 429 && retryCount < 3) {
          const retryAfter = error.response.headers["retry-after"];
          const delaySeconds = retryAfter ? parseInt(retryAfter, 10) : Math.pow(2, retryCount + 1);
          const delayMs = (Number.isFinite(delaySeconds) ? delaySeconds : 2) * 1e3;
          process.stderr.write(`[speakai-mcp] Rate limited, retrying in ${delayMs / 1e3}s...
`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          originalRequest._retryCount = retryCount + 1;
          return speakClient(originalRequest);
        }
        return Promise.reject(error);
      }
    );
    SENSITIVE_KEY_PATTERN = /(token|secret|password|cookie|authorization|jwt|apikey|api[_-]?key|bearer|signature)/i;
    MAX_STRING_LEN = 500;
  }
});

// src/tools/_helpers.ts
function registerSpeakTool(server, name, description, inputSchema, annotations, handler) {
  const { title, ...toolAnnotations } = annotations;
  return server.registerTool(
    name,
    {
      title,
      description,
      inputSchema,
      outputSchema: passthroughOutputSchema,
      annotations: toolAnnotations
    },
    (async (...args2) => {
      const result = await handler(...args2);
      if (result.isError || result.structuredContent) {
        return result;
      }
      const textContent = result.content?.find(
        (item) => item.type === "text" && typeof item.text === "string"
      );
      if (!textContent) {
        return { ...result, structuredContent: { data: null } };
      }
      try {
        return { ...result, structuredContent: { data: JSON.parse(textContent.text) } };
      } catch {
        return { ...result, structuredContent: { data: textContent.text } };
      }
    })
  );
}
var import_zod, passthroughOutputSchema;
var init_helpers = __esm({
  "src/tools/_helpers.ts"() {
    "use strict";
    import_zod = require("zod");
    init_client();
    passthroughOutputSchema = {
      data: import_zod.z.unknown().describe("Response payload from the Speak AI API")
    };
  }
});

// node_modules/@speakai/shared/dist/enums/activities.js
var ActivityType;
var init_activities = __esm({
  "node_modules/@speakai/shared/dist/enums/activities.js"() {
    "use strict";
    (function(ActivityType2) {
      ActivityType2["MEDIA_ANALYSIS"] = "mediaAnalysis";
      ActivityType2["MEDIA_TRANSCRIPTION"] = "mediaTranscription";
      ActivityType2["TEXT_NOTE_ANALYZED"] = "textNoteAnalyzed";
      ActivityType2["RECORDING_RECEIVED"] = "recordingReceived";
      ActivityType2["RECORDER_CREATED"] = "recorderCreated";
      ActivityType2["MEETING_ASSISTANT"] = "meetingAssistant";
    })(ActivityType || (ActivityType = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/auth.js
var SSOType, DevicePlatform;
var init_auth = __esm({
  "node_modules/@speakai/shared/dist/enums/auth.js"() {
    "use strict";
    (function(SSOType2) {
      SSOType2["GOOGLE"] = "google";
      SSOType2["MICROSOFT"] = "microsoft";
      SSOType2["APPLE"] = "apple";
      SSOType2["FACEBOOK"] = "facebook";
    })(SSOType || (SSOType = {}));
    (function(DevicePlatform2) {
      DevicePlatform2["IOS"] = "ios";
      DevicePlatform2["ANDROID"] = "android";
      DevicePlatform2["WEB"] = "web";
      DevicePlatform2["ELECTRON"] = "electron";
      DevicePlatform2["API"] = "api";
    })(DevicePlatform || (DevicePlatform = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/automation.js
var AutomationTrigger, AutomationAction, AutomationRunType, AutomationScheduleTimePeriod, AssistantType;
var init_automation = __esm({
  "node_modules/@speakai/shared/dist/enums/automation.js"() {
    "use strict";
    (function(AutomationTrigger2) {
      AutomationTrigger2["FOLDERS"] = "folders";
      AutomationTrigger2["TAGS"] = "tags";
      AutomationTrigger2["KEYWORDS"] = "keywords";
    })(AutomationTrigger || (AutomationTrigger = {}));
    (function(AutomationAction2) {
      AutomationAction2["MAGIC_PROMPT"] = "magic-prompt";
      AutomationAction2["TRANSLATION"] = "translation";
    })(AutomationAction || (AutomationAction = {}));
    (function(AutomationRunType2) {
      AutomationRunType2["INSTANT"] = "instant";
      AutomationRunType2["SCHEDULE"] = "schedule";
    })(AutomationRunType || (AutomationRunType = {}));
    (function(AutomationScheduleTimePeriod2) {
      AutomationScheduleTimePeriod2["TODAY"] = "today";
      AutomationScheduleTimePeriod2["YESTERDAY"] = "yesterday";
      AutomationScheduleTimePeriod2["LAST_7_DAYS"] = "last7days";
      AutomationScheduleTimePeriod2["LAST_14_DAYS"] = "last14days";
      AutomationScheduleTimePeriod2["THIS_WEEK"] = "thisWeek";
    })(AutomationScheduleTimePeriod || (AutomationScheduleTimePeriod = {}));
    (function(AssistantType2) {
      AssistantType2["RESEARCHER"] = "researcher";
      AssistantType2["MARKETER"] = "marketer";
      AssistantType2["SALES"] = "sales";
      AssistantType2["GENERAL"] = "general";
      AssistantType2["RECRUITER"] = "recruiter";
      AssistantType2["CUSTOM"] = "custom";
    })(AssistantType || (AssistantType = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/calendar.js
var CalendarType, EventStatus, AutoJoinStatus;
var init_calendar = __esm({
  "node_modules/@speakai/shared/dist/enums/calendar.js"() {
    "use strict";
    (function(CalendarType2) {
      CalendarType2["GOOGLE"] = "google";
      CalendarType2["OUTLOOK"] = "outlook";
    })(CalendarType || (CalendarType = {}));
    (function(EventStatus2) {
      EventStatus2["CONFIRMED"] = "confirmed";
      EventStatus2["CANCELLED"] = "cancelled";
    })(EventStatus || (EventStatus = {}));
    (function(AutoJoinStatus2) {
      AutoJoinStatus2["NONE"] = "none";
      AutoJoinStatus2["INVITE_ASSISTANT"] = "inviteAssistant";
      AutoJoinStatus2["ALL_MEETINGS"] = "allMeetings";
      AutoJoinStatus2["HOST"] = "host";
      AutoJoinStatus2["SPEAK_TEAM_MEMBERS_NOT_HOST"] = "speakTeamMembersNotHost";
    })(AutoJoinStatus || (AutoJoinStatus = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/clip.js
var ClipState, ClipGenerationSource;
var init_clip = __esm({
  "node_modules/@speakai/shared/dist/enums/clip.js"() {
    "use strict";
    (function(ClipState2) {
      ClipState2["QUEUED"] = "queued";
      ClipState2["PROCESSING"] = "processing";
      ClipState2["COMPLETED"] = "completed";
      ClipState2["FAILED"] = "failed";
    })(ClipState || (ClipState = {}));
    (function(ClipGenerationSource2) {
      ClipGenerationSource2["MANUAL"] = "manual";
      ClipGenerationSource2["CHAT"] = "chat";
      ClipGenerationSource2["AI"] = "ai";
    })(ClipGenerationSource || (ClipGenerationSource = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/domain.js
var ServiceType, VerificationStatus;
var init_domain = __esm({
  "node_modules/@speakai/shared/dist/enums/domain.js"() {
    "use strict";
    (function(ServiceType2) {
      ServiceType2["RECORDER"] = "recorder";
      ServiceType2["PLAYER"] = "player";
      ServiceType2["LIBRARY"] = "library";
    })(ServiceType || (ServiceType = {}));
    (function(VerificationStatus2) {
      VerificationStatus2["PENDING"] = "pending";
      VerificationStatus2["VERIFIED"] = "verified";
      VerificationStatus2["FAILED"] = "failed";
      VerificationStatus2["ACTIVE"] = "active";
    })(VerificationStatus || (VerificationStatus = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/embed.js
var EmbedType, ImageSelectionType;
var init_embed = __esm({
  "node_modules/@speakai/shared/dist/enums/embed.js"() {
    "use strict";
    (function(EmbedType2) {
      EmbedType2["MEDIA_PLAYER"] = "mediaPlayer";
      EmbedType2["REPOSITORY"] = "repository";
    })(EmbedType || (EmbedType = {}));
    (function(ImageSelectionType2) {
      ImageSelectionType2["LOGO"] = "logo";
      ImageSelectionType2["BACKGROUND_IMG"] = "backgroundImg";
      ImageSelectionType2["MEETING_ASSISTANT"] = "meetingAssistant";
    })(ImageSelectionType || (ImageSelectionType = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/export.js
var ExportFormatType;
var init_export = __esm({
  "node_modules/@speakai/shared/dist/enums/export.js"() {
    "use strict";
    (function(ExportFormatType2) {
      ExportFormatType2["CSV"] = "csv";
      ExportFormatType2["CSV_INSIGHTS"] = "csv-insights";
      ExportFormatType2["CSV_TRANSCRIPT"] = "csv-transcript";
      ExportFormatType2["CSV_TRANSCRIPT_WITH_SENTIMENT"] = "csv-transcript-sentiment";
      ExportFormatType2["CSV_TEXT_WITH_SENTIMENT"] = "csv-text-sentiment";
      ExportFormatType2["DOCX"] = "docx";
      ExportFormatType2["HTML"] = "html";
      ExportFormatType2["JSON"] = "json";
      ExportFormatType2["MD"] = "md";
      ExportFormatType2["PDF"] = "pdf";
      ExportFormatType2["SOURCEFILE"] = "sourceFile";
      ExportFormatType2["SRT"] = "srt";
      ExportFormatType2["TTML"] = "ttml";
      ExportFormatType2["TXT"] = "txt";
      ExportFormatType2["VTT"] = "vtt";
      ExportFormatType2["MP4"] = "mp4";
    })(ExportFormatType || (ExportFormatType = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/fields.js
var FieldType, AllowedValuesMode, DefaultViewColumn;
var init_fields = __esm({
  "node_modules/@speakai/shared/dist/enums/fields.js"() {
    "use strict";
    (function(FieldType2) {
      FieldType2["TEXT"] = "text";
      FieldType2["URL"] = "url";
      FieldType2["BOOLEAN"] = "boolean";
      FieldType2["DATE"] = "date";
      FieldType2["DATETIME"] = "datetime";
      FieldType2["NUMBER"] = "number";
      FieldType2["CURRENCY"] = "currency";
    })(FieldType || (FieldType = {}));
    (function(AllowedValuesMode2) {
      AllowedValuesMode2["SINGLE"] = "single";
      AllowedValuesMode2["MULTIPLE"] = "multiple";
    })(AllowedValuesMode || (AllowedValuesMode = {}));
    (function(DefaultViewColumn2) {
      DefaultViewColumn2["NAME"] = "name";
      DefaultViewColumn2["DURATION"] = "duration";
      DefaultViewColumn2["TAGS"] = "tags";
      DefaultViewColumn2["SENTIMENT"] = "sentiment";
      DefaultViewColumn2["DATETIME"] = "datetime";
      DefaultViewColumn2["SIZE"] = "size";
      DefaultViewColumn2["MEDIA_TYPE"] = "mediaType";
      DefaultViewColumn2["CREATED_AT"] = "createdAt";
      DefaultViewColumn2["UPDATED_AT"] = "updatedAt";
    })(DefaultViewColumn || (DefaultViewColumn = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/filter.js
var FilterFieldName, FilterOperator, FilterCondition;
var init_filter = __esm({
  "node_modules/@speakai/shared/dist/enums/filter.js"() {
    "use strict";
    (function(FilterFieldName2) {
      FilterFieldName2["CATEGORY"] = "category";
      FilterFieldName2["FOLDER_ID"] = "folderId";
      FilterFieldName2["MEDIA_ID"] = "mediaId";
      FilterFieldName2["MEDIA_TYPE"] = "mediaType";
      FilterFieldName2["SENTIMENT_NEGATIVE"] = "sentimentNegative";
      FilterFieldName2["SENTIMENT_POSITIVE"] = "sentimentPositive";
      FilterFieldName2["SPEAKER"] = "speaker";
      FilterFieldName2["TAGS"] = "tags";
      FilterFieldName2["RECORDER_ID"] = "recorderId";
      FilterFieldName2["FIELDS"] = "fields";
    })(FilterFieldName || (FilterFieldName = {}));
    (function(FilterOperator2) {
      FilterOperator2["INCLUDE"] = "include";
      FilterOperator2["NOT_INCLUDE"] = "notInclude";
      FilterOperator2["CONTAIN"] = "contain";
      FilterOperator2["NOT_CONTAIN"] = "notContain";
      FilterOperator2["GREATER_THAN"] = "greaterThan";
      FilterOperator2["LESS_THAN"] = "lessThan";
    })(FilterOperator || (FilterOperator = {}));
    (function(FilterCondition2) {
      FilterCondition2["AND"] = "and";
      FilterCondition2["OR"] = "or";
    })(FilterCondition || (FilterCondition = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/media.js
var MediaType, MediaState, MediaPrivacyMode, MediaInsightType, MediaInsightStatus, MediaProcessType;
var init_media = __esm({
  "node_modules/@speakai/shared/dist/enums/media.js"() {
    "use strict";
    (function(MediaType2) {
      MediaType2["AUDIO"] = "audio";
      MediaType2["VIDEO"] = "video";
      MediaType2["TEXT"] = "text";
      MediaType2["MEDIA"] = "media";
      MediaType2["CSV"] = "csv";
    })(MediaType || (MediaType = {}));
    (function(MediaState3) {
      MediaState3["NOT_UPLOADED"] = "notUploaded";
      MediaState3["UPLOADED"] = "uploaded";
      MediaState3["QUEUED"] = "queued";
      MediaState3["PENDING_PAYMENT"] = "pendingPayment";
      MediaState3["PREPARING"] = "preparing";
      MediaState3["PREPARING_TRANSCRIPTION"] = "preparingTranscription";
      MediaState3["PROCESSING"] = "processing";
      MediaState3["TRANSLATION"] = "translation";
      MediaState3["PREPARING_ANALYSIS"] = "preparingAnalysis";
      MediaState3["PROCESSED"] = "processed";
      MediaState3["DUBBING"] = "dubbing";
      MediaState3["FAILED"] = "failed";
      MediaState3["COMPLETE"] = "complete";
      MediaState3["LIVE_TRANSCRIPT"] = "liveTranscript";
    })(MediaState || (MediaState = {}));
    (function(MediaPrivacyMode2) {
      MediaPrivacyMode2["PUBLIC"] = "public";
      MediaPrivacyMode2["PRIVATE"] = "private";
    })(MediaPrivacyMode || (MediaPrivacyMode = {}));
    (function(MediaInsightType2) {
      MediaInsightType2["Arts"] = "arts";
      MediaInsightType2["Brands"] = "brands";
      MediaInsightType2["Cardinals"] = "cardinals";
      MediaInsightType2["Dates"] = "dates";
      MediaInsightType2["Events"] = "events";
      MediaInsightType2["Geopolitical"] = "geopolitical";
      MediaInsightType2["Keywords"] = "keywords";
      MediaInsightType2["Languages"] = "languages";
      MediaInsightType2["Laws"] = "laws";
      MediaInsightType2["Locations"] = "locations";
      MediaInsightType2["Money"] = "money";
      MediaInsightType2["Nationalities"] = "nationalities";
      MediaInsightType2["Ordinals"] = "ordinals";
      MediaInsightType2["People"] = "people";
      MediaInsightType2["Percentages"] = "percentages";
      MediaInsightType2["Products"] = "products";
      MediaInsightType2["Quantities"] = "quantities";
      MediaInsightType2["Times"] = "times";
      MediaInsightType2["Topics"] = "topics";
      MediaInsightType2["Transcript"] = "transcript";
      MediaInsightType2["Addresses"] = "addresses";
    })(MediaInsightType || (MediaInsightType = {}));
    (function(MediaInsightStatus2) {
      MediaInsightStatus2["PENDING"] = "pending";
      MediaInsightStatus2["PROCESSING"] = "processing";
      MediaInsightStatus2["COMPLETED"] = "completed";
      MediaInsightStatus2["FAILED"] = "failed";
      MediaInsightStatus2["KILLED"] = "killed";
    })(MediaInsightStatus || (MediaInsightStatus = {}));
    (function(MediaProcessType2) {
      MediaProcessType2["TRANSCRIPTION"] = "transcription";
      MediaProcessType2["DUBBING"] = "dubbing";
      MediaProcessType2["TRANSLATION"] = "translation";
    })(MediaProcessType || (MediaProcessType = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/meeting.js
var MeetingPlatform, MeetingStatus, MeetingRecordingMode, ScreenShareRecordingMode, MeetingSummarySettings, MediaPlayerSettings, MeetingFilterEventCondition, MeetingAttendeeType, MeetingAssistantEventSource;
var init_meeting = __esm({
  "node_modules/@speakai/shared/dist/enums/meeting.js"() {
    "use strict";
    (function(MeetingPlatform2) {
      MeetingPlatform2["GOOGLE_MEET"] = "googleMeet";
      MeetingPlatform2["ZOOM"] = "zoom";
      MeetingPlatform2["MICROSOFT_TEAMS"] = "microsoftTeams";
      MeetingPlatform2["WEBEX"] = "webex";
    })(MeetingPlatform || (MeetingPlatform = {}));
    (function(MeetingStatus2) {
      MeetingStatus2["WILL_JOIN"] = "willJoin";
      MeetingStatus2["SCHEDULED"] = "scheduled";
      MeetingStatus2["READY"] = "ready";
      MeetingStatus2["JOINING_CALL"] = "joiningCall";
      MeetingStatus2["IN_WAITING_ROOM"] = "inWaitingRoom";
      MeetingStatus2["IN_CALL_NOT_RECORDING"] = "inCallNotRecording";
      MeetingStatus2["RECORDING_PERMISSION_DENIED"] = "recordingPermissionDenied";
      MeetingStatus2["IN_CALL_RECORDING"] = "inCallRecording";
      MeetingStatus2["CALL_ENDED"] = "callEnded";
      MeetingStatus2["DONE"] = "done";
      MeetingStatus2["FATAL"] = "fatal";
      MeetingStatus2["ANALYSIS_DONE"] = "analysisDone";
      MeetingStatus2["PAUSED"] = "paused";
      MeetingStatus2["RESUMED"] = "resumed";
      MeetingStatus2["CANCELLED"] = "cancelled";
      MeetingStatus2["NOT_INVITED"] = "notInvited";
    })(MeetingStatus || (MeetingStatus = {}));
    (function(MeetingRecordingMode2) {
      MeetingRecordingMode2["SPEAKER_VIEW"] = "speakerView";
      MeetingRecordingMode2["GALLERY_VIEW"] = "galleryView";
      MeetingRecordingMode2["GALLERY_VIEW_V2"] = "galleryViewV2";
      MeetingRecordingMode2["AUDIO_ONLY"] = "audioOnly";
    })(MeetingRecordingMode || (MeetingRecordingMode = {}));
    (function(ScreenShareRecordingMode2) {
      ScreenShareRecordingMode2["HIDE"] = "hide";
      ScreenShareRecordingMode2["BESIDE"] = "beside";
      ScreenShareRecordingMode2["OVERLAP"] = "overlap";
    })(ScreenShareRecordingMode || (ScreenShareRecordingMode = {}));
    (function(MeetingSummarySettings2) {
      MeetingSummarySettings2["SELF"] = "self";
      MeetingSummarySettings2["ALL_ATTENDEES"] = "allAttendees";
      MeetingSummarySettings2["NONE"] = "none";
    })(MeetingSummarySettings || (MeetingSummarySettings = {}));
    (function(MediaPlayerSettings2) {
      MediaPlayerSettings2["ALL_ATTENDEES"] = "allAttendees";
      MediaPlayerSettings2["TEAM_MEMBERS"] = "teamMembers";
      MediaPlayerSettings2["FOLDER_TEAM_MEMBERS"] = "folderTeamMembers";
      MediaPlayerSettings2["SELF"] = "self";
      MediaPlayerSettings2["NONE"] = "none";
    })(MediaPlayerSettings || (MediaPlayerSettings = {}));
    (function(MeetingFilterEventCondition2) {
      MeetingFilterEventCondition2["CONTAINS"] = "contains";
      MeetingFilterEventCondition2["EQUALS"] = "equals";
    })(MeetingFilterEventCondition || (MeetingFilterEventCondition = {}));
    (function(MeetingAttendeeType2) {
      MeetingAttendeeType2["HOST"] = "host";
      MeetingAttendeeType2["ASSISTANT"] = "assistant";
      MeetingAttendeeType2["SELF"] = "self";
      MeetingAttendeeType2["GUEST"] = "guest";
    })(MeetingAttendeeType || (MeetingAttendeeType = {}));
    (function(MeetingAssistantEventSource2) {
      MeetingAssistantEventSource2["INSTANT"] = "instant";
      MeetingAssistantEventSource2["ASSISTANT"] = "assistant";
    })(MeetingAssistantEventSource || (MeetingAssistantEventSource = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/notification.js
var NotificationType, NotificationAction;
var init_notification = __esm({
  "node_modules/@speakai/shared/dist/enums/notification.js"() {
    "use strict";
    (function(NotificationType2) {
      NotificationType2["CLIP"] = "clip";
      NotificationType2["AUDIO"] = "audio";
      NotificationType2["ACCOUNT"] = "account";
      NotificationType2["AUTOMATION"] = "automation";
      NotificationType2["EMBED"] = "embed";
      NotificationType2["INTEGRATION"] = "integration";
      NotificationType2["MAGIC_PROMPT"] = "magic prompt";
      NotificationType2["MEDIA"] = "media";
      NotificationType2["PAYMENT"] = "payment";
      NotificationType2["PRESENTATION"] = "presentation";
      NotificationType2["RECORDER"] = "recorder";
      NotificationType2["SURVEY"] = "survey";
      NotificationType2["SUBSCRIPTION"] = "subscription";
      NotificationType2["TEAM"] = "team";
      NotificationType2["TEXT"] = "text";
      NotificationType2["TRANSCRIPTION"] = "transcription";
      NotificationType2["TRANSLATE"] = "translate";
      NotificationType2["VIDEO"] = "video";
      NotificationType2["ZAPIER"] = "zapier";
      NotificationType2["MEETING_ASSISTANT"] = "meeting assistant";
      NotificationType2["GOOGLE_CALENDAR"] = "google calendar";
      NotificationType2["OUTLOOK_CALENDAR"] = "outlook calendar";
      NotificationType2["AUTO_RELOAD"] = "auto reload";
      NotificationType2["FOLDER"] = "folder";
      NotificationType2["FIELDS"] = "fields";
      NotificationType2["ASSISTANT_TEMPLATE"] = "assistant template";
    })(NotificationType || (NotificationType = {}));
    (function(NotificationAction2) {
      NotificationAction2["ANALYZED"] = "analyzed";
      NotificationAction2["CREATED"] = "created";
      NotificationAction2["CREDIT"] = "credit";
      NotificationAction2["DEBIT"] = "debit";
      NotificationAction2["DELETED"] = "deleted";
      NotificationAction2["EXPORT"] = "export";
      NotificationAction2["PAID"] = "paid";
      NotificationAction2["UPDATED"] = "updated";
      NotificationAction2["UPLOADED"] = "uploaded";
      NotificationAction2["ERROR"] = "error";
      NotificationAction2["FAILED"] = "failed";
      NotificationAction2["CLONED"] = "cloned";
    })(NotificationAction || (NotificationAction = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/prompt.js
var PromptState, MessageRole, PromptSource, ToolName, FileType;
var init_prompt = __esm({
  "node_modules/@speakai/shared/dist/enums/prompt.js"() {
    "use strict";
    (function(PromptState2) {
      PromptState2["INITIATED"] = "initiated";
      PromptState2["PREPARING"] = "preparing";
      PromptState2["PROCESSING"] = "processing";
      PromptState2["FAILED"] = "failed";
      PromptState2["PENDING_PAYMENT"] = "pendingPayment";
      PromptState2["COMPLETED"] = "completed";
      PromptState2["CANCELLED"] = "cancelled";
      PromptState2["EXPIRED"] = "expired";
      PromptState2["IN_PROGRESS"] = "inProgress";
      PromptState2["STREAMING"] = "streaming";
    })(PromptState || (PromptState = {}));
    (function(MessageRole2) {
      MessageRole2["SYSTEM"] = "system";
      MessageRole2["USER"] = "user";
      MessageRole2["ASSISTANT"] = "assistant";
    })(MessageRole || (MessageRole = {}));
    (function(PromptSource2) {
      PromptSource2["FOLDER"] = "folder";
      PromptSource2["MEDIA_FILES"] = "mediaFiles";
      PromptSource2["CSV_FILE"] = "csvFile";
      PromptSource2["KNOWLEDGE_BASE"] = "knowledgeBase";
      PromptSource2["EXPLORE_ANALYTICS"] = "exploreAnalytics";
    })(PromptSource || (PromptSource = {}));
    (function(ToolName2) {
      ToolName2["OPEN_SUPPORT"] = "open_support";
      ToolName2["CREATE_CLIP"] = "create_clip";
      ToolName2["UPDATE_SPEAKERS"] = "update_speakers";
      ToolName2["UPDATE_TRANSCRIPTION"] = "update_transcription";
      ToolName2["SEARCH_MEDIA"] = "search_media";
      ToolName2["GENERATE_CHART"] = "generate_chart";
      ToolName2["EXPORT_TRANSCRIPTION"] = "export_transcription";
      ToolName2["COMPARE_MEDIA"] = "compare_media";
    })(ToolName || (ToolName = {}));
    (function(FileType2) {
      FileType2["IMAGE"] = "image";
      FileType2["CSV"] = "csv";
      FileType2["PDF"] = "pdf";
      FileType2["DOCX"] = "docx";
      FileType2["TXT"] = "txt";
      FileType2["ZIP"] = "zip";
    })(FileType || (FileType = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/recorder.js
var RecorderAnswerType, RecorderUploadType, RecordingFeedbackRating;
var init_recorder = __esm({
  "node_modules/@speakai/shared/dist/enums/recorder.js"() {
    "use strict";
    (function(RecorderAnswerType2) {
      RecorderAnswerType2["Single"] = "single";
      RecorderAnswerType2["Multiple"] = "multiple";
      RecorderAnswerType2["Checkbox"] = "checkbox";
      RecorderAnswerType2["Radiobutton"] = "radiobutton";
      RecorderAnswerType2["Dropdownlist"] = "dropdownlist";
      RecorderAnswerType2["Date"] = "date";
      RecorderAnswerType2["Time"] = "time";
      RecorderAnswerType2["Datetime"] = "datetime";
    })(RecorderAnswerType || (RecorderAnswerType = {}));
    (function(RecorderUploadType2) {
      RecorderUploadType2["RECORD"] = "record";
      RecorderUploadType2["FILE"] = "file";
      RecorderUploadType2["YOUTUBE"] = "youtube";
      RecorderUploadType2["LIVE_RECORD"] = "live-record";
    })(RecorderUploadType || (RecorderUploadType = {}));
    (function(RecordingFeedbackRating2) {
      RecordingFeedbackRating2["POSITIVE"] = "positive";
      RecordingFeedbackRating2["NEGATIVE"] = "negative";
    })(RecordingFeedbackRating || (RecordingFeedbackRating = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/subscription.js
var SubscriptionStatus, SubscriptionDuration, TrialTier;
var init_subscription = __esm({
  "node_modules/@speakai/shared/dist/enums/subscription.js"() {
    "use strict";
    (function(SubscriptionStatus2) {
      SubscriptionStatus2["Active"] = "active";
      SubscriptionStatus2["Paused"] = "paused";
      SubscriptionStatus2["PendingReview"] = "pendingReview";
      SubscriptionStatus2["PendingCancellation"] = "pendingCancellation";
      SubscriptionStatus2["Cancelled"] = "cancelled";
      SubscriptionStatus2["PendingPayment"] = "pendingPayment";
    })(SubscriptionStatus || (SubscriptionStatus = {}));
    (function(SubscriptionDuration2) {
      SubscriptionDuration2["Monthly"] = "monthly";
      SubscriptionDuration2["2Months"] = "2months";
      SubscriptionDuration2["3Months"] = "3months";
      SubscriptionDuration2["6Months"] = "6months";
      SubscriptionDuration2["9Months"] = "9months";
      SubscriptionDuration2["Yearly"] = "yearly";
    })(SubscriptionDuration || (SubscriptionDuration = {}));
    (function(TrialTier2) {
      TrialTier2["T0"] = "T0";
      TrialTier2["T1"] = "T1";
      TrialTier2["T2"] = "T2";
    })(TrialTier || (TrialTier = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/team.js
var TeamInviteStatus;
var init_team = __esm({
  "node_modules/@speakai/shared/dist/enums/team.js"() {
    "use strict";
    (function(TeamInviteStatus2) {
      TeamInviteStatus2["ACTIVE"] = "active";
      TeamInviteStatus2["EXPIRED"] = "expired";
      TeamInviteStatus2["REVOKED"] = "revoked";
      TeamInviteStatus2["EXHAUSTED"] = "exhausted";
    })(TeamInviteStatus || (TeamInviteStatus = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/transcription.js
var TranscriptionEngine, TranscriptionJobState, TranscriptionJobRevisionState;
var init_transcription = __esm({
  "node_modules/@speakai/shared/dist/enums/transcription.js"() {
    "use strict";
    (function(TranscriptionEngine2) {
      TranscriptionEngine2["AZURE"] = "azure";
      TranscriptionEngine2["ASSEMBLY"] = "assembly";
      TranscriptionEngine2["DEEPGRAM"] = "deepgram";
      TranscriptionEngine2["AWS"] = "aws";
    })(TranscriptionEngine || (TranscriptionEngine = {}));
    (function(TranscriptionJobState2) {
      TranscriptionJobState2["Initiate"] = "initiate";
      TranscriptionJobState2["PendingPayment"] = "pendingPayment";
      TranscriptionJobState2["InQueue"] = "inQueue";
      TranscriptionJobState2["PendingEdition"] = "pendingEdition";
      TranscriptionJobState2["PendingQAReview"] = "pendingQAReview";
      TranscriptionJobState2["PendingUserReview"] = "pendingUserReview";
      TranscriptionJobState2["Complete"] = "complete";
      TranscriptionJobState2["Failed"] = "failed";
    })(TranscriptionJobState || (TranscriptionJobState = {}));
    (function(TranscriptionJobRevisionState2) {
      TranscriptionJobRevisionState2["Approved"] = "approved";
      TranscriptionJobRevisionState2["BeingEdited"] = "beingEdited";
      TranscriptionJobRevisionState2["BeingQAReviewed"] = "beingQAReviewed";
      TranscriptionJobRevisionState2["PendingQAReview"] = "pendingQAReview";
      TranscriptionJobRevisionState2["PendingUserReview"] = "pendingUserReview";
      TranscriptionJobRevisionState2["Rejected"] = "rejected";
    })(TranscriptionJobRevisionState || (TranscriptionJobRevisionState = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/transaction.js
var TransactionSource, TransactionType, TransactionStatus;
var init_transaction = __esm({
  "node_modules/@speakai/shared/dist/enums/transaction.js"() {
    "use strict";
    (function(TransactionSource2) {
      TransactionSource2["STRIPE"] = "stripe";
      TransactionSource2["PADDLE"] = "paddle";
      TransactionSource2["REVENUECAT_IOS"] = "ios";
      TransactionSource2["REVENUECAT_ANDROID"] = "android";
      TransactionSource2["REVENUECAT_STRIPE"] = "revenuecat_stripe";
      TransactionSource2["BALANCE"] = "balance";
      TransactionSource2["MANUAL"] = "manual";
    })(TransactionSource || (TransactionSource = {}));
    (function(TransactionType2) {
      TransactionType2["SUBSCRIPTION"] = "subscription";
      TransactionType2["ONE_TIME"] = "one_time";
      TransactionType2["USAGE"] = "usage";
      TransactionType2["REFUND"] = "refund";
      TransactionType2["BALANCE_ADD"] = "balance_add";
      TransactionType2["AUTO_RELOAD"] = "auto_reload";
    })(TransactionType || (TransactionType = {}));
    (function(TransactionStatus2) {
      TransactionStatus2["PENDING"] = "pending";
      TransactionStatus2["PROCESSING"] = "processing";
      TransactionStatus2["SUCCEEDED"] = "succeeded";
      TransactionStatus2["FAILED"] = "failed";
      TransactionStatus2["REFUNDED"] = "refunded";
      TransactionStatus2["CANCELLED"] = "cancelled";
    })(TransactionStatus || (TransactionStatus = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/translation.js
var TranslationState, DubbingState;
var init_translation = __esm({
  "node_modules/@speakai/shared/dist/enums/translation.js"() {
    "use strict";
    (function(TranslationState2) {
      TranslationState2["NOTFOUND"] = "notFound";
      TranslationState2["INITIATE"] = "initiate";
      TranslationState2["PENDING_TRANSCRIPTION"] = "pendingTranscription";
      TranslationState2["PENDING_PAYMENT"] = "pendingPayment";
      TranslationState2["PROCESSING"] = "processing";
      TranslationState2["DUBBING"] = "dubbing";
      TranslationState2["COMPLETE"] = "complete";
      TranslationState2["FAILED"] = "failed";
    })(TranslationState || (TranslationState = {}));
    (function(DubbingState2) {
      DubbingState2["DUBBING"] = "dubbing";
      DubbingState2["UPLOADING"] = "uploading";
      DubbingState2["COMPLETE"] = "complete";
      DubbingState2["FAILED"] = "failed";
    })(DubbingState || (DubbingState = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/user.js
var UserRole, UserType, UserPermissionType, UserActionType;
var init_user = __esm({
  "node_modules/@speakai/shared/dist/enums/user.js"() {
    "use strict";
    (function(UserRole2) {
      UserRole2["ADMIN"] = "admin";
      UserRole2["OWNER"] = "owner";
      UserRole2["MEMBER"] = "member";
    })(UserRole || (UserRole = {}));
    (function(UserType2) {
      UserType2["Individual"] = "I";
      UserType2["Company"] = "C";
    })(UserType || (UserType = {}));
    (function(UserPermissionType2) {
      UserPermissionType2["FOLDER"] = "folder";
      UserPermissionType2["RECORDER"] = "recorder";
      UserPermissionType2["MEDIA"] = "media";
      UserPermissionType2["PAYMENT"] = "payment";
      UserPermissionType2["TEAM_MANAGEMENT"] = "teamManagement";
      UserPermissionType2["DEVELOPER"] = "developer";
      UserPermissionType2["PROFILE_SETTINGS"] = "profileSettings";
      UserPermissionType2["MEETING_ASSISTANT"] = "meetingAssistant";
    })(UserPermissionType || (UserPermissionType = {}));
    (function(UserActionType2) {
      UserActionType2["CREATE"] = "create";
      UserActionType2["DOWNLOAD"] = "download";
      UserActionType2["UPDATE"] = "update";
      UserActionType2["EDIT"] = "edit";
      UserActionType2["DELETE"] = "delete";
      UserActionType2["SHARE"] = "share";
      UserActionType2["ASSIGN"] = "assign";
      UserActionType2["MANAGE_CARDS"] = "manageCards";
      UserActionType2["MANAGE_INVOICES"] = "manageInvoices";
      UserActionType2["MANAGE_MEMBERS"] = "manageMembers";
      UserActionType2["MANAGE_GROUPS"] = "manageGroups";
      UserActionType2["ACCESS_KEYS"] = "accessKeys";
      UserActionType2["ACCOUNT_PREFERENCES"] = "accountPreferences";
      UserActionType2["ACCOUNT_CUSTOMIZATION"] = "accountCustomization";
      UserActionType2["DATA_MANAGEMENT"] = "dataManagement";
      UserActionType2["CUSTOMIZE_ASSISTANT"] = "customizeAssistant";
      UserActionType2["SHARE_MEETINGS"] = "shareMeetings";
      UserActionType2["ROUTE_MEETINGS"] = "routeMeetings";
      UserActionType2["EXCLUDE_MEETINGS"] = "excludeMeetings";
      UserActionType2["GLOBAL_SETTINGS"] = "globalSettings";
      UserActionType2["ACCESS_ALL"] = "accessAll";
    })(UserActionType || (UserActionType = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/webhook.js
var WebhookEvent, WebhookEventSource;
var init_webhook = __esm({
  "node_modules/@speakai/shared/dist/enums/webhook.js"() {
    "use strict";
    (function(WebhookEvent2) {
      WebhookEvent2["embed_recorder.created"] = "embed_recorder.created";
      WebhookEvent2["embed_recorder.deleted"] = "embed_recorder.deleted";
      WebhookEvent2["embed_recorder.recording_received"] = "embed_recorder.recording_received";
      WebhookEvent2["media.analyzed"] = "media.analyzed";
      WebhookEvent2["media.created"] = "media.created";
      WebhookEvent2["media.deleted"] = "media.deleted";
      WebhookEvent2["media.failed"] = "media.failed";
      WebhookEvent2["media.reanalyzed"] = "media.reanalyzed";
      WebhookEvent2["media.updated"] = "media.updated";
      WebhookEvent2["text.analyzed"] = "text.analyzed";
      WebhookEvent2["text.created"] = "text.created";
      WebhookEvent2["text.deleted"] = "text.deleted";
      WebhookEvent2["text.failed"] = "text.failed";
      WebhookEvent2["text.reanalyzed"] = "text.reanalyzed";
      WebhookEvent2["meeting_assistant.status"] = "meeting_assistant.status";
      WebhookEvent2["chat.status"] = "chat.status";
      WebhookEvent2["csv.uploaded"] = "csv.uploaded";
      WebhookEvent2["csv.failed"] = "csv.failed";
    })(WebhookEvent || (WebhookEvent = {}));
    (function(WebhookEventSource2) {
      WebhookEventSource2["SPEAK"] = "speak";
      WebhookEventSource2["ZAPIER"] = "zapier";
    })(WebhookEventSource || (WebhookEventSource = {}));
  }
});

// node_modules/@speakai/shared/dist/enums/index.js
var init_enums = __esm({
  "node_modules/@speakai/shared/dist/enums/index.js"() {
    "use strict";
    init_activities();
    init_auth();
    init_automation();
    init_calendar();
    init_clip();
    init_domain();
    init_embed();
    init_export();
    init_fields();
    init_filter();
    init_media();
    init_meeting();
    init_notification();
    init_prompt();
    init_recorder();
    init_subscription();
    init_team();
    init_transcription();
    init_transaction();
    init_translation();
    init_user();
    init_webhook();
  }
});

// node_modules/@speakai/shared/dist/interfaces/api.js
var init_api = __esm({
  "node_modules/@speakai/shared/dist/interfaces/api.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/media.js
var init_media2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/media.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/transcript.js
var init_transcript = __esm({
  "node_modules/@speakai/shared/dist/interfaces/transcript.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/text.js
var init_text = __esm({
  "node_modules/@speakai/shared/dist/interfaces/text.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/folder.js
var init_folder = __esm({
  "node_modules/@speakai/shared/dist/interfaces/folder.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/recorder.js
var init_recorder2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/recorder.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/embed.js
var init_embed2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/embed.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/automation.js
var init_automation2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/automation.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/webhook.js
var init_webhook2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/webhook.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/field.js
var init_field = __esm({
  "node_modules/@speakai/shared/dist/interfaces/field.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/meeting.js
var init_meeting2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/meeting.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/export.js
var init_export2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/export.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/prompt.js
var init_prompt2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/prompt.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/user.js
var init_user2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/user.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/subscription.js
var init_subscription2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/subscription.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/calendar.js
var init_calendar2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/calendar.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/category.js
var init_category = __esm({
  "node_modules/@speakai/shared/dist/interfaces/category.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/clip.js
var init_clip2 = __esm({
  "node_modules/@speakai/shared/dist/interfaces/clip.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/interfaces/index.js
var init_interfaces = __esm({
  "node_modules/@speakai/shared/dist/interfaces/index.js"() {
    "use strict";
    init_api();
    init_media2();
    init_transcript();
    init_text();
    init_folder();
    init_recorder2();
    init_embed2();
    init_automation2();
    init_webhook2();
    init_field();
    init_meeting2();
    init_export2();
    init_prompt2();
    init_user2();
    init_subscription2();
    init_calendar2();
    init_category();
    init_clip2();
  }
});

// node_modules/@speakai/shared/dist/utils/transcript.js
var init_transcript2 = __esm({
  "node_modules/@speakai/shared/dist/utils/transcript.js"() {
    "use strict";
  }
});

// node_modules/@speakai/shared/dist/index.js
var init_dist = __esm({
  "node_modules/@speakai/shared/dist/index.js"() {
    "use strict";
    init_enums();
    init_interfaces();
    init_transcript2();
  }
});

// src/tools/media.ts
var media_exports = {};
__export(media_exports, {
  register: () => register
});
function register(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "get_signed_upload_url",
    "Get a pre-signed S3 URL for direct file upload to Speak AI storage. After getting the URL, PUT your file to it, then call upload_media with the S3 URL. For a simpler workflow, use upload_local_file instead which handles all steps automatically.",
    {
      isVideo: import_zod2.z.boolean().describe("Set true for video files, false for audio files"),
      filename: import_zod2.z.string().min(1).describe("Original filename including extension"),
      mimeType: import_zod2.z.string().describe('MIME type of the file, e.g. "audio/mp4" or "video/mp4"')
    },
    {
      title: "Get Signed Upload URL",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "upload_media",
    "Upload media from a URL \u2014 a direct/public file URL, a pre-signed S3 URL, or a shareable social/video link (YouTube, Instagram, TikTok, X, Facebook, Reddit, SoundCloud, and similar) which Speak resolves to the underlying media automatically. Processing is asynchronous \u2014 after uploading, use get_media_status to poll until state is 'processed' (typically 1-3 minutes for audio under 60 min), then use get_transcript and get_media_insights to retrieve results. For a single call that handles everything, use upload_and_analyze instead. For local files, use upload_local_file. (Vimeo links are not yet supported.)",
    {
      name: import_zod2.z.string().min(1).describe("Display name for the media file"),
      url: import_zod2.z.string().describe("Direct/public media file URL, pre-signed S3 URL, or a shareable social/video page link (e.g. an Instagram reel or TikTok URL) \u2014 page links are resolved to the underlying media server-side."),
      mediaType: import_zod2.z.enum([MediaType.AUDIO, MediaType.VIDEO]).describe('Type of media: "audio" or "video"'),
      description: import_zod2.z.string().optional().describe("Description of the media file"),
      sourceLanguage: import_zod2.z.string().optional().describe('BCP-47 language code for transcription, e.g. "en-US" or "he-IL"'),
      tags: import_zod2.z.string().optional().describe("Comma-separated tags for the media"),
      folderId: import_zod2.z.string().optional().describe("ID of the folder to place the media in"),
      callbackUrl: import_zod2.z.string().optional().describe("Webhook callback URL for this specific upload"),
      fields: import_zod2.z.array(
        import_zod2.z.object({
          id: import_zod2.z.string().min(1).describe("Custom field ID"),
          value: import_zod2.z.string().min(1).describe("Custom field value")
        })
      ).optional().describe("Custom field values to attach to the media")
    },
    {
      title: "Upload Media from URL",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
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
  registerSpeakTool(
    server,
    "list_media",
    "List and search media files in the workspace with filtering, pagination, and sorting. Use filterName for text search, mediaType to filter by audio/video/text, folderId for folder-specific results, and from/to for date ranges. Use the include param to embed additional data (transcripts, speakers, keywords) inline with each result, avoiding N+1 API calls. Returns mediaIds you can pass to get_transcript, get_media_insights, or ask_ai_chat. For deep full-text search across transcripts, use search_media instead.",
    {
      mediaType: import_zod2.z.enum([MediaType.AUDIO, MediaType.VIDEO, MediaType.TEXT]).optional().describe('Filter by media type: "audio", "video", or "text"'),
      page: import_zod2.z.number().int().min(0).optional().describe("Page number for pagination (0-based, default: 0)"),
      pageSize: import_zod2.z.number().int().min(1).max(500).optional().describe("Number of results per page (default: 20, max: 500)"),
      sortBy: import_zod2.z.string().optional().describe('Sort field and direction, e.g. "createdAt:desc" or "name:asc"'),
      filterMedia: import_zod2.z.number().int().optional().describe("Filter: 0=Uploaded, 1=Assigned, 2=Both (default: 2)"),
      filterName: import_zod2.z.string().optional().describe("Filter media by partial name match"),
      folderId: import_zod2.z.string().optional().describe("Filter media within a specific folder"),
      from: import_zod2.z.string().optional().describe("Start date for date range filter (ISO 8601)"),
      to: import_zod2.z.string().optional().describe("End date for date range filter (ISO 8601)"),
      isFavorites: import_zod2.z.boolean().optional().describe("Filter to only show favorited media"),
      include: import_zod2.z.array(
        import_zod2.z.enum([
          "transcription",
          "keywords",
          "speakers",
          "sentiment",
          "custom",
          "fields"
        ])
      ).optional().describe(
        "Additional data to include with each media item. Without this, only metadata is returned. Use 'transcription' to include full transcripts inline, 'speakers' for speaker details, 'keywords' for extracted keywords, etc. Avoids N+1 API calls when you need data for multiple files."
      )
    },
    {
      title: "List Media Files",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ include, ...params }) => {
      try {
        const queryParams = { ...params };
        if (include?.length) {
          queryParams.requestTypes = include.join(",");
        }
        const result = await api.get("/v1/media", { params: queryParams });
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
  registerSpeakTool(
    server,
    "get_media_insights",
    "Retrieve AI-generated insights for a processed media file \u2014 topics, sentiment, keywords, action items, summaries, and more. The media must be in 'processed' state (check with get_media_status first). For asking custom questions about a media file, use ask_ai_chat instead.",
    {
      mediaId: import_zod2.z.string().min(1).describe("Unique identifier of the media file")
    },
    {
      title: "Get Media Insights",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "get_transcript",
    "Retrieve the full transcript for a media file with speaker labels and timestamps. Works on processed media and also returns the partial, in-progress transcript while a meeting bot is still recording (LIVE_TRANSCRIPT state). To fetch only the new sentences added since your previous call during a live meeting, use get_live_meeting_transcript instead. Use update_transcript_speakers to rename speaker labels after reviewing. For subtitle-formatted output, use get_captions instead.",
    {
      mediaId: import_zod2.z.string().min(1).describe("Unique identifier of the media file")
    },
    {
      title: "Get Transcript",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "update_transcript_speakers",
    "Update or rename speaker labels in a media transcript.",
    {
      mediaId: import_zod2.z.string().min(1).describe("Unique identifier of the media file"),
      speakers: import_zod2.z.array(
        import_zod2.z.object({
          id: import_zod2.z.string().min(1).describe("Speaker identifier from the transcript"),
          name: import_zod2.z.string().min(1).describe("Display name to assign to the speaker")
        })
      ).describe("Array of speaker ID to name mappings")
    },
    {
      title: "Rename Transcript Speakers",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "update_transcription",
    "Edit the official transcript text of a single media file by finding and replacing text. Replaces every occurrence of the original text with the replacement (leave replacement empty to delete the text) and reports how many occurrences were replaced. Use update_transcript_speakers to rename speaker labels instead.",
    {
      mediaId: import_zod2.z.string().min(1).describe("Unique identifier of the media file"),
      original: import_zod2.z.string().min(1).describe("Text to find in the transcript"),
      replacement: import_zod2.z.string().describe("Text to replace it with (empty string deletes the matched text)"),
      caseSensitive: import_zod2.z.boolean().optional().describe("Match case exactly when finding the original text")
    },
    {
      title: "Update Transcription Text",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    },
    async ({ mediaId, original, replacement, caseSensitive }) => {
      try {
        const result = await api.put(
          `/v1/media/transcript/${mediaId}/replace`,
          { original, replacement, caseSensitive }
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
  registerSpeakTool(
    server,
    "get_media_status",
    "Check the processing status of a media file. States: pending \u2192 transcribing \u2192 analyzing \u2192 processed (or failed). Poll this after upload_media until state is 'processed', then use get_transcript and get_media_insights to retrieve results.",
    {
      mediaId: import_zod2.z.string().min(1).describe("Unique identifier of the media file")
    },
    {
      title: "Get Media Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "update_media_metadata",
    "Update metadata fields (name, description, tags, status) for an existing media file.",
    {
      mediaId: import_zod2.z.string().min(1).describe("Unique identifier of the media file"),
      name: import_zod2.z.string().describe("Display name for the media (required \u2014 the server replaces the metadata)"),
      description: import_zod2.z.string().optional().describe("Description or notes for the media"),
      folderId: import_zod2.z.string().optional().describe("Move media to this folder ID"),
      tags: import_zod2.z.array(import_zod2.z.string()).optional().describe("Array of tags to assign to the media"),
      status: import_zod2.z.string().optional().describe("Media status value"),
      remark: import_zod2.z.string().optional().describe("Internal remark or note"),
      manageBy: import_zod2.z.string().optional().describe("User ID to assign management of this media to")
    },
    {
      title: "Update Media Metadata",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "delete_media",
    "Permanently delete a media file and all associated transcripts and insights.",
    {
      mediaId: import_zod2.z.string().min(1).describe("Unique identifier of the media file to delete")
    },
    {
      title: "Delete Media File",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "get_captions",
    "Get captions for a media file. Captions are separate from full transcripts and are formatted for display/subtitles.",
    {
      mediaId: import_zod2.z.string().min(1).describe("Unique identifier of the media file")
    },
    {
      title: "Get Captions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get(`/v1/media/caption/${mediaId}`);
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
  registerSpeakTool(
    server,
    "list_supported_languages",
    "List all languages supported for transcription. Use the language codes when uploading media with a specific sourceLanguage.",
    {},
    {
      title: "List Supported Languages",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async () => {
      try {
        const result = await api.get("/v1/media/supportedLanguages");
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
  registerSpeakTool(
    server,
    "get_media_statistics",
    "Get workspace-level media statistics \u2014 total counts, processing status breakdown, storage usage, etc.",
    {},
    {
      title: "Get Media Statistics",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async () => {
      try {
        const result = await api.get("/v1/media/statistics");
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
  registerSpeakTool(
    server,
    "toggle_media_favorite",
    "Mark or unmark media files as favorites for quick access.",
    {
      mediaIds: import_zod2.z.array(import_zod2.z.string().min(1)).min(1).describe("Media file IDs to update"),
      isFavorite: import_zod2.z.boolean().describe("true to mark as favorite, false to unmark")
    },
    {
      title: "Toggle Media Favorite",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.post("/v1/media/favorites", body);
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
  registerSpeakTool(
    server,
    "reanalyze_media",
    "Re-run AI analysis on a media file using the latest models. Choose which parts to re-run via the flags below.",
    {
      mediaId: import_zod2.z.string().min(1).describe("Unique identifier of the media file to re-analyze"),
      isInsights: import_zod2.z.boolean().optional().describe("Re-run insights analysis"),
      isSentiment: import_zod2.z.boolean().optional().describe("Re-run sentiment analysis"),
      isFillerWords: import_zod2.z.boolean().optional().describe("Re-run filler-word detection"),
      isEmbeddings: import_zod2.z.boolean().optional().describe("Re-generate embeddings")
    },
    {
      title: "Re-analyze Media",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    async ({ mediaId, ...params }) => {
      try {
        const result = await api.get(`/v1/media/reanalyze/${mediaId}`, { params });
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
  registerSpeakTool(
    server,
    "bulk_update_transcript_speakers",
    "Update or rename speaker labels across multiple media files in a single operation. Applies the same speaker mappings to every specified media file. Use this instead of calling update_transcript_speakers repeatedly when renaming speakers across a project or folder.",
    {
      mediaIds: import_zod2.z.array(import_zod2.z.string().min(1)).min(1).max(500).describe("Array of media IDs to update speakers for (max 500 per call)"),
      speakers: import_zod2.z.array(
        import_zod2.z.object({
          id: import_zod2.z.string().min(1).describe("Speaker identifier from the transcript"),
          name: import_zod2.z.string().min(1).describe("Display name to assign to the speaker")
        })
      ).describe("Array of speaker ID to name mappings to apply to all specified media files")
    },
    {
      title: "Bulk Rename Speakers Across Files",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ mediaIds, speakers }) => {
      const results = [];
      for (const mediaId of mediaIds) {
        try {
          await api.put(`/v1/media/speakers/${mediaId}`, speakers);
          results.push({ mediaId, success: true });
        } catch (err) {
          results.push({ mediaId, success: false, error: formatAxiosError(err) });
        }
      }
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { summary: { total: mediaIds.length, succeeded, failed }, results },
              null,
              2
            )
          }
        ],
        isError: failed === mediaIds.length
      };
    }
  );
  registerSpeakTool(
    server,
    "bulk_move_media",
    "Move multiple media files to a folder in a single operation. Use this for batch reorganization instead of updating media one by one.",
    {
      folderId: import_zod2.z.string().min(1).describe("Target folder ID to move media into"),
      mediaIds: import_zod2.z.array(import_zod2.z.string().min(1)).min(1).describe("Array of media IDs to move")
    },
    {
      title: "Bulk Move Media Files",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.put("/v1/media/move", body);
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
var init_media3 = __esm({
  "src/tools/media.ts"() {
    "use strict";
    import_zod2 = require("zod");
    init_helpers();
    init_client();
    init_dist();
  }
});

// src/tools/text.ts
var text_exports = {};
__export(text_exports, {
  register: () => register2
});
function register2(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "create_text_note",
    "Create a new text note in Speak AI for analysis. The content will be analyzed for insights, topics, and sentiment.",
    {
      name: import_zod3.z.string().min(1).describe("Title/name for the text note"),
      text: import_zod3.z.string().optional().describe("Full text content to analyze"),
      description: import_zod3.z.string().optional().describe("Description for the text note"),
      folderId: import_zod3.z.string().optional().describe("ID of the folder to place the note in"),
      tags: import_zod3.z.string().optional().describe("Comma-separated tags or array of tag strings"),
      callbackUrl: import_zod3.z.string().optional().describe("Webhook callback URL for completion notification"),
      fields: import_zod3.z.array(
        import_zod3.z.object({
          id: import_zod3.z.string().min(1).describe("Custom field ID"),
          value: import_zod3.z.string().min(1).describe("Custom field value")
        })
      ).optional().describe("Custom field values to attach to the text note")
    },
    {
      title: "Create Text Note",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
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
  registerSpeakTool(
    server,
    "get_text_insight",
    "Retrieve AI-generated insights for a text note, including topics, sentiment, summaries, and action items.",
    {
      mediaId: import_zod3.z.string().min(1).describe("Unique identifier of the text note")
    },
    {
      title: "Get Text Note Insights",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "reanalyze_text",
    "Trigger a re-analysis of an existing text note to regenerate insights with the latest AI models.",
    {
      mediaId: import_zod3.z.string().describe("Unique identifier of the text note to reanalyze")
    },
    {
      title: "Re-analyze Text Note",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "update_text_note",
    "Update an existing text note's name, content, or metadata. Updating text content will trigger re-analysis.",
    {
      mediaId: import_zod3.z.string().min(1).describe("Unique identifier of the text note"),
      name: import_zod3.z.string().optional().describe("New name for the text note"),
      text: import_zod3.z.string().optional().describe("New text content (will trigger re-analysis)"),
      description: import_zod3.z.string().optional().describe("Updated description"),
      folderId: import_zod3.z.string().optional().describe("Move to a different folder"),
      tags: import_zod3.z.string().optional().describe("Updated comma-separated tags")
    },
    {
      title: "Update Text Note",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
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
var import_zod3;
var init_text2 = __esm({
  "src/tools/text.ts"() {
    "use strict";
    import_zod3 = require("zod");
    init_helpers();
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
  registerSpeakTool(
    server,
    "export_media",
    "Export a media file's transcript or insights in various formats (pdf, docx, srt, vtt, txt, csv).",
    {
      mediaId: import_zod4.z.string().min(1).describe("Unique identifier of the media file"),
      fileType: import_zod4.z.nativeEnum(ExportFormatType).describe("Desired export format"),
      isSpeakerNames: import_zod4.z.boolean().optional().describe("Include speaker names in export"),
      isSpeakerEmail: import_zod4.z.boolean().optional().describe("Include speaker emails in export"),
      isTimeStamps: import_zod4.z.boolean().optional().describe("Include timestamps in export"),
      isInsightVisualized: import_zod4.z.boolean().optional().describe("Include insight visualizations"),
      isRedacted: import_zod4.z.boolean().optional().describe("Apply PII redaction to export"),
      redactedCategories: import_zod4.z.array(import_zod4.z.string()).optional().describe("Specific categories to redact")
    },
    {
      title: "Export Media Transcript",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    async ({ mediaId, fileType, ...body }) => {
      try {
        const result = await api.post(
          `/v1/media/export/${mediaId}/${fileType}`,
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
  registerSpeakTool(
    server,
    "export_multiple_media",
    "Export multiple media files at once, optionally merged into a single file.",
    {
      mediaIds: import_zod4.z.array(import_zod4.z.string()).describe("Array of media IDs to export"),
      fileType: import_zod4.z.nativeEnum(ExportFormatType).describe("Desired export format"),
      isSpeakerNames: import_zod4.z.boolean().optional().describe("Include speaker names in export"),
      isSpeakerEmail: import_zod4.z.boolean().optional().describe("Include speaker emails in export"),
      isTimeStamps: import_zod4.z.boolean().optional().describe("Include timestamps in export"),
      isInsightVisualized: import_zod4.z.boolean().optional().describe("Include insight visualizations"),
      isRedacted: import_zod4.z.boolean().optional().describe("Apply PII redaction to export"),
      isMerged: import_zod4.z.boolean().optional().describe("Merge all exports into a single file"),
      folderId: import_zod4.z.string().optional().describe("Folder ID for the merged export")
    },
    {
      title: "Export Multiple Media Files",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
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
var import_zod4;
var init_exports = __esm({
  "src/tools/exports.ts"() {
    "use strict";
    import_zod4 = require("zod");
    init_helpers();
    init_client();
    init_dist();
  }
});

// src/tools/folders.ts
var folders_exports = {};
__export(folders_exports, {
  register: () => register4
});
function register4(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "get_all_folder_views",
    "Retrieve all saved views across all folders.",
    {},
    {
      title: "Get All Folder Views",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async () => {
      try {
        const result = await api.get("/v1/folder/views");
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
  registerSpeakTool(
    server,
    "get_folder_views",
    "Retrieve all saved views for a specific folder.",
    {
      folderId: import_zod5.z.string().min(1).describe("Unique identifier of the folder")
    },
    {
      title: "Get Folder Views",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ folderId }) => {
      try {
        const result = await api.get(`/v1/folder/${folderId}/views`);
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
  registerSpeakTool(
    server,
    "create_folder_view",
    "Create a new saved view for a folder with a custom set of display columns.",
    {
      folderId: import_zod5.z.string().min(1).describe("Unique identifier of the folder"),
      name: import_zod5.z.string().describe("Display name for the view"),
      isDefault: import_zod5.z.boolean().optional().describe("Whether this view is the folder's default view"),
      columns: import_zod5.z.array(
        import_zod5.z.object({
          fieldId: import_zod5.z.string().optional().describe("Field ID this column maps to (omit for built-in columns)"),
          name: import_zod5.z.string().describe("Column display name"),
          type: import_zod5.z.string().describe("Column type \u2014 a FieldType or a default view column"),
          definition: import_zod5.z.string().optional().describe("Optional column definition"),
          order: import_zod5.z.number().describe("Column display order")
        })
      ).describe("Ordered list of columns shown in the view")
    },
    {
      title: "Create Folder View",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    async ({ folderId, ...body }) => {
      try {
        const result = await api.post(
          `/v1/folder/${folderId}/views`,
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
  registerSpeakTool(
    server,
    "update_folder_view",
    "Update an existing saved view. Replaces the whole view, so `name`, `isDefault` and `columns` must all be supplied.",
    {
      folderId: import_zod5.z.string().min(1).describe("Unique identifier of the folder"),
      viewId: import_zod5.z.string().min(1).describe("Unique identifier of the view to update"),
      name: import_zod5.z.string().describe("Display name for the view"),
      isDefault: import_zod5.z.boolean().describe("Whether this view is the folder's default view"),
      columns: import_zod5.z.array(
        import_zod5.z.object({
          fieldId: import_zod5.z.string().optional().describe("Field ID this column maps to (omit for built-in columns)"),
          name: import_zod5.z.string().describe("Column display name"),
          type: import_zod5.z.string().describe("Column type \u2014 a FieldType or a default view column"),
          definition: import_zod5.z.string().optional().describe("Optional column definition"),
          order: import_zod5.z.number().describe("Column display order")
        })
      ).describe("Ordered list of columns shown in the view")
    },
    {
      title: "Update Folder View",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ folderId, viewId, ...body }) => {
      try {
        const result = await api.put(
          `/v1/folder/${folderId}/views/${viewId}`,
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
  registerSpeakTool(
    server,
    "clone_folder_view",
    "Duplicate an existing folder view into a target folder.",
    {
      sourceFolderId: import_zod5.z.string().min(1).describe("Folder that currently holds the view"),
      targetFolderId: import_zod5.z.string().min(1).describe("Folder to copy the view into (must differ from sourceFolderId)"),
      viewId: import_zod5.z.string().min(1).describe("Unique identifier of the view to clone"),
      name: import_zod5.z.string().describe("Display name for the cloned view"),
      isDefault: import_zod5.z.boolean().optional().describe("Whether the cloned view becomes the target folder's default")
    },
    {
      title: "Clone Folder View",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.post("/v1/folder/views/clone", body);
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
  registerSpeakTool(
    server,
    "list_folders",
    "List all folders in the workspace with pagination and sorting.",
    {
      page: import_zod5.z.number().int().min(0).optional().describe("Page number (0-based, default: 0)"),
      pageSize: import_zod5.z.number().int().min(1).max(500).optional().describe("Results per page (default: 20, max: 500)"),
      sortBy: import_zod5.z.string().optional().describe('Sort field and direction, e.g. "createdAt:desc"')
    },
    {
      title: "List Folders",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "get_folder_info",
    "Get detailed information about a specific folder including its contents.",
    {
      folderId: import_zod5.z.string().min(1).describe("Unique identifier of the folder")
    },
    {
      title: "Get Folder Info",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "create_folder",
    "Create a new folder in the workspace.",
    {
      name: import_zod5.z.string().min(1).describe("Display name for the new folder"),
      description: import_zod5.z.string().optional().describe("Optional folder description")
    },
    {
      title: "Create Folder",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "clone_folder",
    "Duplicate an existing folder and all of its contents.",
    {
      folderId: import_zod5.z.string().min(1).describe("ID of the folder to clone"),
      name: import_zod5.z.string().optional().describe("Name for the cloned folder"),
      description: import_zod5.z.string().optional().describe("Description for the cloned folder"),
      assignTo: import_zod5.z.array(import_zod5.z.string()).optional().describe("User IDs to assign the cloned folder to"),
      isSaveDefaultView: import_zod5.z.boolean().optional().describe("Whether to copy the source folder's default view")
    },
    {
      title: "Clone Folder",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "update_folder",
    "Update a folder. `name` must always be supplied (the server replaces the folder config).",
    {
      folderId: import_zod5.z.string().min(1).describe("Unique identifier of the folder"),
      name: import_zod5.z.string().describe("Display name for the folder"),
      description: import_zod5.z.string().optional().describe("Optional folder description")
    },
    {
      title: "Update Folder",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "delete_folder",
    "Permanently delete a folder. Media within the folder will be moved, not deleted.",
    {
      folderId: import_zod5.z.string().min(1).describe("Unique identifier of the folder to delete")
    },
    {
      title: "Delete Folder",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
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
var import_zod5;
var init_folders = __esm({
  "src/tools/folders.ts"() {
    "use strict";
    import_zod5 = require("zod");
    init_helpers();
    init_client();
  }
});

// src/tools/recorder.ts
var recorder_exports = {};
__export(recorder_exports, {
  register: () => register5
});
function optionsFromMetaType(metaType) {
  const bool = (v, fallback) => typeof v === "boolean" ? v : fallback;
  const upload = metaType?.upload ?? {};
  return {
    audio: bool(metaType?.audio, true),
    video: bool(metaType?.video, true),
    screenShare: bool(metaType?.screenShare, false),
    upload: {
      file: bool(upload.file, true),
      multiple: bool(upload.multiple, false),
      url: bool(upload.url, false)
    },
    liveTranscription: bool(metaType?.liveTranscription, false)
  };
}
function addRecorderOptions(recorder) {
  if (recorder && typeof recorder === "object") {
    recorder.options = optionsFromMetaType(recorder.meta?.type);
  }
  return recorder;
}
function register5(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "check_recorder_status",
    "Check whether a recorder/survey is active and accepting submissions.",
    {
      token: import_zod6.z.string().min(1).describe("Unique token identifying the recorder")
    },
    {
      title: "Check Recorder Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "create_recorder",
    "Create a new recorder or survey for collecting audio/video submissions.",
    {
      name: import_zod6.z.string().describe("Display name for the recorder"),
      ...recorderConfigShape,
      clientInformation: import_zod6.z.record(import_zod6.z.unknown()).optional().describe(
        `Respondent info & questions: { name:boolean, email:boolean, questions:[\u2026], consent?:{ isEnabled, title, description, yesButtonLabel, noButtonLabel, isRequired, fieldId? } }. Question shape \u2014 ${QUESTION_SHAPE_DESC}`
      )
    },
    {
      title: "Create Recorder",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    async (body) => {
      try {
        const result = await api.post("/v1/recorder/create", body);
        addRecorderOptions(result.data?.data?.recorderData);
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
  registerSpeakTool(
    server,
    "list_recorders",
    "List all recorders/surveys in the workspace.",
    {
      page: import_zod6.z.number().int().min(0).optional().describe("Page number (0-based, default: 0)"),
      pageSize: import_zod6.z.number().int().min(1).max(500).optional().describe("Results per page (default: 20, max: 500)"),
      sortBy: import_zod6.z.string().optional().describe('Sort field, e.g. "createdAt:desc"')
    },
    {
      title: "List Recorders",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async (params) => {
      try {
        const result = await api.get("/v1/recorder", { params });
        result.data?.data?.recorderList?.forEach?.(addRecorderOptions);
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
  registerSpeakTool(
    server,
    "clone_recorder",
    "Duplicate an existing recorder including all its settings and questions.",
    {
      recorderId: import_zod6.z.string().min(1).describe("ID of the recorder to clone"),
      name: import_zod6.z.string().optional().describe("Name for the cloned recorder"),
      description: import_zod6.z.string().optional().describe("Description for the cloned recorder"),
      folderId: import_zod6.z.string().optional().describe("Folder for the cloned recorder")
    },
    {
      title: "Clone Recorder",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
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
  registerSpeakTool(
    server,
    "get_recorder_info",
    "Get detailed information about a specific recorder including its settings and questions.",
    {
      recorderId: import_zod6.z.string().min(1).describe("Unique identifier of the recorder")
    },
    {
      title: "Get Recorder Info",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ recorderId }) => {
      try {
        const result = await api.get(`/v1/recorder/${recorderId}`);
        addRecorderOptions(result.data?.data);
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
  registerSpeakTool(
    server,
    "get_recorder_recordings",
    "List all submissions/recordings collected by a specific recorder.",
    {
      recorderId: import_zod6.z.string().min(1).describe("Unique identifier of the recorder")
    },
    {
      title: "Get Recorder Submissions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "generate_recorder_url",
    "Generate a shareable public URL for a recorder/survey.",
    {
      recorderId: import_zod6.z.string().min(1).describe("Unique identifier of the recorder")
    },
    {
      title: "Generate Recorder Share URL",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
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
  registerSpeakTool(
    server,
    "update_recorder_settings",
    "Update configuration settings for a recorder (branding, capture options, etc.). `name` must always be supplied.",
    {
      recorderId: import_zod6.z.string().min(1).describe("Unique identifier of the recorder"),
      name: import_zod6.z.string().describe("Display name for the recorder"),
      ...recorderConfigShape
    },
    {
      title: "Update Recorder Settings",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    async ({ recorderId, ...body }) => {
      try {
        const result = await api.put(`/v1/recorder/settings/${recorderId}`, body);
        addRecorderOptions(result.data?.data?.recorderData);
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
  registerSpeakTool(
    server,
    "update_recorder_questions",
    "Update the survey questions and respondent-info settings for a recorder.",
    {
      recorderId: import_zod6.z.string().min(1).describe("Unique identifier of the recorder"),
      name: import_zod6.z.boolean().optional().describe("Whether to collect the respondent's name"),
      email: import_zod6.z.boolean().optional().describe("Whether to collect the respondent's email"),
      questions: import_zod6.z.array(import_zod6.z.record(import_zod6.z.unknown())).describe(
        `Survey questions. ${QUESTION_SHAPE_DESC} (id? may also be passed to update an existing question.)`
      ),
      consent: import_zod6.z.record(import_zod6.z.unknown()).optional().describe(
        "Consent screen: { isEnabled, title, description, yesButtonLabel, noButtonLabel, isRequired, fieldId? }"
      )
    },
    {
      title: "Update Recorder Questions",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    async ({ recorderId, ...body }) => {
      try {
        const result = await api.put(`/v1/recorder/questions/${recorderId}`, body);
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
  registerSpeakTool(
    server,
    "delete_recorder",
    "Permanently delete a recorder/survey. Existing recordings are preserved.",
    {
      recorderId: import_zod6.z.string().min(1).describe("Unique identifier of the recorder to delete")
    },
    {
      title: "Delete Recorder",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
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
var import_zod6, RECORDER_ANSWER_TYPES, QUESTION_SHAPE_DESC, recorderConfigShape;
var init_recorder3 = __esm({
  "src/tools/recorder.ts"() {
    "use strict";
    import_zod6 = require("zod");
    init_helpers();
    init_client();
    RECORDER_ANSWER_TYPES = [
      "single",
      "multiple",
      "checkbox",
      "radiobutton",
      "dropdownlist",
      "date",
      "time",
      "datetime"
    ];
    QUESTION_SHAPE_DESC = `Each: { question, isRequired, answerType, options?, includeOther?, fieldId? }. answerType must be one of: ${RECORDER_ANSWER_TYPES.map((t) => `"${t}"`).join(", ")}. Choice types (single, multiple, checkbox, radiobutton, dropdownlist) take options:string[] and includeOther:boolean (adds a free-text "Other"). date/time/datetime take no options. There is no free-text/rating/number answerType.`;
    recorderConfigShape = {
      description: import_zod6.z.string().optional().describe("Recorder description"),
      sourceLanguage: import_zod6.z.string().optional().describe("Transcription language code (e.g. en-US)"),
      folderId: import_zod6.z.string().optional().describe("Folder to store recordings in"),
      isAutoAnalyze: import_zod6.z.boolean().optional().describe("Whether to auto-analyze submissions"),
      notifyUsers: import_zod6.z.array(import_zod6.z.string()).optional().describe("User IDs to notify on new submissions"),
      duration: import_zod6.z.record(import_zod6.z.unknown()).optional().describe("Recording duration: { minDuration, maxDuration } in seconds"),
      options: import_zod6.z.record(import_zod6.z.unknown()).optional().describe(
        "Capture options: { audio, video, screenShare, liveTranscription, upload:{ file, text, multiple, url } } \u2014 all booleans"
      ),
      notification: import_zod6.z.record(import_zod6.z.unknown()).optional().describe("Notification toggles: { upload, client } \u2014 booleans"),
      meta: import_zod6.z.record(import_zod6.z.unknown()).optional().describe(
        "Branding/customization: { primaryColor, backgroundImg, logo, fontColor, fontFamily, theme, customCSS, hideWaveform, hideTitle, hideDescription, hideSubmitButton, submitButtonLabel, countdown, hideImages }"
      )
    };
  }
});

// src/tools/embed.ts
var embed_exports = {};
__export(embed_exports, {
  register: () => register6
});
function register6(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "create_embed",
    "Create an embeddable player/transcript widget for a media file or a set of folders. Provide `mediaId` for a single-media embed, or `folderIds` for a folder/library embed.",
    {
      mediaId: import_zod7.z.string().optional().describe("Media file to embed (for a single-media embed)"),
      folderIds: import_zod7.z.array(import_zod7.z.string()).optional().describe("Folder IDs to embed (for a folder/library embed)")
    },
    {
      title: "Create Embed Widget",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
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
  registerSpeakTool(
    server,
    "update_embed",
    "Update an existing embed widget \u2014 appearance/feature toggles via `meta`, plus scope and privacy.",
    {
      embedId: import_zod7.z.string().min(1).describe("Unique identifier of the embed"),
      mediaId: import_zod7.z.string().optional().describe("Media file the embed points to"),
      folderIds: import_zod7.z.array(import_zod7.z.string()).optional().describe("Folder IDs the embed covers"),
      privacyMode: import_zod7.z.string().optional().describe("Privacy mode for the embed"),
      embedType: import_zod7.z.string().optional().describe("Embed type"),
      meta: import_zod7.z.record(import_zod7.z.unknown()).optional().describe(
        "Embed appearance & feature toggles: { backgroundImg, logo, primaryColor, titleColor, chatWelcomeMessage, assistantTemplateId, isTitle, isDescription, isRemarks, isDataVizDownloadable, isSEOIndexing, isPromptAsk, isPromptHistory, isMediaExport, callToActionButtons:[{ url, label }], features:[{ name, isActive, isCustom? }] }"
      )
    },
    {
      title: "Update Embed Widget",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
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
  registerSpeakTool(
    server,
    "check_embed",
    "Check if an embed exists for a media file and retrieve its configuration.",
    {
      mediaId: import_zod7.z.string().min(1).describe("Unique identifier of the media file")
    },
    {
      title: "Check Embed Exists",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ mediaId }) => {
      try {
        const result = await api.get("/v1/embed", { params: { mediaId } });
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
  registerSpeakTool(
    server,
    "get_embed_iframe_url",
    "Get the iframe URL for embedding a media player/transcript on a webpage.",
    {
      mediaId: import_zod7.z.string().min(1).describe("Unique identifier of the media file")
    },
    {
      title: "Get Embed Iframe URL",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
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
var import_zod7;
var init_embed3 = __esm({
  "src/tools/embed.ts"() {
    "use strict";
    import_zod7 = require("zod");
    init_helpers();
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
  const askAiChatDescription = [
    "Ask an AI-powered question about your media using Speak AI's AI Chat.",
    "Supports querying a single file, multiple files, entire folders, or your whole workspace.",
    "Pass mediaIds for specific files, folderIds for entire folders, or omit both to search across all media.",
    "Use assistantType to get specialized responses (e.g., 'researcher' for academic analysis, 'sales' for deal insights).",
    "To continue a conversation, pass the promptId from a previous response.",
    "Returns a promptId \u2014 save it to continue the conversation with follow-up questions."
  ].join(" ");
  const askAiChatInputSchema = {
    prompt: import_zod8.z.string().min(1).describe("The question or prompt to ask about the media"),
    mediaIds: import_zod8.z.array(import_zod8.z.string()).optional().describe("Array of media IDs to query. Omit along with folderIds to search across all media in your workspace."),
    folderIds: import_zod8.z.array(import_zod8.z.string()).optional().describe("Array of folder IDs to scope the query to. Omit along with mediaIds to search across all media."),
    folderId: import_zod8.z.string().optional().describe("Single folder ID to scope the query to. Use folderIds for multiple folders."),
    assistantType: import_zod8.z.enum(Object.values(AssistantType)).optional().describe("Assistant persona: 'general' (default), 'researcher' (academic), 'marketer' (content), 'sales' (deals), 'recruiter' (hiring). Use 'custom' with assistantTemplateId."),
    assistantTemplateId: import_zod8.z.string().optional().describe("Required when assistantType is 'custom'. ID of a custom assistant template from list_prompts."),
    promptId: import_zod8.z.string().optional().describe("ID of an existing conversation to continue. Pass this to maintain chat context across multiple questions."),
    speakers: import_zod8.z.array(import_zod8.z.string()).optional().describe("Filter to specific speaker IDs from the transcript"),
    tags: import_zod8.z.array(import_zod8.z.string()).optional().describe("Filter media by tags"),
    startDate: import_zod8.z.string().optional().describe("Start date for date range filter (ISO 8601, e.g., '2025-01-01')"),
    endDate: import_zod8.z.string().optional().describe("End date for date range filter (ISO 8601, e.g., '2025-03-31')"),
    isIndividualPrompt: import_zod8.z.boolean().optional().describe("When true, processes each media file separately instead of combining context. Useful for comparing responses across files."),
    fieldId: import_zod8.z.string().optional().describe("Scope the prompt to a single custom field"),
    fieldIds: import_zod8.z.array(import_zod8.z.string()).max(10).optional().describe("Scope the prompt to multiple custom fields (max 10)"),
    filters: import_zod8.z.record(import_zod8.z.unknown()).optional().describe("Advanced filter object to scope which media the prompt runs over")
  };
  const askAiChatAnnotations = {
    title: "Ask AI Chat",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  };
  const askAiChatHandler = async (params) => {
    try {
      const result = await api.post("/v1/prompt", params);
      return {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
        isError: true
      };
    }
  };
  registerSpeakTool(
    server,
    "ask_ai_chat",
    askAiChatDescription,
    askAiChatInputSchema,
    askAiChatAnnotations,
    askAiChatHandler
  );
  registerSpeakTool(
    server,
    "retry_ai_chat",
    "Retry a failed or incomplete AI Chat response. Use when a previous ask_ai_chat call returned an error or incomplete answer.",
    {
      promptId: import_zod8.z.string().min(1).describe("ID of the conversation containing the failed message"),
      messageId: import_zod8.z.string().min(1).describe("ID of the specific message to retry")
    },
    {
      title: "Retry AI Chat",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.post("/v1/prompt/retry", body);
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
  registerSpeakTool(
    server,
    "get_chat_history",
    "Get a list of recent AI Chat conversations. Returns conversation summaries with promptIds that can be used to continue conversations via ask_ai_chat or retrieve full messages via get_chat_messages.",
    {
      limit: import_zod8.z.number().int().positive().optional().describe("Number of recent conversations to return (default: 10)")
    },
    {
      title: "Get Chat History",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ limit }) => {
      try {
        const result = await api.get("/v1/prompt/history", {
          params: limit ? { limit } : void 0
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
  registerSpeakTool(
    server,
    "get_chat_messages",
    "Get full message history for conversations. Can filter by promptId for a specific conversation, by media/folder, or search across all chat messages. Returns questions, answers, references, and metadata.",
    {
      promptId: import_zod8.z.string().optional().describe("Filter to a specific conversation by its ID"),
      folderId: import_zod8.z.string().optional().describe("Filter messages by folder ID"),
      mediaIds: import_zod8.z.string().optional().describe("Filter by media IDs (comma-separated)"),
      query: import_zod8.z.string().optional().describe("Search text in prompts and answers"),
      page: import_zod8.z.number().int().min(0).optional().describe("Page number for pagination (0-based, default: 0)"),
      pageSize: import_zod8.z.number().int().min(1).max(500).optional().describe("Results per page (default: 25, max: 500)")
    },
    {
      title: "Get Chat Messages",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async (params) => {
      try {
        const result = await api.get("/v1/prompt/messages", { params });
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
  registerSpeakTool(
    server,
    "delete_chat_message",
    "Delete a specific chat message from conversation history.",
    {
      promptId: import_zod8.z.string().min(1).describe("ID of the message to delete")
    },
    {
      title: "Delete Chat Message",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ promptId }) => {
      try {
        const result = await api.delete(`/v1/prompt/message/${promptId}`);
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
  registerSpeakTool(
    server,
    "list_prompts",
    "List all available AI Chat templates. Use template IDs with ask_ai_chat's assistantTemplateId parameter when using assistantType 'custom'.",
    {},
    {
      title: "List Prompt Templates",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
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
  registerSpeakTool(
    server,
    "get_favorite_prompts",
    "Get all prompts and answers that have been marked as favorites. Useful for finding saved insights and important AI-generated analysis.",
    {},
    {
      title: "Get Favorite Prompts",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async () => {
      try {
        const result = await api.get("/v1/prompt/favorites");
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
  registerSpeakTool(
    server,
    "toggle_prompt_favorite",
    "Mark or unmark a chat message as a favorite for easy retrieval later.",
    {
      promptId: import_zod8.z.string().min(1).describe("ID of the conversation"),
      messageId: import_zod8.z.string().min(1).describe("ID of the specific message to favorite/unfavorite"),
      isFavorite: import_zod8.z.boolean().describe("true to mark as favorite, false to remove")
    },
    {
      title: "Toggle Prompt Favorite",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.post("/v1/prompt/favorites", body);
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
  registerSpeakTool(
    server,
    "update_chat_title",
    "Update the title of a chat conversation for easier identification in history.",
    {
      promptId: import_zod8.z.string().min(1).describe("ID of the conversation to rename"),
      title: import_zod8.z.string().min(1).describe("New title for the conversation")
    },
    {
      title: "Rename Chat",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ promptId, title }) => {
      try {
        const result = await api.put(`/v1/prompt/${promptId}`, { title });
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
  registerSpeakTool(
    server,
    "submit_chat_feedback",
    "Submit feedback on a chat response (thumbs up/down). Helps improve AI answer quality.",
    {
      promptId: import_zod8.z.string().min(1).describe("ID of the conversation"),
      messageId: import_zod8.z.string().min(1).describe("ID of the message to rate"),
      score: import_zod8.z.union([import_zod8.z.literal(1), import_zod8.z.literal(-1)]).describe("Feedback score: 1 for thumbs up, -1 for thumbs down"),
      reason: import_zod8.z.string().optional().describe("Optional explanation for the feedback")
    },
    {
      title: "Submit Chat Feedback",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.post("/v1/prompt/feedback", body);
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
  registerSpeakTool(
    server,
    "get_chat_statistics",
    "Get usage statistics for AI Chat / chat. Returns metrics on prompt usage, optionally filtered by date range.",
    {
      startDate: import_zod8.z.string().optional().describe("Start date for stats (ISO 8601)"),
      endDate: import_zod8.z.string().optional().describe("End date for stats (ISO 8601)")
    },
    {
      title: "Get Chat Statistics",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async (params) => {
      try {
        const result = await api.get("/v1/prompt/statistics", { params });
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
  registerSpeakTool(
    server,
    "export_chat_answer",
    "Export a specific AI Chat answer. Useful for saving AI-generated summaries, reports, or analysis results.",
    {
      promptId: import_zod8.z.string().min(1).describe("ID of the conversation to export"),
      messageId: import_zod8.z.string().min(1).describe("ID of the specific message/answer to export"),
      fileType: import_zod8.z.enum(["txt", "docx", "pdf", "md"]).describe("Export file format")
    },
    {
      title: "Export Chat Answer",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.post("/v1/prompt/export", body);
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
var init_prompt3 = __esm({
  "src/tools/prompt.ts"() {
    "use strict";
    import_zod8 = require("zod");
    init_helpers();
    init_client();
    init_dist();
  }
});

// src/tools/meeting.ts
var meeting_exports = {};
__export(meeting_exports, {
  register: () => register8
});
function register8(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "list_meeting_events",
    "List scheduled or completed meeting assistant events with filtering and pagination.",
    {
      platformType: import_zod9.z.string().optional().describe("Filter by platform. Allowed values: zoom, googleMeet, microsoftTeams, webex. Comma-separate for multiple. Must match these exact strings \u2014 server validates strictly."),
      meetingStatus: import_zod9.z.string().optional().describe("Filter by status (e.g. scheduled, completed, cancelled)"),
      page: import_zod9.z.number().int().min(0).optional().describe("Page number (0-based, default: 0)"),
      pageSize: import_zod9.z.number().int().min(1).max(500).optional().describe("Results per page (default: 20, max: 500)")
    },
    {
      title: "List Meeting Events",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "schedule_meeting_event",
    "Schedule the Speak AI meeting assistant to join and record an upcoming meeting.",
    {
      title: import_zod9.z.string().min(1).describe("Display title for the event"),
      meetingURL: import_zod9.z.string().min(1).describe("URL of the meeting to join"),
      meetingDate: import_zod9.z.string().optional().describe("ISO 8601 datetime for when the meeting starts"),
      meetingLanguage: import_zod9.z.string().optional().describe("Transcription language code for the meeting (e.g. en-US)"),
      folderId: import_zod9.z.string().optional().describe("Folder ID to store the recording in")
    },
    {
      title: "Schedule AI Meeting Assistant",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
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
  registerSpeakTool(
    server,
    "remove_assistant_from_meeting",
    "Remove the Speak AI assistant from an active or scheduled meeting.",
    {
      meetingAssistantEventId: import_zod9.z.string().describe("Unique identifier of the meeting assistant event")
    },
    {
      title: "Remove Assistant from Meeting",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    async ({ meetingAssistantEventId }) => {
      try {
        const result = await api.post(
          "/v1/meeting-assistant/events/remove",
          { meetingAssistantEventId }
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
  registerSpeakTool(
    server,
    "delete_scheduled_assistant",
    "Cancel and delete a scheduled meeting assistant event.",
    {
      meetingAssistantEventId: import_zod9.z.string().describe("Unique identifier of the meeting assistant event to cancel")
    },
    {
      title: "Cancel Scheduled Meeting Assistant",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
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
  registerSpeakTool(
    server,
    "get_live_meeting_transcript",
    "Fetch new sentences from an in-progress or just-ended meeting transcript. Identify the meeting via meetingAssistantEventId (preferred) or mediaId. Pass back the previous response's nextCursor as sinceEndInSec to receive only what's been added since.",
    {
      meetingAssistantEventId: import_zod9.z.string().optional().describe("Meeting assistant event id from list_meeting_events. Either this or mediaId is required."),
      mediaId: import_zod9.z.string().optional().describe("Media id of the live meeting. Either this or meetingAssistantEventId is required."),
      sinceEndInSec: import_zod9.z.number().min(0).optional().describe("Pass the nextCursor value from your previous response to skip already-seen sentences. Omit on the first call.")
    },
    {
      title: "Get Live Meeting Transcript",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    async ({ meetingAssistantEventId, mediaId, sinceEndInSec }) => {
      if (!meetingAssistantEventId && !mediaId) {
        return {
          content: [{ type: "text", text: "Error: provide either meetingAssistantEventId or mediaId." }],
          isError: true
        };
      }
      try {
        let resolvedMediaId = mediaId;
        let meetingStatus = null;
        let meetingName;
        if (meetingAssistantEventId) {
          const eventsRes = await api.get("/v1/meeting-assistant/events", {
            params: { pageSize: 50, sortBy: "startTime:desc" }
          });
          const events = eventsRes.data?.data?.events ?? eventsRes.data?.events ?? [];
          const event = events.find((e) => e.meetingAssistantEventId === meetingAssistantEventId);
          if (!event) {
            return {
              content: [{ type: "text", text: JSON.stringify({ status: "not_found", meetingAssistantEventId }, null, 2) }],
              structuredContent: { data: { status: "not_found", meetingAssistantEventId } }
            };
          }
          meetingStatus = event.currentStatus ?? null;
          meetingName = event.title;
          const mediaRef = event.mediaId;
          const linkedMediaId = typeof mediaRef === "string" ? mediaRef : mediaRef?.mediaId;
          if (!linkedMediaId) {
            const payload2 = {
              status: "not_started",
              meetingAssistantEventId,
              meetingStatus,
              message: "Meeting has no linked media yet \u2014 the bot may not have joined or started recording."
            };
            return {
              content: [{ type: "text", text: JSON.stringify(payload2, null, 2) }],
              structuredContent: { data: payload2 }
            };
          }
          resolvedMediaId = linkedMediaId;
        }
        const transcriptRes = await api.get(`/v1/media/transcript/${resolvedMediaId}`, {
          params: Number.isFinite(sinceEndInSec) ? { sinceEndInSec } : void 0
        });
        const data = transcriptRes.data?.data ?? transcriptRes.data ?? {};
        const sentences = data?.insight?.transcript ?? [];
        const maxEnd = sentences.reduce((m, s) => Math.max(m, s.instances?.[0]?.endInSec ?? 0), 0);
        const nextCursor = sentences.length > 0 ? maxEnd : sinceEndInSec ?? 0;
        const payload = {
          mediaId: resolvedMediaId,
          name: data?.name ?? meetingName ?? null,
          meetingStatus,
          isLive: meetingStatus === "inCallRecording",
          newSentences: sentences,
          nextCursor
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: { data: payload }
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
var init_meeting3 = __esm({
  "src/tools/meeting.ts"() {
    "use strict";
    import_zod9 = require("zod");
    init_helpers();
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
  registerSpeakTool(
    server,
    "list_fields",
    "List all custom fields defined in the workspace.",
    {},
    {
      title: "List Custom Fields",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
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
  registerSpeakTool(
    server,
    "create_field",
    "Create a new custom field for categorizing and tagging media.",
    {
      name: import_zod10.z.string().min(1).describe("Display name for the field"),
      type: import_zod10.z.string().describe("Field type (text, number, select, etc.)"),
      description: import_zod10.z.string().optional().describe("Optional description for the field"),
      prompt: import_zod10.z.string().optional().describe("AI prompt used to auto-populate the field"),
      allowedValues: import_zod10.z.array(import_zod10.z.string()).optional().describe("Allowed values for select/multi-select field types"),
      allowedValuesMode: import_zod10.z.nativeEnum(AllowedValuesMode).optional().describe("Whether one or multiple allowed values can be selected"),
      otherValues: import_zod10.z.boolean().optional().describe("Whether values outside allowedValues are permitted"),
      notApplicableValues: import_zod10.z.string().optional().describe("Value(s) treated as not-applicable"),
      privacyMode: import_zod10.z.string().optional().describe("Privacy mode for the field")
    },
    {
      title: "Create Custom Field",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "update_multiple_fields",
    "Set custom field values across media in a single batch operation. Scope the update with `folderId` (all media in a folder) and/or `mediaIds`.",
    {
      folderId: import_zod10.z.string().optional().describe("Apply the field values to all media in this folder"),
      mediaIds: import_zod10.z.array(import_zod10.z.string()).optional().describe("Apply the field values to these specific media files"),
      fields: import_zod10.z.array(
        import_zod10.z.object({
          id: import_zod10.z.string().min(1).describe("Custom field ID"),
          value: import_zod10.z.unknown().describe("Value to set for the field")
        })
      ).describe("Array of field id/value pairs to set")
    },
    {
      title: "Bulk Update Custom Field Values",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.post("/v1/fields/batch", body);
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
  registerSpeakTool(
    server,
    "update_field",
    "Update a specific custom field by ID. `name` must always be supplied (the server replaces the field config).",
    {
      id: import_zod10.z.string().min(1).describe("Unique identifier of the field"),
      name: import_zod10.z.string().describe("Display name for the field"),
      type: import_zod10.z.string().optional().describe("Field type"),
      description: import_zod10.z.string().optional().describe("Optional description for the field"),
      prompt: import_zod10.z.string().optional().describe("AI prompt used to auto-populate the field"),
      allowedValues: import_zod10.z.array(import_zod10.z.string()).optional().describe("Allowed values for select/multi-select field types"),
      allowedValuesMode: import_zod10.z.nativeEnum(AllowedValuesMode).optional().describe("Whether one or multiple allowed values can be selected"),
      otherValues: import_zod10.z.boolean().optional().describe("Whether values outside allowedValues are permitted"),
      notApplicableValues: import_zod10.z.string().optional().describe("Value(s) treated as not-applicable"),
      privacyMode: import_zod10.z.string().optional().describe("Privacy mode for the field")
    },
    {
      title: "Update Custom Field",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
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
var import_zod10;
var init_fields2 = __esm({
  "src/tools/fields.ts"() {
    "use strict";
    import_zod10 = require("zod");
    init_helpers();
    init_client();
    init_dist();
  }
});

// src/tools/inbound-webhook-utils.ts
function unwrapData(payload) {
  const p = payload;
  return p && typeof p === "object" && "status" in p && "data" in p ? p.data : p;
}
function narrowPathsToChildKey(paths, childKey) {
  if (!childKey) return paths;
  const prefix = `${childKey}.`;
  const narrowed = paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)).filter(Boolean);
  return narrowed.length ? narrowed : paths;
}
function buildHowToUse(inboundUrl, sampleCaptured) {
  const url = inboundUrl ?? "<inboundUrl>";
  const lines = [
    `Send events with: curl -X POST '${url}' -H 'Content-Type: application/json' -d '{"url": "https://example.com/file.mp3", "name": "My recording"}'`,
    `To capture/refresh a sample payload WITHOUT running the automation, POST to '${url}?test=1'.`,
    "Reference payload values in step configs with {{trigger.payload.<path>}} tokens \u2014 see mappableTokens."
  ];
  if (!sampleCaptured) {
    lines.unshift(
      "No sample payload captured yet \u2014 send a test request first (see below) so payload paths become discoverable for mapping, then call get_inbound_webhook again."
    );
  }
  return lines;
}
async function fetchInboundWebhookInfo(api, webhookId, childKey) {
  const res = await api.get(`/v1/webhook/${webhookId}`);
  const payload = unwrapData(res.data);
  const wh = payload?.webhookData ?? payload ?? {};
  const flattened = Array.isArray(wh.flattenedPaths) ? wh.flattenedPaths : [];
  const sample = wh.samplePayload ?? null;
  const sampleCaptured = sample != null && (typeof sample !== "object" || Object.keys(sample).length > 0);
  const inboundUrl = typeof wh.inboundUrl === "string" ? wh.inboundUrl : null;
  return {
    webhookId,
    inboundUrl,
    sampleCaptured,
    samplePayload: sample,
    mappableTokens: narrowPathsToChildKey(flattened, childKey).map(
      (p) => `{{trigger.payload.${p}}}`
    ),
    ...childKey ? { childKey } : {},
    howToUse: buildHowToUse(inboundUrl, sampleCaptured)
  };
}
async function resolveAutomationInboundWebhook(api, automationId) {
  const res = await api.get(`/v1/automations/${automationId}`);
  const automation = unwrapData(res.data);
  const trigger = automation?.trigger ?? {};
  return {
    webhookId: typeof trigger.webhookId === "string" && trigger.webhookId ? trigger.webhookId : void 0,
    childKey: typeof trigger.childKey === "string" && trigger.childKey ? trigger.childKey : void 0
  };
}
function isInboundWebhookTrigger(trigger) {
  const t = trigger;
  return !!t && (t.triggerSlug === "inbound_webhook" || t.type === "webhook" || !!t.webhookId);
}
var init_inbound_webhook_utils = __esm({
  "src/tools/inbound-webhook-utils.ts"() {
    "use strict";
  }
});

// src/tools/automations.ts
var automations_exports = {};
__export(automations_exports, {
  register: () => register10
});
async function withInboundWebhookInfo(api, responseData, automationId) {
  try {
    if (!automationId) return responseData;
    const { webhookId, childKey } = await resolveAutomationInboundWebhook(api, automationId);
    if (!webhookId) return responseData;
    const inboundWebhook = await fetchInboundWebhookInfo(api, webhookId, childKey);
    const base = responseData && typeof responseData === "object" ? responseData : { data: responseData };
    return { ...base, inboundWebhook };
  } catch {
    return responseData;
  }
}
function register10(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "list_automations",
    "List automation rules in the workspace, with paging and filters.",
    {
      page: import_zod11.z.number().int().min(0).optional().describe("0-based page index"),
      pageSize: import_zod11.z.number().int().min(1).max(100).optional().describe("Results per page"),
      sortBy: import_zod11.z.string().optional().describe('Sort expression, e.g. "createdAt:desc"'),
      query: import_zod11.z.string().optional().describe("Free-text search over automation names"),
      folderIds: import_zod11.z.string().optional().describe("Comma-separated folder ids to filter by"),
      isActive: import_zod11.z.boolean().optional().describe("Filter by active state"),
      runType: import_zod11.z.enum(["instant", "schedule"]).optional().describe("Filter by run type")
    },
    {
      title: "List Automations",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async (params) => {
      try {
        const result = await api.get("/v1/automations", { params });
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
  registerSpeakTool(
    server,
    "list_automation_names",
    "List automations as lightweight { name, id } pairs \u2014 useful for pickers without fetching full configs.",
    {},
    {
      title: "List Automation Names",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async () => {
      try {
        const result = await api.get("/v1/automations/list");
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
  registerSpeakTool(
    server,
    "get_automation",
    "Get detailed information about a specific automation rule, including its trigger and step graph.",
    {
      automationId: import_zod11.z.string().min(1).describe("Unique identifier of the automation")
    },
    {
      title: "Get Automation Details",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
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
  registerSpeakTool(
    server,
    "get_automation_runs",
    "Get the run history (executions) for an automation, with paging and optional status filter.",
    {
      automationId: import_zod11.z.string().min(1).describe("Unique identifier of the automation"),
      page: import_zod11.z.number().int().min(0).optional().describe("0-based page index"),
      pageSize: import_zod11.z.number().int().min(1).max(100).optional().describe("Results per page"),
      status: import_zod11.z.enum(["pending", "running", "completed", "failed", "killed"]).optional().describe("Filter runs by status")
    },
    {
      title: "Get Automation Runs",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ automationId, ...params }) => {
      try {
        const result = await api.get(`/v1/automations/${automationId}/runs`, { params });
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
  registerSpeakTool(
    server,
    "create_automation",
    "Create a new automation rule using the V2 graph model (trigger + ordered steps). Fetch valid step/trigger options with list_automation_triggers / list_automation_actions if unsure. For inbound-webhook automations the response includes inboundWebhook.inboundUrl (where to POST payloads) \u2014 recommended flow: create, send a test payload to the URL with ?test=1, call get_inbound_webhook to see mappable payload tokens, then update_automation to wire tokens/fieldsMap.",
    writeSchema,
    {
      title: "Create Automation",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    async (body) => {
      try {
        const result = await api.post("/v1/automations/", body);
        let data = result.data;
        if (isInboundWebhookTrigger(body.trigger)) {
          const automationId = unwrapData(result.data)?.automationId;
          data = await withInboundWebhookInfo(api, data, automationId);
        }
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  registerSpeakTool(
    server,
    "update_automation",
    "Update an existing automation rule. This replaces the whole automation (name, trigger, and steps), so fetch the current values with get_automation first and pass them all back with your changes.",
    {
      automationId: import_zod11.z.string().min(1).describe("Unique identifier of the automation"),
      ...writeSchema
    },
    {
      title: "Update Automation",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    async ({ automationId, ...body }) => {
      try {
        const result = await api.put(`/v1/automations/${automationId}`, body);
        let data = result.data;
        if (isInboundWebhookTrigger(body.trigger)) {
          data = await withInboundWebhookInfo(api, data, automationId);
        }
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  registerSpeakTool(
    server,
    "toggle_automation_status",
    "Toggle an automation rule between active and inactive. This flips the current state \u2014 call get_automation first if you need to know which way it will flip.",
    {
      automationId: import_zod11.z.string().min(1).describe("Unique identifier of the automation")
    },
    {
      title: "Toggle Automation Status",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    async ({ automationId }) => {
      try {
        const result = await api.put(`/v1/automations/status/${automationId}`);
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
  registerSpeakTool(
    server,
    "bulk_update_automation_status",
    "Activate or deactivate multiple automations at once.",
    {
      automationIds: import_zod11.z.array(import_zod11.z.string().min(1)).min(1).max(100).describe("Automation ids to update"),
      isActive: import_zod11.z.boolean().describe("true to activate, false to deactivate, for all listed automations")
    },
    {
      title: "Bulk Update Automation Status",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    async (body) => {
      try {
        const result = await api.put("/v1/automations/bulk/status", body);
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
  registerSpeakTool(
    server,
    "bulk_assign_automation_folders",
    "Set the folder scope for multiple automations at once. Pass an empty folderIds array to remove the folder restriction (run on all folders).",
    {
      automationIds: import_zod11.z.array(import_zod11.z.string().min(1)).min(1).max(100).describe("Automation ids to update"),
      folderIds: import_zod11.z.array(import_zod11.z.string().min(1)).max(50).describe("Folder ids to scope the automations to. Empty array = all folders.")
    },
    {
      title: "Bulk Assign Automation Folders",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
    },
    async (body) => {
      try {
        const result = await api.put("/v1/automations/bulk/folders", body);
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
  registerSpeakTool(
    server,
    "run_automations",
    "Manually run one or more automations against one or more media items now (outside the normal trigger).",
    {
      mediaIds: import_zod11.z.array(import_zod11.z.string().min(1)).min(1).describe("Media ids to run the automations against"),
      automationIds: import_zod11.z.array(import_zod11.z.string().min(1)).min(1).describe("Automation ids to run")
    },
    {
      title: "Run Automations",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    async (body) => {
      try {
        const result = await api.post("/v1/automations/run", body);
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
  registerSpeakTool(
    server,
    "delete_automation",
    "Permanently delete an automation rule.",
    {
      automationId: import_zod11.z.string().min(1).describe("Unique identifier of the automation to delete")
    },
    {
      title: "Delete Automation",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ automationId }) => {
      try {
        const result = await api.delete(`/v1/automations/${automationId}`);
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
  registerSpeakTool(
    server,
    "list_automation_apps",
    "List the apps available in the automation catalog (e.g. Speak native + connected integrations). Use to discover what triggers/actions exist before building an automation.",
    {},
    {
      title: "List Automation Apps",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async () => {
      try {
        const result = await api.get("/v1/automations/catalog/apps");
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
  registerSpeakTool(
    server,
    "list_automation_triggers",
    "List the trigger types available in the automation catalog. Optionally filter by app.",
    {
      app: import_zod11.z.string().min(1).max(100).optional().describe("Filter triggers to a specific app slug")
    },
    {
      title: "List Automation Triggers",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async (params) => {
      try {
        const result = await api.get("/v1/automations/catalog/triggers", { params });
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
  registerSpeakTool(
    server,
    "list_automation_actions",
    "List the action/step types available in the automation catalog. Optionally filter by app.",
    {
      app: import_zod11.z.string().min(1).max(100).optional().describe("Filter actions to a specific app slug")
    },
    {
      title: "List Automation Actions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async (params) => {
      try {
        const result = await api.get("/v1/automations/catalog/actions", { params });
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
var import_zod11, TOKEN_SYNTAX_NOTE, STEPS_DESCRIPTION, TRIGGER_DESCRIPTION, OR_TRIGGERS_DESCRIPTION, writeSchema;
var init_automations = __esm({
  "src/tools/automations.ts"() {
    "use strict";
    import_zod11 = require("zod");
    init_helpers();
    init_client();
    init_inbound_webhook_utils();
    TOKEN_SYNTAX_NOTE = "Token syntax (usable in fields marked 'tokens allowed'): {{trigger.payload.<path>}} reads the inbound webhook payload (dot paths and [n] array indices; paths are relative to trigger.childKey when set \u2014 discover valid paths with get_inbound_webhook after sending a test payload); {{step.<index>.<path>}} or {{step.<stepId>.<path>}} reads a previous step's output (speak-upload -> mediaId, magic-prompt -> answer, outbound-webhook -> status/response).";
    STEPS_DESCRIPTION = 'Ordered array of graph steps (1-20). Each step is an object: { stepId: string (unique within the array), stepType: one of "speak-upload" | "magic-prompt" | "translation" | "filter" | "condition" | "notify" | "outbound-webhook" | "composio-action", dependsOn?: string[] (stepIds this step runs after), branch?: "true"|"false" (which outcome of an upstream condition step this step belongs to) } plus ONE config key matching stepType:\n- speak-upload -> speakUpload: { sourceMode: "url"|"file", sourceUrl (required when sourceMode="url"; tokens allowed \u2014 if the token resolves to an object, the first http(s) URL inside it is used), folderId (required, unless folderRouting.mode="dynamic" where it becomes the optional fallback), name? (tokens allowed, mixable with static text), language? (language code or token), fieldsMap?: { <customFieldId>: "<value>" } (writes payload values into Speak custom fields on the uploaded media; values are usually {{trigger.payload.<path>}} tokens \u2014 get field ids from list_fields), folderRouting?: { mode: "static"|"dynamic", sourceKey (payload key holding the destination folder name, required when dynamic), onNoMatch: "create"|"default" (create a folder named after the value, or fall back to folderId) } }\n- magic-prompt -> magicPrompt: { prompt (required unless fieldIds given, max 20000), title?, assistantType? ("general"|"researcher"|"marketer"|"sales"|"recruiter"|"custom", default "general"), assistantTemplateId? (required if assistantType="custom"), fieldIds?: string[] (max 10 \u2014 extract answers into these custom fields) }\n- translation -> translation: { targetLanguage: region-qualified locale code, e.g. "es-ES", "fr-FR" (bare codes like "es" are rejected) }\n- filter -> filter: { logic: "AND"|"OR" (default "AND"), rules: [{ field, op, value? }] (1-20) } \u2014 the run continues only when the rules match, otherwise it stops silently\n- condition -> condition: same { logic, rules } shape as filter, but instead of stopping it routes: downstream steps marked branch:"true"/"false" run according to the outcome\n- notify -> notify: { channel: "in_app"|"email"|"slack", target?, message (required, tokens allowed) }\n- outbound-webhook -> outboundWebhook: { url (required, tokens allowed), method? ("GET"|"POST"|"PUT"|"PATCH"|"DELETE", default "POST"), headers?: { <name>: <value> }, bodyTemplate?: string | object (tokens allowed) }\n- composio-action -> composio: { app, action, connectedAccountId?, argsTemplate? } (Composio is currently behind a server flag and may be unavailable)\nFilter/condition rule fields depend on what flows into the step: MEDIA -> name|duration|sourceLanguage|tags|transcript|speakers or a custom field id; INSIGHT -> answer; inbound-webhook DATA -> any payload path (e.g. "contact.status"). Ops by field type \u2014 text: eq|neq|contains|ncontains|startsWith|exists; number: eq|neq|gt|lt|exists; array: contains|ncontains|exists ("exists" takes no value; gt/lt values are numbers).\n' + TOKEN_SYNTAX_NOTE;
    TRIGGER_DESCRIPTION = `Trigger object (the automation's root). Always include triggerSlug. Supported shapes:
- Media analyzed in folder(s): { type: "folders", triggerSlug: "media_analyzed", folderIds: string[] (min 1) }
- Inbound webhook (receive external payloads): { type: "folders", triggerSlug: "inbound_webhook", webhookId? (from provision_inbound_webhook; omit to auto-provision a new one on create), childKey? (dot-path narrowing which part of the payload feeds the automation, e.g. "data") }. The create/update response includes inboundWebhook.inboundUrl \u2014 the public URL to POST payloads to.
- Custom field updated: { type: "folders", triggerSlug: "field_updated", values: string[] (watched custom field ids, min 1), fieldValueMatches?: [{ fieldId, values: string[] }] (fire only when the field changes TO one of these values; empty values = any change), fieldMatchLogic?: "AND"|"OR" (how multiple fieldValueMatches combine, default "OR") }
- Composio app event: { type: "composio", provider: "composio", app, triggerSlug, connectedAccountId } (requires a connected account; may be behind a server flag)
Notes: "tags"/"keywords" trigger types are rejected for graph automations. The server stores inbound-webhook triggers with type "webhook" internally \u2014 send type "folders" plus the slug as shown above.`;
    OR_TRIGGERS_DESCRIPTION = 'Optional additional "Or" triggers (max 10): the automation runs when ANY of them fires, sharing the same steps. Each entry mirrors the trigger shapes above but cannot be an inbound webhook and carries no webhookId/childKey. Example: [{ type: "folders", triggerSlug: "field_updated", values: ["<fieldId>"] }]';
    writeSchema = {
      name: import_zod11.z.string().min(1).max(150).describe("Display name for the automation"),
      trigger: import_zod11.z.record(import_zod11.z.unknown()).describe(TRIGGER_DESCRIPTION),
      triggers: import_zod11.z.array(import_zod11.z.record(import_zod11.z.unknown())).max(10).optional().describe(OR_TRIGGERS_DESCRIPTION),
      steps: import_zod11.z.array(import_zod11.z.record(import_zod11.z.unknown())).min(1).max(20).describe(STEPS_DESCRIPTION),
      description: import_zod11.z.string().max(1e3).optional().describe("Optional description"),
      isActive: import_zod11.z.boolean().optional().describe("Whether the automation is active (defaults to true)"),
      runType: import_zod11.z.enum(["instant", "schedule"]).optional().describe('Run type: "instant" (default, runs on trigger) or "schedule" (cron)'),
      schedule: import_zod11.z.record(import_zod11.z.unknown()).optional().describe(
        'Required when runType="schedule": { timePeriod: "today"|"yesterday"|"last7days"|"last14days"|"thisWeek", repeatAt: string }'
      )
    };
  }
});

// src/tools/webhooks.ts
var webhooks_exports = {};
__export(webhooks_exports, {
  register: () => register11
});
function register11(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "create_webhook",
    "Create a new webhook to receive real-time notifications when events occur in Speak AI.",
    {
      callbackUrl: import_zod12.z.string().url().describe("HTTPS endpoint URL to receive webhook payloads"),
      events: import_zod12.z.array(import_zod12.z.string()).optional().describe("Array of event types to subscribe to"),
      description: import_zod12.z.string().optional().describe("Optional description for the webhook")
    },
    {
      title: "Create Webhook",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
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
  registerSpeakTool(
    server,
    "list_webhooks",
    "List all configured webhooks in the workspace.",
    {},
    {
      title: "List Webhooks",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
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
  registerSpeakTool(
    server,
    "update_webhook",
    "Update an existing webhook. This replaces the webhook config, so `callbackUrl` must always be supplied.",
    {
      webhookId: import_zod12.z.string().min(1).describe("Unique identifier of the webhook"),
      callbackUrl: import_zod12.z.string().url().describe("HTTPS endpoint URL to receive webhook payloads"),
      events: import_zod12.z.array(import_zod12.z.string()).optional().describe("Updated array of event types"),
      description: import_zod12.z.string().optional().describe("Optional description for the webhook")
    },
    {
      title: "Update Webhook",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
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
  registerSpeakTool(
    server,
    "provision_inbound_webhook",
    "Provision a standalone inbound webhook and get its public receive URL (inboundUrl) BEFORE creating an automation. Webhook-first flow: provision, send a test payload to the URL (append ?test=1 to only capture a sample without running anything), inspect mappable payload paths with get_inbound_webhook, then pass the webhookId as trigger.webhookId to create_automation.",
    {},
    {
      title: "Provision Inbound Webhook",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    async () => {
      try {
        const result = await api.post("/v1/webhook/inbound/provision", {});
        const payload = unwrapData(result.data) ?? {};
        const inboundUrl = typeof payload.inboundUrl === "string" ? payload.inboundUrl : "<inboundUrl>";
        const data = {
          ...payload,
          nextSteps: [
            `Capture a sample payload (does not run anything): curl -X POST '${inboundUrl}?test=1' -H 'Content-Type: application/json' -d '{"url": "https://example.com/file.mp3", "name": "Test"}'`,
            "Call get_inbound_webhook with this webhookId to see the captured sample and mappable {{trigger.payload.*}} tokens.",
            'Create the automation with create_automation, passing this webhookId in trigger.webhookId (triggerSlug: "inbound_webhook").'
          ]
        };
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  registerSpeakTool(
    server,
    "get_inbound_webhook",
    "Get an inbound webhook's public receive URL, captured sample payload, and the ready-to-paste {{trigger.payload.*}} tokens for mapping payload values into automation steps (speak-upload name/sourceUrl, fieldsMap custom-field values, notify/outbound-webhook templates). Pass either the webhookId or the automationId of an inbound-webhook automation. If no sample has been captured yet, send a test payload to the inboundUrl first (append ?test=1 to capture without running the automation).",
    {
      webhookId: import_zod12.z.string().min(1).optional().describe("Inbound webhook id (from provision_inbound_webhook or an automation's trigger.webhookId)"),
      automationId: import_zod12.z.string().min(1).optional().describe("Automation id \u2014 resolves the bound webhookId and childKey automatically"),
      childKey: import_zod12.z.string().optional().describe("Override the dot-path used to narrow mappable payload paths (defaults to the automation's trigger.childKey)")
    },
    {
      title: "Get Inbound Webhook",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ webhookId, automationId, childKey }) => {
      try {
        let resolvedWebhookId = webhookId;
        let resolvedChildKey = childKey;
        if (!resolvedWebhookId && automationId) {
          const resolved = await resolveAutomationInboundWebhook(api, automationId);
          if (!resolved.webhookId) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: automation ${automationId} has no inbound webhook bound to its trigger (it is not an inbound-webhook automation).`
                }
              ],
              isError: true
            };
          }
          resolvedWebhookId = resolved.webhookId;
          resolvedChildKey = resolvedChildKey ?? resolved.childKey;
        }
        if (!resolvedWebhookId) {
          return {
            content: [{ type: "text", text: "Error: provide either webhookId or automationId." }],
            isError: true
          };
        }
        const info = await fetchInboundWebhookInfo(api, resolvedWebhookId, resolvedChildKey);
        return {
          content: [{ type: "text", text: JSON.stringify(info, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  registerSpeakTool(
    server,
    "get_webhook_attempts",
    "Get the delivery log for an inbound webhook: each received request with its HTTP acknowledgement status (200 = sample captured, 202 = accepted and run started, 401/403 = rejected) and the automation run it started. Use get_automation_runs for the run outcomes themselves.",
    {
      webhookId: import_zod12.z.string().min(1).describe("Unique identifier of the inbound webhook"),
      page: import_zod12.z.number().int().min(0).optional().describe("0-based page index"),
      pageSize: import_zod12.z.number().int().min(1).max(100).optional().describe("Results per page")
    },
    {
      title: "Get Webhook Attempts",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ webhookId, ...params }) => {
      try {
        const result = await api.get(`/v1/webhook/${webhookId}/attempts`, { params });
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
  registerSpeakTool(
    server,
    "delete_webhook",
    "Delete a webhook and stop receiving notifications at its endpoint.",
    {
      webhookId: import_zod12.z.string().min(1).describe("Unique identifier of the webhook to delete")
    },
    {
      title: "Delete Webhook",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true
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
var import_zod12;
var init_webhooks = __esm({
  "src/tools/webhooks.ts"() {
    "use strict";
    import_zod12 = require("zod");
    init_helpers();
    init_client();
    init_inbound_webhook_utils();
  }
});

// src/tools/analytics.ts
var analytics_exports = {};
__export(analytics_exports, {
  register: () => register12
});
function withDefaultSearchDateRange(params) {
  const now = /* @__PURE__ */ new Date();
  return {
    ...params,
    startDate: params.startDate ?? `${now.getUTCFullYear()}-01-01T00:00:00.000Z`,
    endDate: params.endDate ?? now.toISOString()
  };
}
function register12(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "search_media",
    [
      "Deep search across all media transcripts, insights, and metadata.",
      "Returns matching media with sentiment data, tags, and content excerpts.",
      "Use this to find specific topics, keywords, or themes across your entire library.",
      "For filtering by media type, folder, tags, or speakers, use the filterList parameter.",
      "Results are scoped by date range \u2014 defaults to current year if not specified."
    ].join(" "),
    {
      query: import_zod13.z.string().min(1).describe("Search query \u2014 searches across transcripts, insights, and metadata"),
      startDate: import_zod13.z.string().optional().describe("Start date for search range (ISO 8601). Defaults to start of current year."),
      endDate: import_zod13.z.string().optional().describe("End date for search range (ISO 8601). Defaults to now."),
      filterList: import_zod13.z.array(
        import_zod13.z.object({
          fieldName: import_zod13.z.enum(Object.values(FilterFieldName)).describe("Field to filter on"),
          fieldOperator: import_zod13.z.enum(Object.values(FilterOperator)).describe("Filter operator"),
          fieldValue: import_zod13.z.array(import_zod13.z.string()).describe("Values to filter by"),
          fieldCondition: import_zod13.z.enum(Object.values(FilterCondition)).describe("Condition linking multiple filters")
        })
      ).optional().describe("Advanced filters for narrowing search results by tags, speakers, media type, sentiment, folder, etc.")
    },
    {
      title: "Search Media Library",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async (params) => {
      try {
        const result = await api.post("/v1/analytics/search", withDefaultSearchDateRange(params));
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
var import_zod13;
var init_analytics = __esm({
  "src/tools/analytics.ts"() {
    "use strict";
    import_zod13 = require("zod");
    init_helpers();
    init_client();
    init_dist();
  }
});

// src/tools/clips.ts
var clips_exports = {};
__export(clips_exports, {
  register: () => register13
});
function register13(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "create_clip",
    [
      "Create a highlight clip from one or more media files by specifying time ranges.",
      `Clips are processed asynchronously (states: ${Object.values(ClipState).join(", ")}) \u2014 use get_clips to check status.`,
      "Maximum total clip duration is 30 minutes.",
      "Use multiple timeRanges to stitch segments from different media files together."
    ].join(" "),
    {
      title: import_zod14.z.string().min(1).describe("Title for the clip"),
      mediaType: import_zod14.z.enum([MediaType.AUDIO, MediaType.VIDEO]).describe("Output media type"),
      timeRanges: import_zod14.z.array(
        import_zod14.z.object({
          mediaId: import_zod14.z.string().min(1).describe("Source media file ID"),
          startTime: import_zod14.z.number().min(0).describe("Start time in seconds"),
          endTime: import_zod14.z.number().min(0).describe("End time in seconds (must be > startTime)")
        })
      ).min(1).describe("Array of time ranges to include in the clip. Each specifies a source media and start/end times."),
      description: import_zod14.z.string().optional().describe("Description of the clip"),
      tags: import_zod14.z.array(import_zod14.z.string()).optional().describe("Tags for the clip"),
      mergeStrategy: import_zod14.z.enum(["CONCATENATE"]).optional().describe("How to merge multiple segments (default: CONCATENATE)")
    },
    {
      title: "Create Highlight Clip",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.post("/v1/clips", body);
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
  registerSpeakTool(
    server,
    "get_clips",
    "List clips, optionally filtered by folder or media files. If clipId is provided, returns a single clip with its download URL (when processed).",
    {
      clipId: import_zod14.z.string().optional().describe("Get a specific clip by ID"),
      folderId: import_zod14.z.string().optional().describe("Filter clips by folder ID"),
      mediaIds: import_zod14.z.array(import_zod14.z.string()).optional().describe("Filter clips by source media file IDs")
    },
    {
      title: "List Clips",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ clipId, ...params }) => {
      try {
        const url = clipId ? `/v1/clips/${clipId}` : "/v1/clips";
        const result = await api.get(url, { params });
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
  registerSpeakTool(
    server,
    "update_clip",
    "Update a clip's title, description, or tags.",
    {
      clipId: import_zod14.z.string().min(1).describe("ID of the clip to update"),
      title: import_zod14.z.string().optional().describe("New title"),
      description: import_zod14.z.string().optional().describe("New description"),
      tags: import_zod14.z.array(import_zod14.z.string()).optional().describe("New tags")
    },
    {
      title: "Update Clip",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ clipId, ...body }) => {
      try {
        const result = await api.put(`/v1/clips/${clipId}`, body);
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
  registerSpeakTool(
    server,
    "delete_clip",
    "Permanently delete a clip and its associated media file.",
    {
      clipId: import_zod14.z.string().min(1).describe("ID of the clip to delete")
    },
    {
      title: "Delete Clip",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ clipId }) => {
      try {
        const result = await api.delete(`/v1/clips/${clipId}`);
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
var import_zod14;
var init_clips = __esm({
  "src/tools/clips.ts"() {
    "use strict";
    import_zod14 = require("zod");
    init_helpers();
    init_client();
    init_dist();
  }
});

// src/media-utils.ts
function isVideoFile(filePath) {
  return VIDEO_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const isVideo = isVideoFile(filePath);
  if (ext === ".mp4") return isVideo ? "video/mp4" : "audio/mp4";
  if (ext === ".webm") return isVideo ? "video/webm" : "audio/webm";
  return MIME_TYPES[ext] ?? (isVideo ? "video/mp4" : "audio/mpeg");
}
function detectMediaType(filePath) {
  return isVideoFile(filePath) ? "video" : "audio";
}
var path, VIDEO_EXTENSIONS, MIME_TYPES;
var init_media_utils = __esm({
  "src/media-utils.ts"() {
    "use strict";
    path = __toESM(require("path"));
    VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv"];
    MIME_TYPES = {
      ".mp3": "audio/mpeg",
      ".m4a": "audio/mp4",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".flac": "audio/flac",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".mkv": "video/x-matroska",
      ".wmv": "video/x-ms-wmv"
    };
  }
});

// src/tools/workflows.ts
var workflows_exports = {};
__export(workflows_exports, {
  register: () => register14
});
function tokenize(value) {
  if (typeof value !== "string") return value;
  if (value.includes("{{")) return value;
  if (value.startsWith("payload.")) return `{{trigger.payload.${value.slice("payload.".length)}}}`;
  return value;
}
async function loadFolders(api) {
  const res = await api.get("/v1/folder", { params: { pageSize: 500 } });
  const data = unwrapData(res.data) ?? {};
  const list = data.folderList ?? data.folders ?? (Array.isArray(data) ? data : []);
  return list.map((f) => ({
    folderId: String(f.folderId ?? f.id ?? ""),
    name: String(f.name ?? "")
  }));
}
async function loadFields(api) {
  const res = await api.get("/v1/fields");
  const data = unwrapData(res.data) ?? [];
  return data.map((f) => ({
    id: String(f.id ?? ""),
    name: String(f.name ?? "")
  }));
}
async function resolveFolder(api, ref, folders, createdFolders) {
  const byId = folders.find((f) => f.folderId === ref);
  if (byId) return byId.folderId;
  const byName = folders.find((f) => f.name.toLowerCase() === ref.toLowerCase());
  if (byName) return byName.folderId;
  if (ID_PATTERN.test(ref)) {
    throw new Error(`Folder id "${ref}" not found in this workspace (and it looks like an id, so it was not created as a folder name)`);
  }
  const res = await api.post("/v1/folder", { name: ref });
  const folderId = unwrapData(res.data)?.folderId;
  if (!folderId) throw new Error(`Could not create folder "${ref}"`);
  folders.push({ folderId, name: ref });
  createdFolders.push(`${ref} (${folderId})`);
  return folderId;
}
function resolveField(ref, fields) {
  const byId = fields.find((f) => f.id === ref);
  if (byId) return byId.id;
  const byName = fields.find((f) => f.name.toLowerCase() === ref.toLowerCase());
  if (byName) return byName.id;
  const available = fields.map((f) => f.name).slice(0, 25).join(", ");
  throw new Error(`Unknown custom field "${ref}". Available fields: ${available || "(none \u2014 create one with create_field)"}`);
}
function register14(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "build_automation",
    "High-level automation builder: create (or update) a Speak automation from a friendly spec without knowing the wire format. Accepts folder/custom-field NAMES (resolved to ids; missing folders are auto-created), payload.<path> shorthand for webhook tokens, and simple step types (filter, branch, upload, ai_chat, translate, notify, call_webhook). For inbound-webhook automations the result includes the receive URL and mappable payload tokens. Prefer this over create_automation unless you need raw control.",
    buildAutomationSchema,
    {
      title: "Build Automation",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    async (args2) => {
      const { name, trigger, steps, automationId, description, isActive, orTriggers } = args2;
      const createdFolders = [];
      const dataFlowFilterFields = [];
      try {
        let folders = null;
        let fields = null;
        const getFolders = async () => folders ?? (folders = await loadFolders(api));
        const getFields = async () => fields ?? (fields = await loadFields(api));
        const buildTrigger = async (spec, allowWebhook) => {
          const on = String(spec.on ?? "");
          if (on === "media_analyzed") {
            const refs = spec.folders ?? [];
            if (!refs.length) throw new Error("media_analyzed trigger requires `folders` (names or ids)");
            const folderIds = [];
            for (const ref of refs) folderIds.push(await resolveFolder(api, String(ref), await getFolders(), createdFolders));
            return { type: "folders", provider: "speak", app: "speak", triggerSlug: "media_analyzed", folderIds };
          }
          if (on === "inbound_webhook") {
            if (!allowWebhook) throw new Error("inbound_webhook cannot be used as an Or-trigger \u2014 make it the primary trigger");
            const t = { type: "folders", provider: "speak", app: "speak", triggerSlug: "inbound_webhook", folderIds: [] };
            if (spec.webhookId) t.webhookId = spec.webhookId;
            if (spec.childKey) t.childKey = spec.childKey;
            return t;
          }
          if (on === "field_updated") {
            const watch = spec.watchFields ?? [];
            if (!watch.length) throw new Error("field_updated trigger requires `watchFields`: [{ field, values? }]");
            const fieldList = await getFields();
            const values = [];
            const fieldValueMatches = [];
            for (const w of watch) {
              const fieldId = resolveField(String(w.field), fieldList);
              values.push(fieldId);
              if (Array.isArray(w.values) && w.values.length) {
                fieldValueMatches.push({ fieldId, values: w.values.map(String) });
              }
            }
            const t = { type: "folders", provider: "speak", app: "speak", triggerSlug: "field_updated", folderIds: [], values };
            if (fieldValueMatches.length) t.fieldValueMatches = fieldValueMatches;
            if (spec.matchLogic === "AND") t.fieldMatchLogic = "AND";
            return t;
          }
          throw new Error(`Unknown trigger \`on\`: "${on}". Use media_analyzed, inbound_webhook, or field_updated.`);
        };
        const isWebhookAutomation = trigger.on === "inbound_webhook";
        const buildRules = async (rules, flowing2, isFilterStep) => {
          const out = [];
          for (const r of rules) {
            let field = String(r.field ?? "");
            if (flowing2 === "media" && !CANONICAL_FILTER_FIELDS.has(field) && !field.includes(".")) {
              field = resolveField(field, await getFields());
            } else if (isFilterStep && flowing2 === "data" && !CANONICAL_FILTER_FIELDS.has(field)) {
              dataFlowFilterFields.push(field);
            }
            const op = String(r.op ?? "eq");
            const rule = { field, op };
            if (r.value !== void 0) {
              rule.value = (op === "gt" || op === "lt") && Number.isFinite(Number(r.value)) ? Number(r.value) : r.value;
            }
            out.push(rule);
          }
          return out;
        };
        const wireSteps = [];
        let lastBranchStepId = null;
        let flowing = isWebhookAutomation ? "data" : "media";
        for (let i = 0; i < steps.length; i++) {
          const spec = steps[i];
          const stepId = `s${i + 1}`;
          const doType = String(spec.do ?? "");
          const step = { stepId };
          if (spec.runWhen === "true" || spec.runWhen === "false") {
            if (!lastBranchStepId) throw new Error(`Step ${i + 1}: runWhen requires an earlier branch step`);
            step.branch = spec.runWhen;
            step.dependsOn = [lastBranchStepId];
          }
          if (doType === "filter" || doType === "branch") {
            step.stepType = doType === "filter" ? "filter" : "condition";
            const block = {
              logic: spec.logic === "OR" ? "OR" : "AND",
              rules: await buildRules(spec.rules ?? [], flowing, doType === "filter")
            };
            step[doType === "filter" ? "filter" : "condition"] = block;
            if (doType === "branch") lastBranchStepId = stepId;
          } else if (doType === "upload") {
            if (!spec.source) throw new Error(`Step ${i + 1} (upload): \`source\` is required (URL or payload.<path>)`);
            const upload = {
              sourceMode: "url",
              sourceUrl: tokenize(spec.source),
              // Always defer until the uploaded media is PROCESSED so downstream
              // steps (ai_chat, translate) see the transcript — the web canvas
              // hardcodes this too.
              waitForProcessing: true
            };
            if (spec.name) upload.name = tokenize(spec.name);
            if (spec.language) upload.language = tokenize(spec.language);
            if (spec.folderFromPayload) {
              const rawKey = String(spec.folderFromPayload);
              const sourceKey = rawKey.includes("{{") ? rawKey : `{{trigger.payload.${rawKey.startsWith("payload.") ? rawKey.slice("payload.".length) : rawKey}}}`;
              upload.folderRouting = {
                mode: "dynamic",
                sourceKey,
                onNoMatch: spec.onNoFolderMatch === "default" ? "default" : "create"
              };
              if (spec.folder) upload.folderId = await resolveFolder(api, String(spec.folder), await getFolders(), createdFolders);
            } else {
              if (!spec.folder) throw new Error(`Step ${i + 1} (upload): provide \`folder\` (name or id) or \`folderFromPayload\``);
              upload.folderId = await resolveFolder(api, String(spec.folder), await getFolders(), createdFolders);
            }
            if (spec.mapFields && typeof spec.mapFields === "object") {
              const fieldList = await getFields();
              const fieldsMap = {};
              for (const [ref, value] of Object.entries(spec.mapFields)) {
                if (value !== null && typeof value === "object") {
                  throw new Error(`Step ${i + 1} (upload): mapFields["${ref}"] must be a string or number, not an object`);
                }
                fieldsMap[resolveField(ref, fieldList)] = tokenize(String(value));
              }
              if (Object.keys(fieldsMap).length) upload.fieldsMap = fieldsMap;
            }
            step.stepType = "speak-upload";
            step.speakUpload = upload;
            flowing = "media";
          } else if (doType === "ai_chat") {
            const hasSaveToFields = Array.isArray(spec.saveToFields) && spec.saveToFields.length > 0;
            if (!spec.prompt && !hasSaveToFields) {
              throw new Error(`Step ${i + 1} (ai_chat): provide \`prompt\`, \`saveToFields\`, or both`);
            }
            const magicPrompt = { prompt: spec.prompt ?? "", assistantType: "general" };
            if (spec.title) magicPrompt.title = spec.title;
            if (spec.model) magicPrompt.modelId = spec.model;
            if (Array.isArray(spec.saveToFields) && spec.saveToFields.length) {
              if (spec.saveToFields.length > 10) {
                throw new Error(`Step ${i + 1} (ai_chat): saveToFields supports at most 10 fields`);
              }
              const fieldList = await getFields();
              magicPrompt.fieldIds = spec.saveToFields.map((ref) => resolveField(String(ref), fieldList));
            }
            step.stepType = "magic-prompt";
            step.magicPrompt = magicPrompt;
            flowing = "insight";
          } else if (doType === "translate") {
            if (!spec.language) throw new Error(`Step ${i + 1} (translate): \`language\` is required (e.g. "es-ES")`);
            step.stepType = "translation";
            step.translation = { targetLanguage: spec.language };
            flowing = "media";
          } else if (doType === "notify") {
            if (!spec.message) throw new Error(`Step ${i + 1} (notify): \`message\` is required`);
            const channel = spec.channel === void 0 ? "in_app" : String(spec.channel);
            if (!["in_app", "email", "slack"].includes(channel)) {
              throw new Error(`Step ${i + 1} (notify): channel must be "in_app", "email", or "slack" (got "${channel}")`);
            }
            const notify = { channel, message: tokenize(spec.message) };
            if (spec.target) notify.target = String(spec.target);
            step.stepType = "notify";
            step.notify = notify;
            flowing = "data";
          } else if (doType === "call_webhook") {
            if (!spec.url) throw new Error(`Step ${i + 1} (call_webhook): \`url\` is required`);
            const method = spec.method === void 0 ? "POST" : String(spec.method).toUpperCase();
            if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
              throw new Error(`Step ${i + 1} (call_webhook): method must be GET, POST, PUT, PATCH, or DELETE (got "${spec.method}")`);
            }
            const outbound = {
              url: tokenize(spec.url),
              method
            };
            if (spec.headers && typeof spec.headers === "object") outbound.headers = spec.headers;
            if (spec.body !== void 0) {
              outbound.bodyTemplate = typeof spec.body === "string" ? tokenize(spec.body) : spec.body;
            }
            step.stepType = "outbound-webhook";
            step.outboundWebhook = outbound;
            flowing = "data";
          } else {
            throw new Error(
              `Step ${i + 1}: unknown \`do\`: "${doType}". Use filter, branch, upload, ai_chat, translate, notify, or call_webhook.`
            );
          }
          wireSteps.push(step);
        }
        const body = {
          name,
          trigger: await buildTrigger(trigger, true),
          steps: wireSteps
        };
        if (description) body.description = description;
        if (isActive !== void 0) body.isActive = isActive;
        if (orTriggers?.length) {
          const entries = [];
          for (const spec of orTriggers) entries.push(await buildTrigger(spec, false));
          body.triggers = entries;
        }
        const result = automationId ? await api.put(`/v1/automations/${automationId}`, body) : await api.post("/v1/automations/", body);
        const resolvedId = unwrapData(result.data)?.automationId ?? automationId;
        const response = {
          ...typeof result.data === "object" ? result.data : { data: result.data }
        };
        if (createdFolders.length) response.createdFolders = createdFolders;
        if (isWebhookAutomation && resolvedId) {
          try {
            const resolved = await resolveAutomationInboundWebhook(api, resolvedId);
            if (resolved.webhookId) {
              response.inboundWebhook = await fetchInboundWebhookInfo(api, resolved.webhookId, resolved.childKey);
            }
          } catch {
          }
        }
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
        };
      } catch (err) {
        let message = formatAxiosError(err);
        if (dataFlowFilterFields.length && message.includes("fieldIds do not belong")) {
          message += `

Likely cause: this server rejects filter rules on webhook payload fields (${dataFlowFilterFields.join(", ")}) at publish time (known server-side validation gap). Workarounds: move the filter AFTER the upload step and filter on media/custom fields instead, or filter in the sending system before it posts to the webhook.`;
        }
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true
        };
      }
    }
  );
  registerSpeakTool(
    server,
    "upload_and_analyze",
    "Upload and transcribe media from a URL \u2014 a direct/public file URL, OR a shareable social/video link (YouTube, Instagram, TikTok, X, Facebook, Reddit, SoundCloud, and similar), which Speak resolves to the underlying media automatically. Returns media_id immediately; after this returns, poll get_media_status until state is 'processed' (typically 1-3 min for under 60min audio), then call get_media_insights for AI summaries. This async pattern is required for remote MCP transports \u2014 long blocking calls die at proxy idle timeouts. (Vimeo links are not yet supported.)",
    {
      url: import_zod15.z.string().describe("Direct/public media file URL, or a shareable social/video page link (e.g. an Instagram reel, TikTok, YouTube, or X post URL) \u2014 page links are resolved to the underlying media server-side. Pass the URL the user gave you as-is."),
      name: import_zod15.z.string().optional().describe("Display name for the media (defaults to filename from URL)"),
      mediaType: import_zod15.z.enum([MediaType.AUDIO, MediaType.VIDEO]).optional().describe("Media type (default: audio)"),
      sourceLanguage: import_zod15.z.string().optional().describe("BCP-47 language code (e.g., 'en-US', 'he-IL')"),
      folderId: import_zod15.z.string().optional().describe("Folder ID to place the media in"),
      tags: import_zod15.z.string().optional().describe("Comma-separated tags")
    },
    {
      title: "Upload and Analyze Media",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    async (params) => {
      try {
        const uploadBody = {
          name: params.name ?? params.url.split("/").pop()?.split("?")[0] ?? "Upload",
          url: params.url,
          mediaType: params.mediaType ?? "audio"
        };
        if (params.sourceLanguage) uploadBody.sourceLanguage = params.sourceLanguage;
        if (params.folderId) uploadBody.folderId = params.folderId;
        if (params.tags) uploadBody.tags = params.tags;
        const uploadRes = await api.post("/v1/media/upload", uploadBody);
        const mediaId = uploadRes.data?.data?.mediaId;
        const state = uploadRes.data?.data?.state ?? "pending";
        if (!mediaId) {
          return {
            content: [{ type: "text", text: `Error: Upload succeeded but no mediaId returned.
${JSON.stringify(uploadRes.data, null, 2)}` }],
            isError: true
          };
        }
        const result = {
          mediaId,
          state,
          message: "Upload accepted. Processing has started in the background.",
          nextSteps: [
            `1. Poll get_media_status with mediaId="${mediaId}" every 10-30 seconds.`,
            `2. When state is "processed" (typically 1-3 min for audio under 60 min), call get_media_insights for the AI summary and get_transcript for the full transcript.`,
            `3. If state becomes "failed", processing did not complete \u2014 surface the error to the user.`
          ]
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true
        };
      }
    }
  );
  registerSpeakTool(
    server,
    "upload_local_file",
    [
      "Upload a local file to Speak AI for transcription and analysis.",
      "Reads the file from disk, gets a pre-signed S3 URL, uploads the file, then creates the media entry.",
      "Works with any audio or video file on the local filesystem.",
      "After upload, use get_media_status to poll for completion, then get_transcript and get_media_insights."
    ].join(" "),
    {
      filePath: import_zod15.z.string().describe("Absolute path to the local audio or video file"),
      name: import_zod15.z.string().optional().describe("Display name (defaults to filename)"),
      mediaType: import_zod15.z.enum([MediaType.AUDIO, MediaType.VIDEO]).optional().describe("Media type (auto-detected from extension if omitted)"),
      sourceLanguage: import_zod15.z.string().optional().describe("BCP-47 language code (e.g., 'en-US')"),
      folderId: import_zod15.z.string().optional().describe("Folder ID to place the media in"),
      tags: import_zod15.z.string().optional().describe("Comma-separated tags")
    },
    {
      title: "Upload Local File",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    },
    async (params) => {
      try {
        const filePath = params.filePath;
        if (!fs.existsSync(filePath)) {
          return {
            content: [{ type: "text", text: `Error: File not found: ${filePath}` }],
            isError: true
          };
        }
        const filename = path2.basename(filePath);
        const isVideo = isVideoFile(filePath);
        const mediaType = params.mediaType ?? detectMediaType(filePath);
        const mimeType = getMimeType(filePath);
        const signedRes = await api.get("/v1/media/upload/signedurl", {
          params: { isVideo, filename, mimeType }
        });
        const signedData = signedRes.data?.data;
        const uploadUrl = signedData?.preSignedUrl ?? signedData?.signedUrl ?? signedData?.url;
        if (!uploadUrl) {
          return {
            content: [{ type: "text", text: `Error: Could not get signed upload URL.
${JSON.stringify(signedRes.data, null, 2)}` }],
            isError: true
          };
        }
        const fileBuffer = fs.readFileSync(filePath);
        const axios2 = (await import("axios")).default;
        await axios2.put(uploadUrl, fileBuffer, {
          headers: {
            "Content-Type": mimeType
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        });
        const createBody = {
          name: params.name ?? filename,
          url: uploadUrl.split("?")[0],
          // S3 URL without query params; server re-signs via CloudFront
          mediaType
        };
        if (params.sourceLanguage) createBody.sourceLanguage = params.sourceLanguage;
        if (params.folderId) createBody.folderId = params.folderId;
        if (params.tags) createBody.tags = params.tags;
        const createRes = await api.post("/v1/media/upload", createBody);
        const data = createRes.data?.data;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  mediaId: data?.mediaId,
                  state: data?.state,
                  message: `File uploaded successfully. Use get_media_status to poll until state is 'processed', then use get_transcript and get_media_insights.`
                },
                null,
                2
              )
            }
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
var import_zod15, fs, path2, CANONICAL_FILTER_FIELDS, ID_PATTERN, TRIGGER_SPEC_DESCRIPTION, STEP_SPEC_DESCRIPTION, buildAutomationSchema;
var init_workflows = __esm({
  "src/tools/workflows.ts"() {
    "use strict";
    import_zod15 = require("zod");
    init_helpers();
    init_client();
    init_dist();
    fs = __toESM(require("fs"));
    path2 = __toESM(require("path"));
    init_media_utils();
    init_inbound_webhook_utils();
    CANONICAL_FILTER_FIELDS = /* @__PURE__ */ new Set([
      "name",
      "duration",
      "sourceLanguage",
      "tags",
      "transcript",
      "speakers",
      "answer",
      // server-side aliases
      "title",
      "language",
      "speakersCount"
    ]);
    ID_PATTERN = /^[0-9a-f]{12}$/;
    TRIGGER_SPEC_DESCRIPTION = 'What starts the automation. Object with:\n- on (required): "media_analyzed" | "inbound_webhook" | "field_updated"\n- folders: array of folder names or ids (required for media_analyzed; missing folders are created)\n- childKey: dot-path narrowing the webhook payload root, e.g. "data" (inbound_webhook only)\n- webhookId: reuse a webhook from provision_inbound_webhook (inbound_webhook only; omit to auto-provision)\n- watchFields: array of { field: name-or-id, values?: string[] } (required for field_updated \u2014 fires when the field changes; values restricts to specific new values)\n- matchLogic: "AND"|"OR" for combining multiple watchFields value matches (default OR)';
    STEP_SPEC_DESCRIPTION = 'Ordered actions. Each step is an object with a `do` key plus its options. String values may be literals, "payload.<path>" shorthand (converted to {{trigger.payload.<path>}} only when it is the ENTIRE value), or raw {{...}} tokens \u2014 inside longer text, write the full {{trigger.payload.<path>}} form.\n- { do: "filter", rules: [{ field, op, value? }], logic?: "AND"|"OR" } \u2014 continue only if rules match. Fields: media flows use name|duration|sourceLanguage|tags|transcript|speakers or a custom field name; webhook payloads use payload paths like "contact.status". Ops: eq|neq|contains|ncontains|startsWith|gt|lt|exists\n- { do: "branch", rules, logic? } \u2014 like filter but routes instead of stopping; later steps with runWhen: "true"|"false" only run on that outcome. NOTE: branch routing requires the server\'s DAG runner (feature-flagged); when it is off, steps run in order and runWhen markers are ignored \u2014 prefer filter for guaranteed gating\n- { do: "upload", source (URL or payload.<path>, required), name?, language? (e.g. "en-US"), folder? (name or id; created if missing), folderFromPayload? (payload key holding the destination folder name \u2014 dynamic routing), onNoFolderMatch?: "create"|"default", mapFields?: { <field name or id>: <value or payload.<path>> } (writes payload values into custom fields on the uploaded media) }\n- { do: "ai_chat", prompt? (required unless saveToFields given), title?, saveToFields?: [field names or ids] (max 10 \u2014 values are extracted into these custom fields; prompt may be omitted for extraction-only steps), model? (a Speak-supported LLM id, e.g. "gemini-2.5-flash", "claude-sonnet-4-6"; omit for the workspace default) }\n- { do: "translate", language: region-qualified code like "es-ES", "fr-FR" }\n- { do: "notify", message (required, tokens allowed), channel?: "in_app"|"email"|"slack" (default in_app; email currently falls back to an in-app notification), target? (reserved \u2014 not yet used for delivery) }\n- { do: "call_webhook", url (required), method?, headers?, body? (string or object template, tokens allowed) }\nSteps may also set runWhen (after a branch step). Composio app actions (Google Drive, Slack apps, \u2026) are not supported by this builder yet \u2014 use create_automation directly for those.';
    buildAutomationSchema = {
      name: import_zod15.z.string().min(1).max(150).describe("Display name for the automation"),
      trigger: import_zod15.z.record(import_zod15.z.unknown()).describe(TRIGGER_SPEC_DESCRIPTION),
      steps: import_zod15.z.array(import_zod15.z.record(import_zod15.z.unknown())).min(1).max(20).describe(STEP_SPEC_DESCRIPTION),
      automationId: import_zod15.z.string().optional().describe("Update this existing automation instead of creating a new one (full replace)"),
      description: import_zod15.z.string().max(1e3).optional().describe("Optional description"),
      isActive: import_zod15.z.boolean().optional().describe("Whether the automation is active (default true)"),
      orTriggers: import_zod15.z.array(import_zod15.z.record(import_zod15.z.unknown())).max(10).optional().describe(
        'Additional "Or" triggers (same shape as trigger, but inbound_webhook is not allowed here). The automation runs when ANY trigger fires.'
      )
    };
  }
});

// src/tools/users.ts
var users_exports = {};
__export(users_exports, {
  register: () => register15
});
function register15(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "list_users",
    "List the users (members) in the workspace/company, with their ids, names, emails, and permissions. Use the returned _id values when assigning members to user groups.",
    {
      filterName: import_zod16.z.string().optional().describe(
        'Search text. Plain text matches first/last name or email; prefix with "email:" or "name:" to scope, e.g. "email:jane@acme.com".'
      ),
      sortBy: import_zod16.z.string().optional().describe('Sort expression "field:asc" or "field:desc", e.g. "createdAt:desc", "email:asc"'),
      page: import_zod16.z.number().int().min(0).optional().describe("0-based page index (default 0)"),
      pageSize: import_zod16.z.number().int().min(1).max(200).optional().describe("Results per page (default 50)")
    },
    {
      title: "List Users",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async (params) => {
      try {
        const result = await api.get("/v1/admin/users", { params });
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
  registerSpeakTool(
    server,
    "list_user_groups",
    "List all user groups in the company. Each group includes its members (hydrated names/emails) and member ids. Use this to discover group ids and current membership before updating or deleting a group.",
    {},
    {
      title: "List User Groups",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async () => {
      try {
        const result = await api.get("/v1/admin/usergroup");
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
  registerSpeakTool(
    server,
    "create_user_group",
    "Create a new user group and assign members. Member ids come from list_users. Fails with a 409 if a group with the same name already exists in the company.",
    {
      description: import_zod16.z.string().min(1).describe("Group name"),
      users: import_zod16.z.array(import_zod16.z.string().min(1)).default([]).describe("User _id strings to add as members (fetch via list_users)")
    },
    {
      title: "Create User Group",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.post("/v1/admin/usergroup", body);
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
  registerSpeakTool(
    server,
    "update_user_group",
    "Update a user group's name and member list. NOTE: the users array is a FULL REPLACEMENT, not a delta \u2014 any member id you omit is removed from the group. Fetch the current members with list_user_groups first and send the complete list.",
    {
      _id: import_zod16.z.string().min(1).describe("Group _id to update (from list_user_groups)"),
      description: import_zod16.z.string().min(1).describe("New group name"),
      users: import_zod16.z.array(import_zod16.z.string().min(1)).describe("Full replacement list of member _id strings (omitted users are removed)")
    },
    {
      title: "Update User Group",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.put("/v1/admin/usergroup", body);
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
  registerSpeakTool(
    server,
    "delete_user_group",
    "Delete a user group. This removes the group only; it does not delete the users themselves.",
    {
      id: import_zod16.z.string().min(1).describe("Group _id to delete (from list_user_groups)")
    },
    {
      title: "Delete User Group",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ id }) => {
      try {
        const result = await api.delete(`/v1/admin/usergroup/${id}`);
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
var import_zod16;
var init_users = __esm({
  "src/tools/users.ts"() {
    "use strict";
    import_zod16 = require("zod");
    init_helpers();
    init_client();
  }
});

// src/tools/dashboard-widgets.ts
function defaultWidgetConfig(type) {
  switch (type) {
    case "narrative":
      return { focus: "Summarize the key takeaways from this data." };
    case "stat-cards":
      return {
        tiles: [
          { metric: { kind: "builtin", name: "mediaCount" }, label: "Media files" },
          { metric: { kind: "builtin", name: "totalDuration" }, label: "Total duration" },
          { metric: { kind: "builtin", name: "wordCount" }, label: "Total words" },
          { metric: { kind: "builtin", name: "speakerCount" }, label: "Unique speakers" }
        ]
      };
    case "metric-chart":
      return {
        mark: "bar",
        metric: { kind: "builtin", name: "mediaCount" },
        groupBy: { kind: "folder" }
      };
    case "table":
      return {
        rowsAre: "groups",
        groupBy: { kind: "folder" },
        columns: [
          { header: "Recordings", metric: { kind: "builtin", name: "mediaCount" } },
          { header: "Duration", metric: { kind: "builtin", name: "totalDuration" } }
        ],
        sort: { column: "Recordings", dir: "desc" }
      };
    case "comparison":
      return {
        dimension: "folder",
        a: {},
        b: {},
        metrics: [{ kind: "builtin", name: "mediaCount" }]
      };
    case "field-distribution":
      throw new Error(
        'field-distribution requires config.fieldName (a custom field NAME \u2014 not id \u2014 from list_fields), plus measure ("count" | "percent") and chartType ("bar" | "donut").'
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
function buildDashboardWidgets(items, sections = []) {
  for (const item of items) {
    if (item.id !== void 0 && !KEBAB_ID.test(item.id)) {
      throw new Error(
        `widget id "${item.id}" must be kebab-case (lowercase letters, digits, single dashes)`
      );
    }
  }
  const widgets = items.map((item) => makeWidget(item));
  const referenced = new Set(sections.flatMap((s) => s.widgetIds));
  const known = new Set(widgets.map((w) => w.id));
  for (const wid of referenced) {
    if (!known.has(wid)) {
      throw new Error(
        `section widgetIds reference unknown widget id "${wid}". Give each sectioned widget an explicit kebab-case \`id\` and list that id in the section.`
      );
    }
  }
  const sectionOf = /* @__PURE__ */ new Map();
  sections.forEach((s, i) => s.widgetIds.forEach((wid) => sectionOf.set(wid, i)));
  const groups = [widgets.filter((w) => !sectionOf.has(w.id))];
  sections.forEach(
    (_, i) => groups.push(widgets.filter((w) => sectionOf.get(w.id) === i))
  );
  for (const group of groups) {
    layoutGroup(group);
  }
  return widgets;
}
function layoutGroup(group) {
  let y = group.reduce(
    (bottom, w) => isAutoLayout(w) ? bottom : Math.max(bottom, w.layout.y + w.layout.h),
    0
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
function isAutoLayout(widget) {
  return widget.layout.w === 0;
}
function makeWidget(item) {
  const meta = WIDGET_META[item.type];
  const widget = {
    id: item.id ?? (0, import_crypto.randomUUID)(),
    type: item.type,
    title: item.title ?? meta.titleDefault,
    config: item.config ?? defaultWidgetConfig(item.type),
    layout: item.layout ? { x: item.layout.x, y: item.layout.y, w: item.layout.w, h: item.layout.h } : { ...AUTO_LAYOUT }
  };
  if (item.binding && Object.keys(item.binding).length > 0) {
    widget.binding = item.binding;
  }
  return widget;
}
var import_crypto, GRID_COLS, WIDGET_TYPES, DATE_RANGE_PRESETS, WIDGET_META, KEBAB_ID, AUTO_LAYOUT, WIDGET_CATALOG, SPEC_VOCABULARY, DESIGN_RULES, DASHBOARD_EXAMPLES;
var init_dashboard_widgets = __esm({
  "src/tools/dashboard-widgets.ts"() {
    "use strict";
    import_crypto = require("crypto");
    GRID_COLS = 12;
    WIDGET_TYPES = [
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
      "notes"
    ];
    DATE_RANGE_PRESETS = [
      "last7days",
      "last30days",
      "last3months",
      "yearToDate",
      "allTime"
    ];
    WIDGET_META = {
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
      notes: { w: GRID_COLS, h: 2, titleDefault: "Note" }
    };
    KEBAB_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    AUTO_LAYOUT = { x: 0, y: 0, w: 0, h: 0 };
    WIDGET_CATALOG = [
      {
        type: "narrative",
        purpose: "AI-written insight narrative for the scope (full width).",
        config: 'focus: string (1-400 chars) \u2014 what the narrative should analyse, e.g. "Summarize the key objections raised in these calls." The server generates the text.'
      },
      {
        type: "stat-cards",
        purpose: "Headline stat tiles for the scope (full width).",
        config: "tiles: Array<{ metric: Metric, label: string (<=40), caption?: string (<=80), thresholds?: Threshold[] }> (1-6 tiles). See metricGrammar for the Metric shape."
      },
      {
        type: "metric-chart",
        purpose: "The chart workhorse: one metric, optionally grouped and split into series.",
        config: 'mark: "line" | "bar" | "area" | "donut" | "stacked-bar"; metric: Metric; groupBy?: GroupBy; series?: GroupBy (2nd dimension, e.g. one line per person); sort?: "value-desc" | "value-asc" | "label"; limit?: number (1-100); thresholds?: Threshold[]'
      },
      {
        type: "table",
        purpose: "Tabular records or grouped aggregates (full width).",
        config: 'rowsAre: "records" | "groups"; groupBy?: GroupBy (required when rowsAre="groups", forbidden when "records"); columns: Array<{ header: string (<=40, unique), field: string } | { header: string, metric: Metric }> (1-12; a column is EITHER a raw field OR a metric, never both; thresholds? allowed on both forms); sort?: { column: <one of the headers>, dir: "asc" | "desc" }; limit?: number (1-500); searchable?: boolean; rowClick?: "openMedia" | "none"'
      },
      {
        type: "comparison",
        purpose: "Side-by-side A/B comparison of the same metrics across two scopes.",
        config: 'dimension: "folder" | "time" | "fieldValue"; a: Binding; b: Binding (the two sides \u2014 see binding; {} inherits the dashboard scope); metrics: Metric[] (1-6)'
      },
      {
        type: "field-distribution",
        purpose: "Value-frequency breakdown for one custom field.",
        config: 'fieldName: string \u2014 the custom field NAME (not id) from list_fields; measure: "count" | "percent"; chartType: "bar" | "donut". All three keys are required.'
      },
      {
        type: "sentiment-trend",
        purpose: "Sentiment over time.",
        config: 'granularity: "day" | "week" | "month" (required)'
      },
      {
        type: "themes",
        purpose: "Dominant theme clusters.",
        config: "limit: number (1-50, required)"
      },
      {
        type: "people",
        purpose: "Speaker/people breakdown ranked by metrics.",
        config: "metrics: Metric[] (1-6, required); limit: number (1-100, required)"
      },
      {
        type: "team-activity",
        purpose: `Activity by team member. ONLY valid when the effective source is {type:"team"} (dashboard source or the widget's binding.source).`,
        config: 'metrics: Array<"uploads" | "minutes" | "meetings" | "chatUsage" | "lastActive"> (1-5, required)'
      },
      {
        type: "notes",
        purpose: "Free-text note/context block (full width).",
        config: "content: string (1-4000 chars, required)"
      }
    ];
    SPEC_VOCABULARY = {
      metricGrammar: {
        builtin: '{ kind: "builtin", name: "mediaCount" | "totalDuration" | "avgSentiment" | "speakerCount" | "wordCount", filter?: Filter }',
        field: '{ kind: "field", fieldName: string (custom field NAME from list_fields), agg: "sum" | "avg" | "min" | "max" | "median" | "count" | "countDistinct", filter?: Filter } \u2014 sum/avg/median/min/max require a number or currency field',
        expr: '{ kind: "expr", expr: <one of the four ops>, filter?: Filter }. Ops (operands are builtin/field metrics, never nested exprs): { op: "ratio", numerator: Metric, denominator: Metric } | { op: "diff", a: Metric, b: Metric } | { op: "delta", metric: Metric, over: "first-to-last" | "prev-period" } | { op: "rank", metric: Metric, direction: "desc" | "asc" }'
      },
      groupBy: '{ kind: "field", fieldName } (non-date fields) | { kind: "time", fieldName, granularity: "record" | "day" | "week" | "month" | "quarter" } (date/datetime fields only) | { kind: "folder" } | { kind: "speaker" }',
      binding: "Per-widget scope override, set as `binding` on any widget (omit a key to inherit the dashboard's value): { source?: Source, dateRange?: { preset }, filter?: Filter }",
      filter: 'Predicate tree: { field, op: "eq" | "neq" | "in" | "gt" | "gte" | "lt" | "lte" | "exists" | "notExists", value? } (op "in" takes an array value; "exists"/"notExists" take none) \u2014 or { and: Filter[] } / { or: Filter[] } (1-10 branches, max depth 5)',
      thresholds: 'Color bands for stat tiles, chart marks, and table columns (max 8): { when: { op: "gte" | "gt" | "lt" | "lte", value: number } | { op: "between", value: [low, high] }, status: "good" | "warn" | "critical" | "neutral", label?: string (<=40) }',
      source: 'Dashboard data source: { type: "folders", folderIds: string[] (1-50) } | { type: "team" } | { type: "workspace" }',
      dateRangePresets: DATE_RANGE_PRESETS,
      sections: "Optional named groups of widgets rendered as tabs/sections (max 12): { id: kebab-case string, title: string (<=24), icon: kebab-case lucide icon name, widgetIds: string[] (<=24) }. Widget ids in sections must match explicit `id`s you set on the widgets; a widget may appear in at most one section; widgets in no section form the implicit Overview group."
    };
    DESIGN_RULES = [
      "Lead with a narrative widget: on a new dashboard, make it the first widget of the first section \u2014 it is the headline insight.",
      'Sections group widgets by the QUESTION they answer (e.g. "How is pipeline trending?"), not by widget type.',
      "Layout must never overlap within a section; side-by-side is x:0,w:6 and x:6,w:6, and y restarts at 0 in each section. Omit `layout` and the auto-layout guarantees this \u2014 only pass explicit layout when you need a non-default arrangement.",
      "Don't pad \u2014 every widget earns its place. Aim for 4-16 widgets on a full build.",
      "If something can't be computed by the widget catalog, put it in a narrative widget's focus instead of faking it with the wrong widget."
    ];
    DASHBOARD_EXAMPLES = [
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
                groupBy: { kind: "time", fieldName: "createdAt", granularity: "week" }
              }
            },
            {
              type: "field-distribution",
              title: "Deals by stage",
              config: { fieldName: "Stage", measure: "count", chartType: "bar" }
            },
            { type: "themes", config: { limit: 10 } },
            { type: "sentiment-trend", config: { granularity: "week" } }
          ]
        }
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
                        denominator: { kind: "builtin", name: "mediaCount" }
                      }
                    },
                    label: "Revenue per call",
                    thresholds: [{ when: { op: "gte", value: 5e3 }, status: "good" }]
                  }
                ]
              }
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
                  { header: "Pipeline", metric: { kind: "field", fieldName: "Deal Size", agg: "sum" } }
                ],
                sort: { column: "Pipeline", dir: "desc" }
              }
            },
            {
              id: "emea-vs-na",
              type: "comparison",
              title: "EMEA vs NA",
              config: {
                dimension: "folder",
                a: { source: { type: "folders", folderIds: ["<emeaFolderId>"] } },
                b: { source: { type: "folders", folderIds: ["<naFolderId>"] } },
                metrics: [{ kind: "builtin", name: "mediaCount" }]
              }
            }
          ],
          sections: [
            { id: "revenue", title: "Revenue", icon: "dollar-sign", widgetIds: ["pipeline-stats", "deals-table"] },
            { id: "regions", title: "Regions", icon: "globe", widgetIds: ["emea-vs-na"] }
          ]
        }
      }
    ];
  }
});

// src/tools/dashboards.ts
var dashboards_exports = {};
__export(dashboards_exports, {
  register: () => register16
});
function buildSource(source) {
  if (source.type === "folders") {
    if (!source.folderIds?.length) {
      throw new Error('source.type "folders" requires source.folderIds (1-50 folder ids)');
    }
    return { type: "folders", folderIds: source.folderIds };
  }
  return { type: source.type };
}
function buildSpec(input) {
  const sections = input.sections ?? [];
  const spec = {
    title: input.title,
    source: buildSource(input.source ?? { type: "workspace" }),
    dateRange: input.dateRange ?? { preset: "last30days" },
    sections,
    widgets: buildDashboardWidgets(input.widgets ?? [], sections)
  };
  if (input.description !== void 0) spec.description = input.description;
  return spec;
}
function pickMetadata(body) {
  const out = {};
  if (body.icon !== void 0) out.icon = body.icon;
  if (body.assignTo !== void 0) out.assignTo = body.assignTo;
  if (body.filters !== void 0) out.filters = body.filters;
  if (body.isDefault !== void 0) out.isDefault = body.isDefault;
  return out;
}
function register16(server, client) {
  const api = client ?? speakClient;
  registerSpeakTool(
    server,
    "list_dashboards",
    "List all analytics dashboards the caller can access, including share state and each dashboard's current `revision` (needed for update_dashboard).",
    {},
    {
      title: "List Dashboards",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async () => {
      try {
        const result = await api.get("/v1/dashboards");
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
  registerSpeakTool(
    server,
    "get_dashboard",
    "Get a single dashboard's full spec: title, description, source, date range, sections, widgets, and the current `revision` (pass that revision back to update_dashboard).",
    {
      dashboardId: import_zod17.z.string().min(1).describe("Dashboard business id (the dashboardId field from list_dashboards, not the Mongo _id)")
    },
    {
      title: "Get Dashboard",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ dashboardId }) => {
      try {
        const result = await api.get(`/v1/dashboards/${dashboardId}`);
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
  registerSpeakTool(
    server,
    "list_dashboard_widgets",
    "Discovery + how-to helper for building and customizing dashboards. Returns every widget type with what it shows and the exact strict `config` shape it accepts, the shared vocabulary (metric grammar, groupBy, per-widget binding, filters, thresholds, sources, date-range presets, sections), design rules for composing a dashboard that reads well, two complete worked example payloads, and tips for managing dashboards. Call this before create_dashboard / update_dashboard.",
    {},
    {
      title: "List Dashboard Widgets",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async () => {
      const data = {
        widgets: WIDGET_CATALOG,
        vocabulary: SPEC_VOCABULARY,
        designRules: DESIGN_RULES,
        notes: [
          "Pass widgets to create_dashboard as a simple ordered list; ids and grid layout are computed for you.",
          "Widget configs are STRICT: unknown keys are rejected. Metrics reference custom fields by NAME (list_fields), not id.",
          "field-distribution requires config.fieldName; most other widgets render on valid defaults with no config.",
          `team-activity is only valid when the dashboard source (or the widget's binding.source) is {type:"team"}.`,
          "To group widgets into sections, give each sectioned widget an explicit kebab-case `id` and reference those ids in sections[].widgetIds."
        ],
        managing: [
          "To edit an existing dashboard, call get_dashboard, modify the widgets/sections, and send the FULL spec to update_dashboard including the `revision` you loaded (widgets are replaced, not merged).",
          "To start from a working layout, duplicate_dashboard a good one, then update_dashboard to tweak it.",
          "share_dashboard returns a public token; chain it after the dashboard is built."
        ],
        examples: DASHBOARD_EXAMPLES
      };
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
  registerSpeakTool(
    server,
    "create_dashboard",
    `Create an analytics dashboard. Only \`title\` is required \u2014 source defaults to the whole workspace and dateRange to last30days. Add widgets by listing their types (the MCP assigns ids and lays them out automatically), scope with source ({type:"folders",folderIds} | {type:"team"} | {type:"workspace"}) and dateRange ({preset}), and optionally group widgets into sections. Design guidance: lead with a narrative widget as the first widget; group sections by the QUESTION they answer, not by widget type; don't pad \u2014 every widget earns its place (aim for 4-16 widgets on a full build); if something can't be expressed by the widget catalog, put it in a narrative widget's focus instead of faking it. Call list_dashboard_widgets first for the widget catalog, config vocabulary, design rules, and full examples.`,
    {
      title: import_zod17.z.string().min(1).max(60).describe("Dashboard name, max 60 chars (the only required field)"),
      ...specFields,
      ...metadataFields
    },
    {
      title: "Create Dashboard",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    async ({ title, description, source, dateRange, sections, widgets, ...metadata }) => {
      try {
        const body = {
          spec: buildSpec({
            title,
            description,
            source,
            dateRange,
            sections,
            widgets
          }),
          ...pickMetadata(metadata)
        };
        const result = await api.post("/v1/dashboards", body);
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
  registerSpeakTool(
    server,
    "update_dashboard",
    "Update a dashboard. Two modes. (1) Metadata-only: pass just icon/assignTo/filters/isDefault \u2014 no spec fields, no revision needed. (2) Spec update: pass the FULL spec \u2014 title, source, dateRange, sections, widgets \u2014 plus `revision`. Widgets and sections are REPLACED, not merged, so call get_dashboard first and resend everything you want to keep. `revision` is the optimistic-concurrency token from get_dashboard/list_dashboards: the server accepts the write only if it still matches, then increments it. A 409 conflict means another writer saved first \u2014 re-fetch with get_dashboard, rebuild your changes on the fresh spec, and retry with the new revision.",
    {
      dashboardId: import_zod17.z.string().min(1).describe("Dashboard business id"),
      title: import_zod17.z.string().min(1).max(60).optional().describe("Dashboard name \u2014 required (with revision) when updating the spec"),
      revision: import_zod17.z.number().int().nonnegative().optional().describe(
        "The revision loaded from get_dashboard. Required for spec updates; mismatch returns a 409 conflict."
      ),
      ...specFields,
      ...metadataFields
    },
    {
      title: "Update Dashboard",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    },
    async ({ dashboardId, title, revision, description, source, dateRange, sections, widgets, ...metadata }) => {
      try {
        const specTouched = title !== void 0 || description !== void 0 || source !== void 0 || dateRange !== void 0 || sections !== void 0 || widgets !== void 0;
        const body = pickMetadata(metadata);
        if (specTouched) {
          if (title === void 0 || revision === void 0) {
            throw new Error(
              "Spec updates replace the whole spec: call get_dashboard first, then pass the FULL spec (title, source, dateRange, sections, widgets) together with the loaded `revision`."
            );
          }
          body.spec = {
            ...buildSpec({
              title,
              description,
              source,
              dateRange,
              sections,
              widgets
            }),
            revision
          };
        }
        if (Object.keys(body).length === 0) {
          throw new Error("Nothing to update: pass spec fields (with revision) or metadata fields.");
        }
        const result = await api.put(`/v1/dashboards/${dashboardId}`, body);
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
  registerSpeakTool(
    server,
    "delete_dashboard",
    "Soft-delete a dashboard. This also deactivates its public share link.",
    {
      dashboardId: import_zod17.z.string().min(1).describe("Dashboard business id to delete")
    },
    {
      title: "Delete Dashboard",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    },
    async ({ dashboardId }) => {
      try {
        const result = await api.delete(`/v1/dashboards/${dashboardId}`);
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
  registerSpeakTool(
    server,
    "duplicate_dashboard",
    'Clone an existing dashboard. The copy gets fresh widget ids, a "<name> (copy)" title, cleared sharing, and its revision reset to 0. Ideal for cloning a fully-configured dashboard, then tweaking it via update_dashboard.',
    {
      dashboardId: import_zod17.z.string().min(1).describe("Source dashboard business id to clone")
    },
    {
      title: "Duplicate Dashboard",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    async ({ dashboardId }) => {
      try {
        const result = await api.post(`/v1/dashboards/${dashboardId}/duplicate`, {});
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
  registerSpeakTool(
    server,
    "share_dashboard",
    "Enable public sharing for a dashboard and return its share token + embed id. WARNING: by default the public link resolves with no passphrase, so anyone with the token can view the dashboard data until an owner sets one.",
    {
      dashboardId: import_zod17.z.string().min(1).describe("Dashboard business id to share")
    },
    {
      title: "Share Dashboard",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    async ({ dashboardId }) => {
      try {
        const result = await api.put(`/v1/dashboards/${dashboardId}/share`, {});
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
  registerSpeakTool(
    server,
    "get_dashboard_speakers_insight",
    "Compute a speakers breakdown for a given folder scope, date range, and field filters. Standalone analytics \u2014 does not require a dashboard to exist.",
    SPEAKERS_FILTER_SCHEMA,
    {
      title: "Get Dashboard Speakers Insight",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    async (body) => {
      try {
        const result = await api.post("/v1/dashboards/insights/speakers", body);
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
var import_zod17, FILTER_LIST_DESCRIPTION, widgetInputSchema, sectionInputSchema, sourceInputSchema, dateRangeInputSchema, metadataFields, specFields, SPEAKERS_FILTER_SCHEMA;
var init_dashboards = __esm({
  "src/tools/dashboards.ts"() {
    "use strict";
    import_zod17 = require("zod");
    init_helpers();
    init_client();
    init_dashboard_widgets();
    FILTER_LIST_DESCRIPTION = "Field filters. filters.filterList is an array of { fieldName, fieldOperator?, fieldValue?: string[], fieldCondition? }. Other keys pass through but only filterList is enforced.";
    widgetInputSchema = import_zod17.z.object({
      type: import_zod17.z.enum(WIDGET_TYPES).describe(
        "Widget type: narrative | stat-cards | metric-chart | table | comparison | field-distribution | sentiment-trend | themes | people | team-activity | notes"
      ),
      id: import_zod17.z.string().max(64).optional().describe(
        "Optional explicit widget id (kebab-case). Required if you reference the widget from sections[].widgetIds; auto-generated otherwise."
      ),
      title: import_zod17.z.string().min(1).max(40).optional().describe("Widget title, max 40 chars (defaults to a per-type label)"),
      config: import_zod17.z.record(import_zod17.z.unknown()).optional().describe(
        "Per-type config (STRICT \u2014 unknown keys are rejected). metric-chart: mark (line|bar|area|donut|stacked-bar) + metric + groupBy/series + thresholds; table: rowsAre + columns [{header, field|metric}]; stat-cards: tiles; field-distribution: fieldName+measure+chartType (required); narrative: focus; notes: content. Call list_dashboard_widgets for the full per-type vocabulary + metric/filter grammar. Omit for a sensible valid default (except field-distribution, which needs fieldName)."
      ),
      binding: import_zod17.z.record(import_zod17.z.unknown()).optional().describe(
        "Per-widget scope override: { source?, dateRange?: {preset}, filter? }. Omit any key to inherit the dashboard's value."
      ),
      layout: import_zod17.z.object({
        x: import_zod17.z.number().int().min(0).max(11),
        y: import_zod17.z.number().int().min(0).max(200),
        w: import_zod17.z.number().int().min(1).max(12),
        h: import_zod17.z.number().int().min(1).max(40)
      }).optional().describe(
        "Explicit 12-column grid position. Omit to auto-place two-per-row like the UI. Widgets must not overlap within a section group."
      )
    });
    sectionInputSchema = import_zod17.z.object({
      id: import_zod17.z.string().min(1).max(64).describe("Section id (kebab-case)"),
      title: import_zod17.z.string().min(1).max(24).describe("Section title, max 24 chars"),
      icon: import_zod17.z.string().min(1).max(40).describe('Kebab-case lucide icon name, e.g. "dollar-sign"'),
      widgetIds: import_zod17.z.array(import_zod17.z.string().max(64)).max(24).describe("Widget ids in this section \u2014 must match explicit `id`s set on widgets[]")
    });
    sourceInputSchema = import_zod17.z.object({
      type: import_zod17.z.enum(["folders", "team", "workspace"]).describe(
        "folders = specific folder ids; team = the caller's team scope; workspace = everything accessible"
      ),
      folderIds: import_zod17.z.array(import_zod17.z.string().min(1).max(64)).min(1).max(50).optional().describe('Folder ids \u2014 required when type is "folders", forbidden otherwise')
    }).describe(
      'Data source: {type:"folders", folderIds:[...]} | {type:"team"} | {type:"workspace"}'
    );
    dateRangeInputSchema = import_zod17.z.object({
      preset: import_zod17.z.enum(DATE_RANGE_PRESETS).describe("One of: last7days | last30days | last3months | yearToDate | allTime")
    }).describe("Date range \u2014 strict preset only, no free-form start/end dates");
    metadataFields = {
      icon: import_zod17.z.string().max(200).optional().describe("Icon identifier"),
      assignTo: import_zod17.z.array(import_zod17.z.string()).max(100).optional().describe('User ids, or group ids in the "<groupId> (G)" convention, to share view access with'),
      filters: import_zod17.z.record(import_zod17.z.unknown()).optional().describe(FILTER_LIST_DESCRIPTION),
      isDefault: import_zod17.z.boolean().optional().describe("Make this the company default dashboard")
    };
    specFields = {
      description: import_zod17.z.string().max(280).optional().describe("Dashboard description, max 280 chars"),
      source: sourceInputSchema.optional(),
      dateRange: dateRangeInputSchema.optional(),
      sections: import_zod17.z.array(sectionInputSchema).max(12).optional().describe(
        "Optional named widget groups (tabs). Each references widgets by their explicit ids; widgets in no section form the implicit Overview group."
      ),
      widgets: import_zod17.z.array(widgetInputSchema).max(24).optional().describe(
        "Widgets to place on the dashboard, in order (max 24). The MCP assigns ids and computes a tidy two-per-row grid layout matching the Speak UI unless you pass explicit id/layout."
      )
    };
    SPEAKERS_FILTER_SCHEMA = {
      folderScope: import_zod17.z.array(import_zod17.z.string().max(100)).max(100).optional().describe("Folder ids to scope to"),
      startDate: import_zod17.z.string().optional().describe("ISO start date"),
      endDate: import_zod17.z.string().optional().describe("ISO end date"),
      filterList: import_zod17.z.array(
        import_zod17.z.object({
          fieldName: import_zod17.z.string().max(100),
          fieldOperator: import_zod17.z.string().max(50).optional(),
          fieldValue: import_zod17.z.array(import_zod17.z.string().max(500)).optional(),
          fieldCondition: import_zod17.z.string().max(50).optional()
        })
      ).max(20).optional().describe("Field filter rules")
    };
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
    init_media3();
    init_text2();
    init_exports();
    init_folders();
    init_recorder3();
    init_embed3();
    init_prompt3();
    init_meeting3();
    init_fields2();
    init_automations();
    init_webhooks();
    init_analytics();
    init_clips();
    init_workflows();
    init_users();
    init_dashboards();
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
      webhooks_exports,
      analytics_exports,
      clips_exports,
      workflows_exports,
      users_exports,
      dashboards_exports
    ];
  }
});

// src/resources.ts
var resources_exports = {};
__export(resources_exports, {
  registerResources: () => registerResources
});
function asJsonContent(uri, data) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}
function reportError(label, err) {
  const detail = formatAxiosError(err);
  throw new Error(`Speak AI resource '${label}' failed: ${detail}`);
}
function registerResources(server, client) {
  const api = client ?? speakClient;
  server.resource(
    "media-library",
    "speakai://media",
    { description: "List of all media files in your Speak AI workspace" },
    async () => {
      try {
        const result = await api.get("/v1/media", {
          params: { page: 0, pageSize: 50, sortBy: "createdAt:desc", filterMedia: 2 }
        });
        return asJsonContent("speakai://media", result.data?.data);
      } catch (err) {
        reportError("media-library", err);
      }
    }
  );
  server.resource(
    "folders",
    "speakai://folders",
    { description: "List of all folders in your Speak AI workspace" },
    async () => {
      try {
        const result = await api.get("/v1/folder", {
          params: { page: 0, pageSize: 100, sortBy: "createdAt:desc" }
        });
        return asJsonContent("speakai://folders", result.data?.data);
      } catch (err) {
        reportError("folders", err);
      }
    }
  );
  server.resource(
    "supported-languages",
    "speakai://languages",
    { description: "List of supported transcription languages" },
    async () => {
      try {
        const result = await api.get("/v1/media/supportedLanguages");
        return asJsonContent("speakai://languages", result.data?.data);
      } catch (err) {
        reportError("supported-languages", err);
      }
    }
  );
  server.resource(
    "transcript",
    new import_mcp.ResourceTemplate("speakai://media/{mediaId}/transcript", { list: void 0 }),
    { description: "Full transcript for a specific media file" },
    async (uri, { mediaId }) => {
      try {
        const result = await api.get(`/v1/media/transcript/${mediaId}`);
        return asJsonContent(uri.href, result.data?.data);
      } catch (err) {
        reportError(`transcript(${mediaId})`, err);
      }
    }
  );
  server.resource(
    "insights",
    new import_mcp.ResourceTemplate("speakai://media/{mediaId}/insights", { list: void 0 }),
    { description: "AI-generated insights for a specific media file" },
    async (uri, { mediaId }) => {
      try {
        const result = await api.get(`/v1/media/insight/${mediaId}`);
        return asJsonContent(uri.href, result.data?.data);
      } catch (err) {
        reportError(`insights(${mediaId})`, err);
      }
    }
  );
}
var import_mcp;
var init_resources = __esm({
  "src/resources.ts"() {
    "use strict";
    import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");
    init_client();
    init_client();
  }
});

// src/prompts.ts
var prompts_exports = {};
__export(prompts_exports, {
  registerPrompts: () => registerPrompts
});
function registerPrompts(server) {
  server.prompt(
    "analyze-meeting",
    "Upload a meeting recording and get a full analysis \u2014 transcript, insights, action items, and key takeaways.",
    {
      url: import_zod18.z.string().describe("URL of the meeting recording \u2014 a direct file link or a shareable social/video link (resolved automatically)"),
      name: import_zod18.z.string().optional().describe("Meeting name (optional)")
    },
    async ({ url, name }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Please analyze this meeting recording:`,
              ``,
              `1. Upload "${name ?? "Meeting"}" from: ${url}`,
              `2. Wait for processing to complete`,
              `3. Get the full transcript and AI insights`,
              `4. Summarize:`,
              `   - Key discussion points`,
              `   - Action items with owners (if identifiable from speakers)`,
              `   - Decisions made`,
              `   - Open questions or follow-ups needed`,
              `   - Overall sentiment`,
              ``,
              `Use upload_and_analyze to handle the upload and processing in one step.`
            ].join("\n")
          }
        }
      ]
    })
  );
  server.prompt(
    "research-across-media",
    "Search for themes, patterns, or topics across multiple recordings or your entire media library.",
    {
      topic: import_zod18.z.string().describe("The topic, theme, or question to research"),
      folder: import_zod18.z.string().optional().describe("Folder ID to scope the research (optional)")
    },
    async ({ topic, folder }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Research this topic across my media library: "${topic}"`,
              ``,
              folder ? `Scope: folder ${folder}` : `Scope: entire workspace`,
              ``,
              `Steps:`,
              `1. Use search_media to find relevant media matching this topic`,
              `2. For the most relevant results, use ask_ai_chat with the matching mediaIds to ask: "${topic}"`,
              `3. Synthesize findings across all results:`,
              `   - Common themes and patterns`,
              `   - Notable quotes or data points`,
              `   - Contradictions or differing perspectives`,
              `   - Trends over time (if date range is available)`,
              ``,
              `Present a research summary with citations (media name + timestamp where possible).`
            ].join("\n")
          }
        }
      ]
    })
  );
  server.prompt(
    "meeting-brief",
    "Prepare a brief from recent meetings \u2014 pull transcripts, extract decisions, and summarize open items.",
    {
      days: import_zod18.z.string().optional().describe("Number of days to look back (default: 7)"),
      folder: import_zod18.z.string().optional().describe("Folder ID to scope to (optional)")
    },
    async ({ days, folder }) => {
      const lookback = parseInt(days ?? "7");
      const fromDate = /* @__PURE__ */ new Date();
      fromDate.setDate(fromDate.getDate() - lookback);
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Prepare a meeting brief from the last ${lookback} days.`,
                ``,
                folder ? `Scope: folder ${folder}` : `Scope: all media`,
                `Date range: ${fromDate.toISOString().split("T")[0]} to today`,
                ``,
                `Steps:`,
                `1. Use list_media to find recent recordings (from: ${fromDate.toISOString().split("T")[0]})`,
                `2. For each meeting, use get_media_insights to get summaries and action items`,
                `3. Compile a brief with:`,
                `   - Summary of each meeting (2-3 sentences)`,
                `   - All action items consolidated (grouped by owner if possible)`,
                `   - Key decisions made across meetings`,
                `   - Open questions or unresolved topics`,
                `   - Upcoming items that were mentioned`,
                ``,
                `Format as a clean, scannable document.`
              ].join("\n")
            }
          }
        ]
      };
    }
  );
}
var import_zod18;
var init_prompts = __esm({
  "src/prompts.ts"() {
    "use strict";
    import_zod18 = require("zod");
  }
});

// src/tool-names.ts
var tool_names_exports = {};
__export(tool_names_exports, {
  SPEAK_MCP_TOOL_NAMES: () => SPEAK_MCP_TOOL_NAMES
});
var SPEAK_MCP_TOOL_NAMES;
var init_tool_names = __esm({
  "src/tool-names.ts"() {
    "use strict";
    SPEAK_MCP_TOOL_NAMES = [
      // analytics
      "get_media_statistics",
      // automations
      "list_automations",
      "list_automation_names",
      "get_automation",
      "get_automation_runs",
      "create_automation",
      "update_automation",
      "toggle_automation_status",
      "bulk_update_automation_status",
      "bulk_assign_automation_folders",
      "run_automations",
      "delete_automation",
      "list_automation_apps",
      "list_automation_triggers",
      "list_automation_actions",
      // clips
      "get_clips",
      "create_clip",
      "update_clip",
      "delete_clip",
      // embed
      "create_embed",
      "update_embed",
      "check_embed",
      "get_embed_iframe_url",
      // exports
      "export_media",
      "export_multiple_media",
      // fields
      "list_fields",
      "create_field",
      "update_field",
      "update_multiple_fields",
      // folders
      "list_folders",
      "create_folder",
      "update_folder",
      "delete_folder",
      "get_folder_info",
      "clone_folder",
      "get_folder_views",
      "get_all_folder_views",
      "create_folder_view",
      "update_folder_view",
      "clone_folder_view",
      // media
      "get_signed_upload_url",
      "upload_media",
      "get_media_status",
      "get_media_insights",
      "get_transcript",
      "list_media",
      "search_media",
      "delete_media",
      "update_media_metadata",
      "toggle_media_favorite",
      "reanalyze_media",
      "get_captions",
      "list_supported_languages",
      "update_transcript_speakers",
      "update_transcription",
      "bulk_update_transcript_speakers",
      "bulk_move_media",
      // meeting
      "list_meeting_events",
      "schedule_meeting_event",
      "remove_assistant_from_meeting",
      "delete_scheduled_assistant",
      "get_live_meeting_transcript",
      // prompt
      "ask_ai_chat",
      "list_prompts",
      "get_favorite_prompts",
      "toggle_prompt_favorite",
      "get_chat_history",
      "get_chat_messages",
      "update_chat_title",
      "delete_chat_message",
      "submit_chat_feedback",
      "retry_ai_chat",
      "export_chat_answer",
      "get_chat_statistics",
      // recorder
      "list_recorders",
      "create_recorder",
      "update_recorder_settings",
      "update_recorder_questions",
      "delete_recorder",
      "generate_recorder_url",
      "get_recorder_info",
      "get_recorder_recordings",
      "check_recorder_status",
      "clone_recorder",
      // text
      "create_text_note",
      "update_text_note",
      "get_text_insight",
      "reanalyze_text",
      // webhooks
      "list_webhooks",
      "create_webhook",
      "update_webhook",
      "provision_inbound_webhook",
      "get_inbound_webhook",
      "get_webhook_attempts",
      "delete_webhook",
      // workflows (high-level wrappers around media + upload + automation tools)
      "build_automation",
      "upload_and_analyze",
      "upload_local_file",
      // users / team management
      "list_users",
      "list_user_groups",
      "create_user_group",
      "update_user_group",
      "delete_user_group",
      // dashboards
      "list_dashboard_widgets",
      "list_dashboards",
      "get_dashboard",
      "create_dashboard",
      "update_dashboard",
      "delete_dashboard",
      "duplicate_dashboard",
      "share_dashboard",
      "get_dashboard_speakers_insight"
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
  ).version("2.0.0");
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
  config.command("test").description("Validate your API key and test connectivity").action(async () => {
    const key = resolveApiKey();
    resolveBaseUrl();
    if (!key) {
      printError('No API key configured. Run "speakai-mcp config set-key" or set SPEAK_API_KEY.');
      process.exit(1);
    }
    try {
      const axios2 = (await import("axios")).default;
      const baseUrl = process.env.SPEAK_BASE_URL ?? "https://api.speakai.co";
      const res = await axios2.post(
        `${baseUrl}/v1/auth/accessToken`,
        {},
        { headers: { "Content-Type": "application/json", "x-speakai-key": key } }
      );
      if (res.data?.data?.accessToken) {
        printSuccess("API key is valid. Connection successful.");
      } else {
        printError("Unexpected response \u2014 key may be invalid.");
        process.exit(1);
      }
    } catch (err) {
      printError(`Authentication failed: ${err.response?.data?.message ?? err.message}`);
      process.exit(1);
    }
  });
  config.command("set-url").description("Set custom API base URL").argument("<url>", "Base URL (e.g. https://api.speakai.co)").action((url) => {
    const cfg = loadConfig();
    cfg.baseUrl = url;
    saveConfig(cfg);
    printSuccess(`Base URL set to ${url}`);
  });
  program.command("init").description("Interactive setup \u2014 configure API key and auto-detect MCP clients").action(async () => {
    const rl = (0, import_readline.createInterface)({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
    console.log("\n  Speak AI MCP Server \u2014 Setup\n");
    const existingKey = resolveApiKey();
    let key = existingKey;
    if (existingKey) {
      console.log(`  API key: ${existingKey.slice(0, 8)}... (already configured)`);
      const change = await ask("  Change it? (y/N) ");
      if (change.toLowerCase() === "y") key = "";
    }
    if (!key) {
      key = await ask("  Enter your Speak AI API key: ");
      if (!key) {
        printError("No key provided.");
        rl.close();
        process.exit(1);
      }
    }
    process.stdout.write("  Validating...");
    try {
      const axios2 = (await import("axios")).default;
      const baseUrl = process.env.SPEAK_BASE_URL ?? "https://api.speakai.co";
      const res = await axios2.post(
        `${baseUrl}/v1/auth/accessToken`,
        {},
        { headers: { "Content-Type": "application/json", "x-speakai-key": key } }
      );
      if (!res.data?.data?.accessToken) throw new Error("Invalid response");
      console.log(" valid!\n");
    } catch {
      console.log(" failed!");
      printError("API key is invalid. Get your key at https://app.speakai.co/developers/apikeys");
      rl.close();
      process.exit(1);
    }
    const cfg = loadConfig();
    cfg.apiKey = key;
    saveConfig(cfg);
    printSuccess(`API key saved to ${getConfigPath()}`);
    const os2 = await import("os");
    const fs3 = await import("fs");
    const pathMod = await import("path");
    const home = os2.homedir();
    const clients = [
      {
        name: "Claude Desktop",
        configPath: process.platform === "darwin" ? pathMod.join(home, "Library/Application Support/Claude/claude_desktop_config.json") : pathMod.join(home, "AppData/Roaming/Claude/claude_desktop_config.json"),
        exists: false
      },
      {
        name: "Cursor",
        configPath: pathMod.join(home, ".cursor/mcp.json"),
        exists: false
      },
      {
        name: "Windsurf",
        configPath: pathMod.join(home, ".windsurf/mcp.json"),
        exists: false
      },
      {
        name: "VS Code",
        configPath: pathMod.join(home, ".vscode/mcp.json"),
        exists: false
      }
    ];
    for (const c of clients) {
      const dir = pathMod.dirname(c.configPath);
      c.exists = fs3.existsSync(dir);
    }
    const detected = clients.filter((c) => c.exists);
    if (detected.length > 0) {
      console.log("\n  Detected MCP clients:");
      for (const c of detected) {
        console.log(`    - ${c.name}`);
      }
      const configure = await ask("\n  Auto-configure MCP server in these clients? (Y/n) ");
      if (configure.toLowerCase() !== "n") {
        const mcpEntry = {
          command: "npx",
          args: ["-y", "@speakai/mcp-server"],
          env: { SPEAK_API_KEY: key }
        };
        for (const c of detected) {
          try {
            let config2 = {};
            if (fs3.existsSync(c.configPath)) {
              config2 = JSON.parse(fs3.readFileSync(c.configPath, "utf-8"));
            }
            const servers = config2.mcpServers ?? {};
            servers["speak-ai"] = mcpEntry;
            config2.mcpServers = servers;
            const dir = pathMod.dirname(c.configPath);
            if (!fs3.existsSync(dir)) fs3.mkdirSync(dir, { recursive: true });
            fs3.writeFileSync(c.configPath, JSON.stringify(config2, null, 2) + "\n");
            printSuccess(`Configured ${c.name}: ${c.configPath}`);
          } catch (err) {
            printError(`Failed to configure ${c.name}: ${err.message}`);
          }
        }
      }
    }
    console.log("\n  For Claude Code, run:");
    console.log(`    export SPEAK_API_KEY="your-api-key"`);
    console.log("    claude mcp add speak-ai -- npx -y @speakai/mcp-server\n");
    rl.close();
    printSuccess("Setup complete! You're ready to go.");
  });
  program.command("list-media").alias("ls").description("List media files").option("-t, --type <type>", "Filter by type (audio, video, text)").option("-p, --page <n>", "Page number (0-based)", "0").option("-s, --page-size <n>", "Results per page", "20").option("--sort <field>", "Sort field", "createdAt:desc").option("-f, --folder <id>", "Filter by folder ID").option("-n, --name <filter>", "Filter by name").option("--from <date>", "Start date filter (ISO 8601, e.g. 2026-01-01)").option("--to <date>", "End date filter (ISO 8601)").option("--favorites", "Show only favorites").option("--json", "Output raw JSON").action(async (opts) => {
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
      if (opts.from) params.from = opts.from;
      if (opts.to) params.to = opts.to;
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
  program.command("upload").description("Upload media from a URL or local file").argument("<source>", "Media URL or local file path").option("-n, --name <name>", "Display name").option("-t, --type <type>", "Media type (audio or video)").option("-l, --language <lang>", "Source language (BCP-47)", "en-US").option("-f, --folder <id>", "Destination folder ID").option("--tags <tags>", "Comma-separated tags").option("--wait", "Wait for processing to complete").option("--json", "Output raw JSON").action(async (source, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const fs3 = await import("fs");
      const pathMod = await import("path");
      const isLocalFile = fs3.existsSync(source);
      let mediaId;
      let state;
      if (isLocalFile) {
        const filename = pathMod.basename(source);
        const isVideo = isVideoFile(source);
        const mediaType = opts.type ?? detectMediaType(source);
        const mimeType = getMimeType(source);
        const signedRes = await client.get("/v1/media/upload/signedurl", {
          params: { isVideo, filename, mimeType }
        });
        const signedData = signedRes.data?.data;
        const uploadUrl = signedData?.signedUrl ?? signedData?.url;
        if (!uploadUrl) {
          printError("Could not get signed upload URL");
          process.exit(1);
        }
        process.stdout.write("Uploading...");
        const fileBuffer = fs3.readFileSync(source);
        const axios2 = (await import("axios")).default;
        await axios2.put(uploadUrl, fileBuffer, {
          headers: { "Content-Type": mimeType },
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        });
        console.log(" done");
        const createBody = {
          name: opts.name ?? filename,
          url: uploadUrl.split("?")[0],
          mediaType,
          sourceLanguage: opts.language
        };
        if (opts.folder) createBody.folderId = opts.folder;
        if (opts.tags) createBody.tags = opts.tags;
        const res = await client.post("/v1/media/upload", createBody);
        const data = res.data?.data;
        mediaId = data?.mediaId;
        state = data?.state;
      } else {
        const body = {
          name: opts.name ?? source.split("/").pop()?.split("?")[0] ?? "Upload",
          url: source,
          mediaType: opts.type ?? "audio",
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
        mediaId = data?.mediaId;
        state = data?.state;
      }
      printSuccess(`Uploaded: ${mediaId} (state: ${state})`);
      if (opts.wait && mediaId) {
        process.stdout.write("Processing");
        let attempts = 0;
        const maxAttempts = 120;
        while (state !== "processed" && state !== "failed" && attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 5e3));
          process.stdout.write(".");
          const statusRes = await client.get(`/v1/media/status/${mediaId}`);
          state = statusRes.data?.data?.state;
          attempts++;
        }
        console.log();
        if (state === "processed") {
          printSuccess(`Done! Media ${mediaId} is ready.`);
        } else if (state === "failed") {
          printError(`Processing failed for ${mediaId}`);
          process.exit(1);
        } else {
          printError(`Timeout: ${mediaId} still processing (state: ${state}). Check with: speakai-mcp status ${mediaId}`);
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
    "Export format (pdf, docx, srt, vtt, txt, csv)",
    "txt"
  ).option("--speakers", "Include speaker names").option("--timestamps", "Include timestamps").option("--redacted", "Apply PII redaction").option("--json", "Output raw JSON").action(async (mediaId, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const body = {};
      if (opts.speakers) body.isSpeakerNames = true;
      if (opts.timestamps) body.isTimeStamps = true;
      if (opts.redacted) body.isRedacted = true;
      const res = await client.post(
        `/v1/media/export/${mediaId}/${opts.format}`,
        body
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
        { key: "folderId", label: "Folder ID", width: 20 },
        { key: "name", label: "Name", width: 34 },
        { key: "createdAt", label: "Created", width: 20 }
      ]);
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("ask").description("Ask an AI question about media files, folders, or your entire workspace").argument("<prompt>", "Your question").argument("[mediaId]", "Optional media file ID (shorthand for -m <id>)").option("-m, --media <ids...>", "Media file IDs to query (space-separated)").option("-f, --folder <ids...>", "Folder IDs to scope the query to").option("--assistant <type>", "Assistant type (general, researcher, marketer, sales, recruiter)", "general").option("--speakers <ids...>", "Filter by speaker IDs").option("--tags <tags...>", "Filter by tags").option("--from <date>", "Start date (ISO 8601)").option("--to <date>", "End date (ISO 8601)").option("--individual", "Process each media file separately").option("--continue <promptId>", "Continue an existing conversation").option("--json", "Output raw JSON").action(async (prompt, mediaId, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const body = {
        prompt,
        assistantType: opts.assistant
      };
      if (mediaId) body.mediaIds = [mediaId];
      if (opts.media) body.mediaIds = opts.media;
      if (opts.folder) body.folderIds = opts.folder;
      if (opts.speakers) body.speakers = opts.speakers;
      if (opts.tags) body.tags = opts.tags;
      if (opts.from) body.startDate = opts.from;
      if (opts.to) body.endDate = opts.to;
      if (opts.individual) body.isIndividualPrompt = true;
      if (opts.continue) body.promptId = opts.continue;
      const res = await client.post("/v1/prompt", body);
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
      } else {
        console.log(data?.answer ?? data?.message ?? JSON.stringify(data, null, 2));
        if (data?.promptId) {
          console.log(`
(conversation: ${data.promptId} \u2014 use --continue to follow up)`);
        }
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("chat-history").description("List past AI Chat conversations").option("--json", "Output raw JSON").action(async (opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.get("/v1/prompt/history");
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
        return;
      }
      const items = Array.isArray(data) ? data : data?.prompts ?? data?.history ?? [];
      printTable(items, [
        { key: "_id", label: "ID", width: 26 },
        { key: "title", label: "Title", width: 40 },
        { key: "createdAt", label: "Created", width: 20 }
      ]);
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("search").description("Search across all media transcripts, insights, and metadata").argument("<query>", "Search query").option("--from <date>", "Start date (ISO 8601, defaults to start of month)").option("--to <date>", "End date (ISO 8601, defaults to now)").option("--json", "Output raw JSON").action(async (query, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const body = { query };
      if (opts.from) body.startDate = opts.from;
      if (opts.to) body.endDate = opts.to;
      const res = await client.post("/v1/analytics/search", body);
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
        return;
      }
      const items = Array.isArray(data) ? data : data?.results ?? data?.mediaNodes ?? [];
      if (Array.isArray(items) && items.length > 0) {
        console.log(`Found ${items.length} result(s)
`);
        printTable(items, [
          { key: "_id", label: "ID", width: 14 },
          { key: "name", label: "Name", width: 35 },
          { key: "mediaType", label: "Type", width: 6 },
          { key: "tags", label: "Tags", width: 20 }
        ]);
      } else {
        printJson(data);
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("clips").description("List clips, optionally for a specific media file").option("-m, --media <ids...>", "Filter by source media IDs").option("-f, --folder <id>", "Filter by folder ID").option("--json", "Output raw JSON").action(async (opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const params = {};
      if (opts.media) params.mediaIds = opts.media;
      if (opts.folder) params.folderId = opts.folder;
      const res = await client.get("/v1/clips", { params });
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
        return;
      }
      const items = Array.isArray(data) ? data : data?.clips ?? [];
      printTable(items, [
        { key: "clipId", label: "ID", width: 14 },
        { key: "title", label: "Title", width: 30 },
        { key: "state", label: "Status", width: 12 },
        { key: "duration", label: "Duration", width: 10 },
        { key: "createdAt", label: "Created", width: 20 }
      ]);
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("clip").description("Create a clip from a media file").argument("<mediaId>", "Source media file ID").requiredOption("--start <seconds>", "Start time in seconds").requiredOption("--end <seconds>", "End time in seconds").option("-n, --name <title>", "Clip title", "Clip").option("-t, --type <type>", "Media type (audio or video)", "audio").option("--description <text>", "Clip description").option("--tags <tags...>", "Tags for the clip").option("--json", "Output raw JSON").action(async (mediaId, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const body = {
        title: opts.name,
        mediaType: opts.type,
        timeRanges: [
          {
            mediaId,
            startTime: parseFloat(opts.start),
            endTime: parseFloat(opts.end)
          }
        ]
      };
      if (opts.description) body.description = opts.description;
      if (opts.tags) body.tags = opts.tags;
      const res = await client.post("/v1/clips", body);
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
      } else {
        printSuccess(`Clip created: ${data?.clipId ?? data?._id ?? "OK"} (processing...)`);
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("delete").description("Delete a media file").argument("<mediaId>", "Media file ID to delete").action(async (mediaId) => {
    requireApiKey();
    const client = await getClient();
    try {
      await client.delete(`/v1/media/${mediaId}`);
      printSuccess(`Deleted: ${mediaId}`);
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("update").description("Update media metadata").argument("<mediaId>", "Media file ID to update").requiredOption("-n, --name <name>", "Display name (required by the API)").option("-d, --description <text>", "New description").option("--tags <tags...>", "New tags").option("-f, --folder <id>", "Move to folder ID").option("--json", "Output raw JSON").action(async (mediaId, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const body = {};
      if (opts.name) body.name = opts.name;
      if (opts.description) body.description = opts.description;
      if (opts.tags) body.tags = opts.tags;
      if (opts.folder) body.folderId = opts.folder;
      if (Object.keys(body).length === 0) {
        printError("Provide at least one field to update (--name, --description, --tags, --folder)");
        process.exit(1);
      }
      const res = await client.put(`/v1/media/${mediaId}`, body);
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
      } else {
        printSuccess(`Updated: ${mediaId}`);
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("move").description("Move one or more media files to a folder").argument("<folderId>", "Target folder ID").argument("<mediaIds...>", "Media file IDs to move").option("--json", "Output raw JSON").action(async (folderId, mediaIds, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.put("/v1/media/move", { folderId, mediaIds });
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
      } else {
        printSuccess(`Moved ${mediaIds.length} item(s) to folder ${folderId}`);
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("create-folder").description("Create a new folder").argument("<name>", "Folder name").option("--json", "Output raw JSON").action(async (name, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.post("/v1/folder", { name });
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
      } else {
        printSuccess(`Folder created: ${data?.folderId ?? data?._id ?? "OK"} \u2014 ${name}`);
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("favorites").description("Mark or unmark a media file as a favorite").argument("<mediaId>", "Media file ID").option("--off", "Unmark as favorite (default: mark as favorite)").action(async (mediaId, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const isFavorite = !opts.off;
      const res = await client.post("/v1/media/favorites", {
        mediaIds: [mediaId],
        isFavorite
      });
      const data = res.data?.data;
      printSuccess(
        data?.message ?? `${isFavorite ? "Favorited" : "Unfavorited"} ${mediaId}`
      );
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("stats").description("Show workspace media statistics").option("--json", "Output raw JSON").action(async (opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.get("/v1/media/statistics");
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
        return;
      }
      const total = data?.totalMedia ?? "\u2014";
      const analyzed = data?.analyzedMedia ?? "\u2014";
      const notAnalyzed = data?.notAnalyzedMedia ?? "\u2014";
      console.log(`Total media:     ${total}`);
      console.log(`  Analyzed:      ${analyzed}`);
      console.log(`  Not analyzed:  ${notAnalyzed}`);
      if (data?.duration) {
        const hrs = Math.round(data.duration / 3600 * 10) / 10;
        console.log(`Duration:        ${hrs}h total`);
      }
      if (data?.analyzedMinutes) {
        const hrs = Math.round(data.analyzedMinutes / 60 * 10) / 10;
        console.log(`Analyzed:        ${hrs}h (${data.analyzedMinutes} min)`);
      }
      if (data?.fileSize) {
        const gb = Math.round(data.fileSize / (1024 * 1024 * 1024) * 100) / 100;
        console.log(`Storage:         ${gb} GB`);
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("languages").description("List supported transcription languages").option("--json", "Output raw JSON").action(async (opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.get("/v1/media/supportedLanguages");
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
      } else {
        const langs = Array.isArray(data) ? data : data?.languages ?? [];
        for (const lang of langs) {
          const name = typeof lang === "string" ? lang : lang.name ?? lang.code ?? JSON.stringify(lang);
          console.log(`  ${name}`);
        }
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("captions").description("Get captions for a media file").argument("<mediaId>", "Media file ID").option("--json", "Output raw JSON").action(async (mediaId, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.get(`/v1/media/caption/${mediaId}`);
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
      } else {
        const captions = Array.isArray(data) ? data : data?.captions ?? [];
        for (const cap of captions) {
          console.log(cap.text ?? cap);
        }
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("reanalyze").description("Re-run AI analysis on a media file with latest models").argument("<mediaId>", "Media file ID").action(async (mediaId) => {
    requireApiKey();
    const client = await getClient();
    try {
      await client.get(`/v1/media/reanalyze/${mediaId}`);
      printSuccess(`Re-analysis started for ${mediaId}`);
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("list-meeting-events").description("List scheduled or completed meeting assistant events").option("-P, --platform <type>", "Filter by platform: zoom, googleMeet, microsoftTeams, webex (comma-separate for multiple)").option("-S, --status <status>", "Filter by meeting status (comma-separate for multiple)").option("-p, --page <n>", "Page number (0-based)", "0").option("-s, --page-size <n>", "Results per page", "20").option("--sort <field>", "Sort field", "startTime:desc").option("--json", "Output raw JSON").action(async (opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const params = {
        page: parseInt(opts.page),
        pageSize: parseInt(opts.pageSize),
        sortBy: opts.sort
      };
      if (opts.platform) params.platformType = opts.platform;
      if (opts.status) params.meetingStatus = opts.status;
      const res = await client.get("/v1/meeting-assistant/events", { params });
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
        return;
      }
      const events = data?.events ?? [];
      console.log(`Total: ${data?.totalCount ?? events.length}
`);
      printTable(events, [
        { key: "meetingAssistantEventId", label: "Event ID", width: 24 },
        { key: "title", label: "Title", width: 32 },
        { key: "platform", label: "Platform", width: 16 },
        { key: "currentStatus", label: "Status", width: 18 },
        { key: "startTime", label: "Start", width: 20 }
      ]);
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
  program.command("live-transcript").description("Fetch new sentences from an in-progress or just-ended meeting").option("-e, --event-id <id>", "Meeting assistant event id (use `speakai-mcp list-meeting-events` to find it)").option("-m, --media-id <id>", "Media id (alternative to --event-id)").option("-s, --since-end-in-sec <seconds>", "nextCursor from previous call; omit on first call", parseFloat).option("--json", "Output raw JSON").action(async (opts) => {
    requireApiKey();
    const client = await getClient();
    if (!opts.eventId && !opts.mediaId) {
      printError("Provide --event-id or --media-id");
      process.exit(1);
    }
    try {
      let resolvedMediaId = opts.mediaId;
      let meetingStatus = null;
      let meetingName;
      if (opts.eventId) {
        const eventsRes = await client.get("/v1/meeting-assistant/events", {
          params: { pageSize: 50, sortBy: "startTime:desc" }
        });
        const events = eventsRes.data?.data?.events ?? eventsRes.data?.events ?? [];
        const event = events.find((e) => e.meetingAssistantEventId === opts.eventId);
        if (!event) {
          printError(`Meeting event not found: ${opts.eventId}`);
          process.exit(1);
        }
        meetingStatus = event.currentStatus ?? null;
        meetingName = event.title;
        const mediaRef = event.mediaId;
        resolvedMediaId = typeof mediaRef === "string" ? mediaRef : mediaRef?.mediaId;
        if (!resolvedMediaId) {
          printError("Meeting has no linked media yet \u2014 bot has not joined or started recording.");
          process.exit(1);
        }
      }
      const transcriptRes = await client.get(`/v1/media/transcript/${resolvedMediaId}`, {
        params: Number.isFinite(opts.sinceEndInSec) ? { sinceEndInSec: opts.sinceEndInSec } : void 0
      });
      const data = transcriptRes.data?.data ?? transcriptRes.data ?? {};
      const sentences = data?.insight?.transcript ?? [];
      const maxEnd = sentences.reduce((m, s) => Math.max(m, s.instances?.[0]?.endInSec ?? 0), 0);
      const nextCursor = sentences.length > 0 ? maxEnd : opts.sinceEndInSec ?? 0;
      const payload = {
        mediaId: resolvedMediaId,
        name: data?.name ?? meetingName ?? null,
        meetingStatus,
        isLive: meetingStatus === "inCallRecording",
        newSentences: sentences,
        nextCursor
      };
      if (opts.json) {
        printJson(payload);
      } else {
        console.log(`Meeting: ${payload.name ?? resolvedMediaId}`);
        console.log(`Status: ${payload.meetingStatus ?? "unknown"} (isLive=${payload.isLive})`);
        console.log(`New sentences: ${sentences.length} \u2022 nextCursor: ${nextCursor}`);
        for (const s of sentences) {
          console.log(`  [${s.speakerId ?? "?"}] ${s.text ?? ""}`);
        }
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  async function loadToolHandlers() {
    const client = await getClient();
    const handlers = {};
    const stub = {
      registerTool: (name, _def, cb) => {
        handlers[name] = cb;
        return {};
      }
    };
    const { registerAllTools: registerAllTools2 } = await Promise.resolve().then(() => (init_tools(), tools_exports));
    registerAllTools2(stub, client);
    return handlers;
  }
  program.command("tools").description("List every MCP tool callable via `call`").option("--json", "Output raw JSON").action(async (opts) => {
    const { SPEAK_MCP_TOOL_NAMES: SPEAK_MCP_TOOL_NAMES2 } = await Promise.resolve().then(() => (init_tool_names(), tool_names_exports));
    const names = [...SPEAK_MCP_TOOL_NAMES2].sort();
    if (opts.json) {
      printJson(names);
    } else {
      console.log(`${names.length} tools:
`);
      for (const n of names) console.log(`  ${n}`);
    }
  });
  program.command("call").description("Call any MCP tool by name with JSON arguments").argument("<tool>", "Tool name (see `speakai-mcp tools`)").argument("[json]", "Arguments as a JSON object", "{}").action(async (tool, json) => {
    requireApiKey();
    let args2;
    try {
      args2 = JSON.parse(json);
    } catch {
      printError(`Invalid JSON arguments: ${json}`);
      process.exit(1);
      return;
    }
    const handlers = await loadToolHandlers();
    const handler = handlers[tool];
    if (!handler) {
      printError(`Unknown tool "${tool}". Run "speakai-mcp tools" to list them.`);
      process.exit(1);
      return;
    }
    try {
      const result = await handler(args2);
      const text = result?.content?.find((c) => c.type === "text")?.text;
      if (result?.isError) {
        printError(text ?? "Tool call failed");
        process.exit(1);
        return;
      }
      const data = result?.structuredContent?.data ?? (text ? safeParse(text) : result);
      printJson(data);
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  return program;
}
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
var import_commander, import_readline;
var init_cli = __esm({
  "src/cli/index.ts"() {
    "use strict";
    import_commander = require("commander");
    import_readline = require("readline");
    init_config();
    init_format();
    init_media_utils();
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  SPEAK_MCP_TOOL_NAMES: () => SPEAK_MCP_TOOL_NAMES,
  createSpeakClient: () => createSpeakClient,
  formatAxiosError: () => formatAxiosError,
  registerAllTools: () => registerAllTools,
  registerPrompts: () => registerPrompts,
  registerResources: () => registerResources
});
module.exports = __toCommonJS(index_exports);
init_tools();
init_resources();
init_prompts();
init_client();
init_tool_names();
var args = process.argv.slice(2);
var cliCommands = [
  "config",
  "init",
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
  "chat-history",
  "search",
  "delete",
  "update",
  "create-folder",
  "favorites",
  "stats",
  "languages",
  "captions",
  "reanalyze",
  "clips",
  "clip",
  "schedule-meeting",
  "list-meeting-events",
  "live-transcript",
  "move",
  "tools",
  "call",
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
        Promise.all([
          Promise.resolve().then(() => (init_tools(), tools_exports)),
          Promise.resolve().then(() => (init_resources(), resources_exports)),
          Promise.resolve().then(() => (init_prompts(), prompts_exports))
        ]).then(([{ registerAllTools: registerAllTools2 }, { registerResources: registerResources2 }, { registerPrompts: registerPrompts2 }]) => {
          const server = new McpServer({
            name: "speak-ai",
            version: "1.0.0"
          });
          registerAllTools2(server);
          registerResources2(server);
          registerPrompts2(server);
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
  SPEAK_MCP_TOOL_NAMES,
  createSpeakClient,
  formatAxiosError,
  registerAllTools,
  registerPrompts,
  registerResources
});
