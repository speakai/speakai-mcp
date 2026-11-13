import * as path from "path";
import axios from "axios";
import { formatAxiosError } from "./client.js";

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

export const URL_UPLOAD_HELP =
  "If the message above is about the link, show it to the user and ask for a different link instead of retrying the same one. " +
  "A link works when it opens without signing in and is either a direct link to an audio or video file (such as .mp3, .m4a, .wav or .mp4) " +
  `or a public page link from ${SUPPORTED_URL_SOURCES}. ${UNSUPPORTED_URL_SOURCES} ` +
  "Private or sign-in-only links, photo-only posts and links to web pages without media cannot be imported.";

export const MEDIA_NOT_FOUND_HELP =
  "No media with this mediaId exists in the signed-in Speak account. It may have been deleted, belong to a different Speak account, " +
  "or not be a mediaId at all (a media name, a database _id or an id from another tool). " +
  "Call search_media or list_media to find the right mediaId, then try again.";

export function apiErrorText(error: unknown, helpByStatus: Record<number, string>): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const help = status === undefined ? undefined : helpByStatus[status];
  return `Error: ${formatAxiosError(error)}${help ? `\n\n${help}` : ""}`;
}

export function defaultUploadName(source: string, name?: string, now: Date = new Date()): string {
  const given = name?.trim();
  if (given) return given;
  const fileName = fileNameFromSource(source);
  if (fileName) return fileName;
  return `Upload ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function fileNameFromSource(source: string): string | undefined {
  if (!/^https?:\/\//i.test(source.trim())) return path.basename(source.trim()) || undefined;
  let lastSegment: string | undefined;
  try {
    lastSegment = new URL(source.trim()).pathname.split("/").filter(Boolean).pop();
  } catch {
    return undefined;
  }
  if (!lastSegment) return undefined;
  let fileName = lastSegment.trim();
  try {
    fileName = decodeURIComponent(lastSegment).trim();
  } catch {}
  return fileName && path.extname(fileName) ? fileName : undefined;
}


export function detectImageMimeType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 8) === "PNG\r\n\x1a\n") return "image/png";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
