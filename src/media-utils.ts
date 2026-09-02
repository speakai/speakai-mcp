import * as path from "path";

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv"];

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".wmv": "video/x-ms-wmv",
};

export function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const isVideo = isVideoFile(filePath);

  // These depend on whether the file is treated as video or audio
  if (ext === ".mp4") return isVideo ? "video/mp4" : "audio/mp4";
  if (ext === ".webm") return isVideo ? "video/webm" : "audio/webm";

  return MIME_TYPES[ext] ?? (isVideo ? "video/mp4" : "audio/mpeg");
}

export function detectMediaType(filePath: string): "audio" | "video" {
  return isVideoFile(filePath) ? "video" : "audio";
}

/**
 * The page links Speak resolves to underlying media, phrased for tool descriptions.
 *
 * Mirrors the server's supported-platform list (YouTube plus the Cobalt hosts), which the web
 * app reads live from GET /media/supported-platforms. Kept as one string so the two upload
 * tools cannot drift apart; if the server's list changes, change it here.
 *
 * Deliberately lists post/video URLs only. A TikTok *profile* URL is resolved into a picker of
 * recent videos by the app's own resolve endpoint, not by the upload endpoint these tools call.
 */
export const SUPPORTED_URL_SOURCES =
  "YouTube, TikTok, Instagram, X/Twitter, Facebook, Reddit, SoundCloud, Twitch, Dailymotion, " +
  "Streamable, Snapchat, Pinterest, Tumblr, Bilibili, VK, OK.ru and Rutube";

/** Page links that look importable but are not handled by the URL upload path. */
export const UNSUPPORTED_URL_SOURCES = "Vimeo and Loom page links are not supported.";

