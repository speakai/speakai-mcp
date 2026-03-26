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
        return Promise.reject(error);
      }
    );
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
var SubscriptionStatus, SubscriptionDuration;
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
var UserRole, UserPermissionType, UserActionType;
var init_user = __esm({
  "node_modules/@speakai/shared/dist/enums/user.js"() {
    "use strict";
    (function(UserRole2) {
      UserRole2["ADMIN"] = "admin";
      UserRole2["OWNER"] = "owner";
      UserRole2["MEMBER"] = "member";
    })(UserRole || (UserRole = {}));
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
  }
});

// node_modules/@speakai/shared/dist/index.js
var init_dist = __esm({
  "node_modules/@speakai/shared/dist/index.js"() {
    "use strict";
    init_enums();
    init_interfaces();
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
    "Get a pre-signed S3 URL for direct file upload to Speak AI storage. After getting the URL, PUT your file to it, then call upload_media with the S3 URL. For a simpler workflow, use upload_local_file instead which handles all steps automatically.",
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
    "Upload media from a publicly accessible URL. Processing is asynchronous \u2014 after uploading, use get_media_status to poll until state is 'processed' (typically 1-3 minutes for audio under 60 min), then use get_transcript and get_media_insights to retrieve results. For a single call that handles everything, use upload_and_analyze instead. For local files, use upload_local_file.",
    {
      name: import_zod.z.string().min(1).describe("Display name for the media file"),
      url: import_zod.z.string().describe("Publicly accessible URL of the media file (or pre-signed S3 URL)"),
      mediaType: import_zod.z.enum([MediaType.AUDIO, MediaType.VIDEO]).describe('Type of media: "audio" or "video"'),
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
    "List and search media files in the workspace with filtering, pagination, and sorting. Use filterName for text search, mediaType to filter by audio/video/text, folderId for folder-specific results, and from/to for date ranges. Returns mediaIds you can pass to get_transcript, get_media_insights, or ask_magic_prompt. For deep full-text search across transcripts, use search_media instead.",
    {
      mediaType: import_zod.z.enum([MediaType.AUDIO, MediaType.VIDEO, MediaType.TEXT]).optional().describe('Filter by media type: "audio", "video", or "text"'),
      page: import_zod.z.number().int().min(0).optional().describe("Page number for pagination (0-based, default: 0)"),
      pageSize: import_zod.z.number().int().min(1).max(500).optional().describe("Number of results per page (default: 20, max: 500)"),
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
    "Retrieve AI-generated insights for a processed media file \u2014 topics, sentiment, keywords, action items, summaries, and more. The media must be in 'processed' state (check with get_media_status first). For asking custom questions about a media file, use ask_magic_prompt instead.",
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
    "Retrieve the full transcript for a processed media file with speaker labels and timestamps. The media must be in 'processed' state. Use update_transcript_speakers to rename speaker labels after reviewing. For subtitle-formatted output, use get_captions instead.",
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
          { speakers }
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
    "Check the processing status of a media file. States: pending \u2192 transcribing \u2192 analyzing \u2192 processed (or failed). Poll this after upload_media until state is 'processed', then use get_transcript and get_media_insights to retrieve results.",
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
  server.tool(
    "get_captions",
    "Get captions for a media file. Captions are separate from full transcripts and are formatted for display/subtitles.",
    {
      mediaId: import_zod.z.string().min(1).describe("Unique identifier of the media file")
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
  server.tool(
    "list_supported_languages",
    "List all languages supported for transcription. Use the language codes when uploading media with a specific sourceLanguage.",
    {},
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
  server.tool(
    "get_media_statistics",
    "Get workspace-level media statistics \u2014 total counts, processing status breakdown, storage usage, etc.",
    {},
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
  server.tool(
    "toggle_media_favorite",
    "Mark or unmark a media file as a favorite for quick access.",
    {
      mediaId: import_zod.z.string().min(1).describe("Unique identifier of the media file")
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
  server.tool(
    "reanalyze_media",
    "Re-run AI analysis on a media file using the latest models. Use this after Speak AI has updated its analysis capabilities or if the original analysis was incomplete.",
    {
      mediaId: import_zod.z.string().min(1).describe("Unique identifier of the media file to re-analyze")
    },
    async ({ mediaId }) => {
      try {
        const result = await api.post(`/v1/media/reanalyze/${mediaId}`, {});
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
var init_media3 = __esm({
  "src/tools/media.ts"() {
    "use strict";
    import_zod = require("zod");
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
var init_text2 = __esm({
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
      page: import_zod4.z.number().int().min(0).optional().describe("Page number (0-based, default: 0)"),
      pageSize: import_zod4.z.number().int().min(1).max(500).optional().describe("Results per page (default: 20, max: 500)"),
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
      page: import_zod5.z.number().int().min(0).optional().describe("Page number (0-based, default: 0)"),
      pageSize: import_zod5.z.number().int().min(1).max(500).optional().describe("Results per page (default: 20, max: 500)"),
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
var init_recorder3 = __esm({
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
var init_embed3 = __esm({
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
    "ask_magic_prompt",
    [
      "Ask an AI-powered question about your media using Speak AI's Magic Prompt.",
      "Supports querying a single file, multiple files, entire folders, or your whole workspace.",
      "Pass mediaIds for specific files, folderIds for entire folders, or omit both to search across all media.",
      "Use assistantType to get specialized responses (e.g., 'researcher' for academic analysis, 'sales' for deal insights).",
      "To continue a conversation, pass the promptId from a previous response.",
      "Returns a promptId \u2014 save it to continue the conversation with follow-up questions."
    ].join(" "),
    {
      prompt: import_zod7.z.string().min(1).describe("The question or prompt to ask about the media"),
      mediaIds: import_zod7.z.array(import_zod7.z.string()).optional().describe("Array of media IDs to query. Omit along with folderIds to search across all media in your workspace."),
      folderIds: import_zod7.z.array(import_zod7.z.string()).optional().describe("Array of folder IDs to scope the query to. Omit along with mediaIds to search across all media."),
      folderId: import_zod7.z.string().optional().describe("Single folder ID to scope the query to. Use folderIds for multiple folders."),
      assistantType: import_zod7.z.enum(Object.values(AssistantType)).optional().describe("Assistant persona: 'general' (default), 'researcher' (academic), 'marketer' (content), 'sales' (deals), 'recruiter' (hiring). Use 'custom' with assistantTemplateId."),
      assistantTemplateId: import_zod7.z.string().optional().describe("Required when assistantType is 'custom'. ID of a custom assistant template from list_prompts."),
      promptId: import_zod7.z.string().optional().describe("ID of an existing conversation to continue. Pass this to maintain chat context across multiple questions."),
      speakers: import_zod7.z.array(import_zod7.z.string()).optional().describe("Filter to specific speaker IDs from the transcript"),
      tags: import_zod7.z.array(import_zod7.z.string()).optional().describe("Filter media by tags"),
      startDate: import_zod7.z.string().optional().describe("Start date for date range filter (ISO 8601, e.g., '2025-01-01')"),
      endDate: import_zod7.z.string().optional().describe("End date for date range filter (ISO 8601, e.g., '2025-03-31')"),
      isIndividualPrompt: import_zod7.z.boolean().optional().describe("When true, processes each media file separately instead of combining context. Useful for comparing responses across files.")
    },
    async (params) => {
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
    }
  );
  server.tool(
    "retry_magic_prompt",
    "Retry a failed or incomplete Magic Prompt response. Use when a previous ask_magic_prompt call returned an error or incomplete answer.",
    {
      promptId: import_zod7.z.string().min(1).describe("ID of the conversation containing the failed message"),
      messageId: import_zod7.z.string().min(1).describe("ID of the specific message to retry")
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
  server.tool(
    "get_chat_history",
    "Get a list of recent Magic Prompt conversations. Returns conversation summaries with promptIds that can be used to continue conversations via ask_magic_prompt or retrieve full messages via get_chat_messages.",
    {
      limit: import_zod7.z.number().int().positive().optional().describe("Number of recent conversations to return (default: 10)")
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
  server.tool(
    "get_chat_messages",
    "Get full message history for conversations. Can filter by promptId for a specific conversation, by media/folder, or search across all chat messages. Returns questions, answers, references, and metadata.",
    {
      promptId: import_zod7.z.string().optional().describe("Filter to a specific conversation by its ID"),
      folderId: import_zod7.z.string().optional().describe("Filter messages by folder ID"),
      mediaIds: import_zod7.z.string().optional().describe("Filter by media IDs (comma-separated)"),
      query: import_zod7.z.string().optional().describe("Search text in prompts and answers"),
      page: import_zod7.z.number().int().min(0).optional().describe("Page number for pagination (0-based, default: 0)"),
      pageSize: import_zod7.z.number().int().min(1).max(500).optional().describe("Results per page (default: 25, max: 500)")
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
  server.tool(
    "delete_chat_message",
    "Delete a specific chat message from conversation history.",
    {
      promptId: import_zod7.z.string().min(1).describe("ID of the message to delete")
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
  server.tool(
    "list_prompts",
    "List all available Magic Prompt templates. Use template IDs with ask_magic_prompt's assistantTemplateId parameter when using assistantType 'custom'.",
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
    "get_favorite_prompts",
    "Get all prompts and answers that have been marked as favorites. Useful for finding saved insights and important AI-generated analysis.",
    {},
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
  server.tool(
    "toggle_prompt_favorite",
    "Mark or unmark a chat message as a favorite for easy retrieval later.",
    {
      promptId: import_zod7.z.string().min(1).describe("ID of the conversation"),
      messageId: import_zod7.z.string().min(1).describe("ID of the specific message to favorite/unfavorite"),
      isFavorite: import_zod7.z.boolean().describe("true to mark as favorite, false to remove")
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
  server.tool(
    "update_chat_title",
    "Update the title of a chat conversation for easier identification in history.",
    {
      promptId: import_zod7.z.string().min(1).describe("ID of the conversation to rename"),
      title: import_zod7.z.string().min(1).describe("New title for the conversation")
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
  server.tool(
    "submit_chat_feedback",
    "Submit feedback on a chat response (thumbs up/down). Helps improve AI answer quality.",
    {
      promptId: import_zod7.z.string().min(1).describe("ID of the conversation"),
      messageId: import_zod7.z.string().min(1).describe("ID of the message to rate"),
      score: import_zod7.z.number().describe("Feedback score: 1 for thumbs up, -1 for thumbs down"),
      reason: import_zod7.z.string().optional().describe("Optional explanation for the feedback")
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
  server.tool(
    "get_chat_statistics",
    "Get usage statistics for Magic Prompt / chat. Returns metrics on prompt usage, optionally filtered by date range.",
    {
      startDate: import_zod7.z.string().optional().describe("Start date for stats (ISO 8601)"),
      endDate: import_zod7.z.string().optional().describe("End date for stats (ISO 8601)")
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
  server.tool(
    "export_chat_answer",
    "Export a Magic Prompt conversation or answer. Useful for saving AI-generated summaries, reports, or analysis results.",
    {
      promptId: import_zod7.z.string().min(1).describe("ID of the conversation to export")
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
var import_zod7;
var init_prompt3 = __esm({
  "src/tools/prompt.ts"() {
    "use strict";
    import_zod7 = require("zod");
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
  server.tool(
    "list_meeting_events",
    "List scheduled or completed meeting assistant events with filtering and pagination.",
    {
      platformType: import_zod8.z.string().optional().describe("Filter by platform (e.g. zoom, teams, meet)"),
      meetingStatus: import_zod8.z.string().optional().describe("Filter by status (e.g. scheduled, completed, cancelled)"),
      page: import_zod8.z.number().int().min(0).optional().describe("Page number (0-based, default: 0)"),
      pageSize: import_zod8.z.number().int().min(1).max(500).optional().describe("Results per page (default: 20, max: 500)")
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
var init_meeting3 = __esm({
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
var init_fields2 = __esm({
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

// src/tools/analytics.ts
var analytics_exports = {};
__export(analytics_exports, {
  register: () => register12
});
function register12(server, client) {
  const api = client ?? speakClient;
  server.tool(
    "search_media",
    [
      "Deep search across all media transcripts, insights, and metadata.",
      "Returns matching media with sentiment data, tags, and content excerpts.",
      "Use this to find specific topics, keywords, or themes across your entire library.",
      "For filtering by media type, folder, tags, or speakers, use the filterList parameter.",
      "Results are scoped by date range \u2014 defaults to current month if not specified."
    ].join(" "),
    {
      query: import_zod12.z.string().min(1).describe("Search query \u2014 searches across transcripts, insights, and metadata"),
      startDate: import_zod12.z.string().optional().describe("Start date for search range (ISO 8601). Defaults to start of current month."),
      endDate: import_zod12.z.string().optional().describe("End date for search range (ISO 8601). Defaults to now."),
      filterList: import_zod12.z.array(
        import_zod12.z.object({
          fieldName: import_zod12.z.enum(Object.values(FilterFieldName)).describe("Field to filter on"),
          fieldOperator: import_zod12.z.enum(Object.values(FilterOperator)).describe("Filter operator"),
          fieldValue: import_zod12.z.array(import_zod12.z.string()).describe("Values to filter by"),
          fieldCondition: import_zod12.z.enum(Object.values(FilterCondition)).describe("Condition linking multiple filters")
        })
      ).optional().describe("Advanced filters for narrowing search results by tags, speakers, media type, sentiment, folder, etc.")
    },
    async (params) => {
      try {
        const result = await api.post("/v1/analytics/search", params);
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
var init_analytics = __esm({
  "src/tools/analytics.ts"() {
    "use strict";
    import_zod12 = require("zod");
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
  server.tool(
    "create_clip",
    [
      "Create a highlight clip from one or more media files by specifying time ranges.",
      `Clips are processed asynchronously (states: ${Object.values(ClipState).join(", ")}) \u2014 use get_clips to check status.`,
      "Maximum total clip duration is 30 minutes.",
      "Use multiple timeRanges to stitch segments from different media files together."
    ].join(" "),
    {
      title: import_zod13.z.string().min(1).describe("Title for the clip"),
      mediaType: import_zod13.z.enum([MediaType.AUDIO, MediaType.VIDEO]).describe("Output media type"),
      timeRanges: import_zod13.z.array(
        import_zod13.z.object({
          mediaId: import_zod13.z.string().min(1).describe("Source media file ID"),
          startTime: import_zod13.z.number().min(0).describe("Start time in seconds"),
          endTime: import_zod13.z.number().min(0).describe("End time in seconds (must be > startTime)")
        })
      ).min(1).describe("Array of time ranges to include in the clip. Each specifies a source media and start/end times."),
      description: import_zod13.z.string().optional().describe("Description of the clip"),
      tags: import_zod13.z.array(import_zod13.z.string()).optional().describe("Tags for the clip"),
      mergeStrategy: import_zod13.z.enum(["CONCATENATE"]).optional().describe("How to merge multiple segments (default: CONCATENATE)")
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
  server.tool(
    "get_clips",
    "List clips, optionally filtered by folder or media files. If clipId is provided, returns a single clip with its download URL (when processed).",
    {
      clipId: import_zod13.z.string().optional().describe("Get a specific clip by ID"),
      folderId: import_zod13.z.string().optional().describe("Filter clips by folder ID"),
      mediaIds: import_zod13.z.array(import_zod13.z.string()).optional().describe("Filter clips by source media file IDs")
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
  server.tool(
    "update_clip",
    "Update a clip's title, description, or tags.",
    {
      clipId: import_zod13.z.string().min(1).describe("ID of the clip to update"),
      title: import_zod13.z.string().optional().describe("New title"),
      description: import_zod13.z.string().optional().describe("New description"),
      tags: import_zod13.z.array(import_zod13.z.string()).optional().describe("New tags")
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
  server.tool(
    "delete_clip",
    "Permanently delete a clip and its associated media file.",
    {
      clipId: import_zod13.z.string().min(1).describe("ID of the clip to delete")
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
var import_zod13;
var init_clips = __esm({
  "src/tools/clips.ts"() {
    "use strict";
    import_zod13 = require("zod");
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
function register14(server, client) {
  const api = client ?? speakClient;
  server.tool(
    "upload_and_analyze",
    [
      "Upload media from a URL, wait for processing to complete, then return the transcript and AI insights \u2014 all in one call.",
      "This is a convenience tool that combines upload_media + polling get_media_status + get_transcript + get_media_insights.",
      "Processing typically takes 1-3 minutes for audio under 60 minutes.",
      "Use this when you want the full analysis result without managing the polling loop yourself."
    ].join(" "),
    {
      url: import_zod14.z.string().describe("Publicly accessible URL of the media file"),
      name: import_zod14.z.string().optional().describe("Display name for the media (defaults to filename from URL)"),
      mediaType: import_zod14.z.enum([MediaType.AUDIO, MediaType.VIDEO]).optional().describe("Media type (default: audio)"),
      sourceLanguage: import_zod14.z.string().optional().describe("BCP-47 language code (e.g., 'en-US', 'he-IL')"),
      folderId: import_zod14.z.string().optional().describe("Folder ID to place the media in"),
      tags: import_zod14.z.string().optional().describe("Comma-separated tags")
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
        if (!mediaId) {
          return {
            content: [{ type: "text", text: `Error: Upload succeeded but no mediaId returned.
${JSON.stringify(uploadRes.data, null, 2)}` }],
            isError: true
          };
        }
        let state = uploadRes.data?.data?.state;
        let attempts = 0;
        while (state !== MediaState.PROCESSED && state !== MediaState.FAILED && attempts < MAX_POLL_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          const statusRes = await api.get(`/v1/media/status/${mediaId}`);
          state = statusRes.data?.data?.state;
          attempts++;
        }
        if (state === MediaState.FAILED) {
          return {
            content: [{ type: "text", text: `Error: Processing failed for media ${mediaId}` }],
            isError: true
          };
        }
        if (state !== MediaState.PROCESSED) {
          return {
            content: [{ type: "text", text: `Timeout: Media ${mediaId} is still processing (state: ${state}). Use get_media_status to check later.` }],
            isError: true
          };
        }
        const [transcriptRes, insightsRes] = await Promise.all([
          api.get(`/v1/media/transcript/${mediaId}`),
          api.get(`/v1/media/insight/${mediaId}`)
        ]);
        const result = {
          mediaId,
          state: "processed",
          transcript: transcriptRes.data?.data,
          insights: insightsRes.data?.data
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
  server.tool(
    "upload_local_file",
    [
      "Upload a local file to Speak AI for transcription and analysis.",
      "Reads the file from disk, gets a pre-signed S3 URL, uploads the file, then creates the media entry.",
      "Works with any audio or video file on the local filesystem.",
      "After upload, use get_media_status to poll for completion, then get_transcript and get_media_insights."
    ].join(" "),
    {
      filePath: import_zod14.z.string().describe("Absolute path to the local audio or video file"),
      name: import_zod14.z.string().optional().describe("Display name (defaults to filename)"),
      mediaType: import_zod14.z.enum([MediaType.AUDIO, MediaType.VIDEO]).optional().describe("Media type (auto-detected from extension if omitted)"),
      sourceLanguage: import_zod14.z.string().optional().describe("BCP-47 language code (e.g., 'en-US')"),
      folderId: import_zod14.z.string().optional().describe("Folder ID to place the media in"),
      tags: import_zod14.z.string().optional().describe("Comma-separated tags")
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
        const uploadUrl = signedData?.signedUrl ?? signedData?.url;
        const s3Key = signedData?.key ?? signedData?.s3Key;
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
          // S3 URL without query params
          mediaType
        };
        if (s3Key) createBody.s3Key = s3Key;
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
var import_zod14, fs, path2, POLL_INTERVAL_MS, MAX_POLL_ATTEMPTS;
var init_workflows = __esm({
  "src/tools/workflows.ts"() {
    "use strict";
    import_zod14 = require("zod");
    init_client();
    init_dist();
    fs = __toESM(require("fs"));
    path2 = __toESM(require("path"));
    init_media_utils();
    POLL_INTERVAL_MS = 5e3;
    MAX_POLL_ATTEMPTS = 120;
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
      workflows_exports
    ];
  }
});

// src/resources.ts
var resources_exports = {};
__export(resources_exports, {
  registerResources: () => registerResources
});
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
        return {
          contents: [
            {
              uri: "speakai://media",
              mimeType: "application/json",
              text: JSON.stringify(result.data?.data, null, 2)
            }
          ]
        };
      } catch {
        return { contents: [] };
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
        return {
          contents: [
            {
              uri: "speakai://folders",
              mimeType: "application/json",
              text: JSON.stringify(result.data?.data, null, 2)
            }
          ]
        };
      } catch {
        return { contents: [] };
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
        return {
          contents: [
            {
              uri: "speakai://languages",
              mimeType: "application/json",
              text: JSON.stringify(result.data?.data, null, 2)
            }
          ]
        };
      } catch {
        return { contents: [] };
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
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(result.data?.data, null, 2)
            }
          ]
        };
      } catch {
        return { contents: [] };
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
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(result.data?.data, null, 2)
            }
          ]
        };
      } catch {
        return { contents: [] };
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
      url: import_zod15.z.string().describe("URL of the meeting recording"),
      name: import_zod15.z.string().optional().describe("Meeting name (optional)")
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
      topic: import_zod15.z.string().describe("The topic, theme, or question to research"),
      folder: import_zod15.z.string().optional().describe("Folder ID to scope the research (optional)")
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
              `2. For the most relevant results, use ask_magic_prompt with the matching mediaIds to ask: "${topic}"`,
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
      days: import_zod15.z.string().optional().describe("Number of days to look back (default: 7)"),
      folder: import_zod15.z.string().optional().describe("Folder ID to scope to (optional)")
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
var import_zod15;
var init_prompts = __esm({
  "src/prompts.ts"() {
    "use strict";
    import_zod15 = require("zod");
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
  program.command("chat-history").description("List past Magic Prompt conversations").option("--json", "Output raw JSON").action(async (opts) => {
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
  program.command("update").description("Update media metadata").argument("<mediaId>", "Media file ID to update").option("-n, --name <name>", "New display name").option("-d, --description <text>", "New description").option("--tags <tags...>", "New tags").option("-f, --folder <id>", "Move to folder ID").option("--json", "Output raw JSON").action(async (mediaId, opts) => {
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
  program.command("create-folder").description("Create a new folder").argument("<name>", "Folder name").option("--json", "Output raw JSON").action(async (name, opts) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.post("/v1/folder", { name });
      const data = res.data?.data;
      if (opts.json) {
        printJson(data);
      } else {
        printSuccess(`Folder created: ${data?._id ?? "OK"} \u2014 ${name}`);
      }
    } catch (err) {
      printError(err.response?.data?.message ?? err.message);
      process.exit(1);
    }
  });
  program.command("favorites").description("Toggle favorite status for a media file").argument("<mediaId>", "Media file ID").action(async (mediaId) => {
    requireApiKey();
    const client = await getClient();
    try {
      const res = await client.post("/v1/media/favorites", { mediaId });
      const data = res.data?.data;
      printSuccess(data?.message ?? `Favorite toggled for ${mediaId}`);
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
      const total = data?.totalCount ?? data?.total ?? "\u2014";
      const audio = data?.audioCount ?? data?.audio ?? "\u2014";
      const video = data?.videoCount ?? data?.video ?? "\u2014";
      const text = data?.textCount ?? data?.text ?? "\u2014";
      console.log(`Total media:  ${total}`);
      console.log(`  Audio:      ${audio}`);
      console.log(`  Video:      ${video}`);
      console.log(`  Text:       ${text}`);
      if (data?.totalDuration) {
        const hrs = Math.round(data.totalDuration / 3600 * 10) / 10;
        console.log(`Duration:     ${hrs}h total`);
      }
      if (data?.totalSize) {
        const gb = Math.round(data.totalSize / (1024 * 1024 * 1024) * 100) / 100;
        console.log(`Storage:      ${gb} GB`);
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
    init_media_utils();
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
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
  createSpeakClient,
  formatAxiosError,
  registerAllTools,
  registerPrompts,
  registerResources
});
