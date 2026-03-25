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
