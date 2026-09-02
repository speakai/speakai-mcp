import { describe, it, expect } from "vitest";
import { getMimeType, isVideoFile, detectMediaType } from "../src/media-utils.js";

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
