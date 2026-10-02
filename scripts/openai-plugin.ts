/**
 * OpenAI plugin directory rules shared by verify-plugin.ts and build-openai-zip.ts.
 * Limits come from https://developers.openai.com/plugins (manifest field reference
 * and plugin submission errors).
 */

// OpenAI assigned this name to the existing Speak AI listing; every uploaded update must keep it.
export const OPENAI_PLUGIN_NAME = "app-6a094509363081918cb9dd23801d8f13";

export const OPENAI_NAME_FORMAT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const OPENAI_SKILL_IDENTITY_MAX = 64;
export const OPENAI_DESCRIPTION_MAX = 1024;

export const OPENAI_LISTING_LIMITS = {
  displayName: 30,
  shortDescription: 30,
  longDescription: 4000,
  developerName: 80,
} as const;

export const OPENAI_SINGLE_LINE_FIELDS = ["displayName", "shortDescription", "developerName"] as const;
export const OPENAI_LISTING_URLS = ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"] as const;
export const OPENAI_URL_MAX = 1024;

export const OPENAI_MAX_PROMPTS = 3;
export const OPENAI_PROMPT_MAX = 128;
export const OPENAI_MAX_CAPABILITIES = 20;
export const OPENAI_CAPABILITY_MAX = 120;

export const OPENAI_ICON_FIELDS = ["composerIcon", "composerIconDark", "logo", "logoDark"] as const;
export const OPENAI_ICON_MIN_PX = 48;
export const OPENAI_ICON_MAX_PX = 4096;
export const OPENAI_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const OPENAI_BRAND_CONTRAST_MIN = 2;
export const OPENAI_DARK_SURFACE = "#212121";
