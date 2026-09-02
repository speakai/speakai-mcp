import { describe, it, expect } from "vitest";
import { getMimeType, isVideoFile, detectMediaType, mediaTypeFromUrl } from "../src/media-utils.js";

describe("media-utils", () => {
  describe("isVideoFile", () => {
    it("detects video extensions", () => {
      expect(isVideoFile("meeting.mp4")).toBe(true);
      expect(isVideoFile("recording.mov")).toBe(true);
      expect(isVideoFile("clip.avi")).toBe(true);
      expect(isVideoFile("video.mkv")).toBe(true);
      expect(isVideoFile("stream.webm")).toBe(true);
      expect(isVideoFile("old.wmv")).toBe(true);
    });

    it("rejects audio extensions", () => {
      expect(isVideoFile("podcast.mp3")).toBe(false);
      expect(isVideoFile("voice.m4a")).toBe(false);
      expect(isVideoFile("music.wav")).toBe(false);
      expect(isVideoFile("audio.ogg")).toBe(false);
      expect(isVideoFile("lossless.flac")).toBe(false);
    });

    it("is case insensitive", () => {
      expect(isVideoFile("video.MP4")).toBe(true);
      expect(isVideoFile("audio.MP3")).toBe(false);
    });

    it("handles paths with directories", () => {
      expect(isVideoFile("/home/user/videos/meeting.mp4")).toBe(true);
      expect(isVideoFile("/tmp/audio.mp3")).toBe(false);
    });
  });

  describe("detectMediaType", () => {
    it("returns video for video files", () => {
      expect(detectMediaType("test.mp4")).toBe("video");
      expect(detectMediaType("test.mov")).toBe("video");
    });

    it("returns audio for audio files", () => {
      expect(detectMediaType("test.mp3")).toBe("audio");
      expect(detectMediaType("test.wav")).toBe("audio");
    });

    it("defaults to audio for unknown extensions", () => {
      expect(detectMediaType("test.xyz")).toBe("audio");
    });
  });

  describe("mediaTypeFromUrl", () => {
    it("reads the type off a direct file URL", () => {
      expect(mediaTypeFromUrl("https://cdn.example.com/talk.mp4")).toBe("video");
      expect(mediaTypeFromUrl("https://cdn.example.com/talk.MOV")).toBe("video");
      expect(mediaTypeFromUrl("https://cdn.example.com/talk.mp3")).toBe("audio");
      expect(mediaTypeFromUrl("https://cdn.example.com/talk.m4a")).toBe("audio");
    });

    // The list mirrors speak-client's supported-formats.ts, so every accepted format resolves.
    it("covers every upload format the product accepts", () => {
      for (const ext of ["mp3", "wav", "ogg", "m4a", "flac", "m4p", "aac", "amr"]) {
        expect(mediaTypeFromUrl(`https://cdn.example.com/a.${ext}`)).toBe("audio");
      }
      for (const ext of ["mp4", "wmv", "avi", "m4v", "mov", "flv", "mkv"]) {
        expect(mediaTypeFromUrl(`https://cdn.example.com/a.${ext}`)).toBe("video");
      }
    });

    // .webm holds either kind and .mpeg is video as often as audio, so neither proves anything.
    it("returns undefined for a container that carries either kind", () => {
      expect(mediaTypeFromUrl("https://cdn.example.com/a.webm")).toBeUndefined();
      expect(mediaTypeFromUrl("https://cdn.example.com/a.mpeg")).toBeUndefined();
      expect(mediaTypeFromUrl("https://cdn.example.com/a.mpg")).toBeUndefined();
    });

    it("ignores the query string a pre-signed S3 URL appends", () => {
      expect(mediaTypeFromUrl("https://b.s3.amazonaws.com/k/talk.mp4?X-Amz-Signature=abc")).toBe("video");
    });

    // The whole point: a page link proves nothing, so the server decides rather than
    // receiving "audio" and importing a video's audio track only.
    it("returns undefined for a social or video page link", () => {
      expect(mediaTypeFromUrl("https://www.youtube.com/watch?v=FQD56iiK5Po")).toBeUndefined();
      expect(mediaTypeFromUrl("https://youtu.be/FQD56iiK5Po")).toBeUndefined();
      expect(mediaTypeFromUrl("https://www.tiktok.com/@user/video/123")).toBeUndefined();
      expect(mediaTypeFromUrl("https://www.instagram.com/reel/Abc123/")).toBeUndefined();
    });

    it("returns undefined for an unrecognised extension", () => {
      expect(mediaTypeFromUrl("https://cdn.example.com/notes.xyz")).toBeUndefined();
    });
  });

  describe("getMimeType", () => {
    it("returns correct mime for common audio formats", () => {
      expect(getMimeType("file.mp3")).toBe("audio/mpeg");
      expect(getMimeType("file.m4a")).toBe("audio/mp4");
      expect(getMimeType("file.wav")).toBe("audio/wav");
      expect(getMimeType("file.ogg")).toBe("audio/ogg");
      expect(getMimeType("file.flac")).toBe("audio/flac");
    });

    it("returns correct mime for video formats", () => {
      expect(getMimeType("file.mp4")).toBe("video/mp4");
      expect(getMimeType("file.mov")).toBe("video/quicktime");
      expect(getMimeType("file.avi")).toBe("video/x-msvideo");
      expect(getMimeType("file.mkv")).toBe("video/x-matroska");
      expect(getMimeType("file.wmv")).toBe("video/x-ms-wmv");
      expect(getMimeType("file.webm")).toBe("video/webm");
    });

    it("handles mp4 as audio when not a video file context", () => {
      // .mp4 is in the video extensions list, so it's treated as video
      expect(getMimeType("file.mp4")).toBe("video/mp4");
    });

    it("falls back to audio/mpeg for unknown extensions", () => {
      expect(getMimeType("file.xyz")).toBe("audio/mpeg");
    });
  });
});
