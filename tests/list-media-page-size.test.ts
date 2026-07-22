import { describe, it, expect } from "vitest";
import {
  resolveListMediaPageSize,
  LIST_MEDIA_DEFAULT_PAGE_SIZE,
  LIST_MEDIA_TRANSCRIPT_PAGE_SIZE,
} from "../src/tools/media.js";

describe("resolveListMediaPageSize", () => {
  it("applies the documented default when the model omits pageSize", () => {
    // Previously the parameter was forwarded untouched, so the API's default of 50 applied
    // while the tool told the model 20.
    expect(resolveListMediaPageSize(undefined, undefined)).toBe(LIST_MEDIA_DEFAULT_PAGE_SIZE);
    expect(resolveListMediaPageSize(undefined, ["keywords"])).toBe(LIST_MEDIA_DEFAULT_PAGE_SIZE);
  });

  it("honours an explicit pageSize when transcripts are not requested", () => {
    expect(resolveListMediaPageSize(500, undefined)).toBe(500);
    expect(resolveListMediaPageSize(500, ["fields"])).toBe(500);
    expect(resolveListMediaPageSize(1, ["speakers", "keywords"])).toBe(1);
  });

  it("caps the page when transcripts are inlined", () => {
    // 500 files with transcripts inline produced a 65MB response the provider rejected.
    expect(resolveListMediaPageSize(500, ["transcription"])).toBe(LIST_MEDIA_TRANSCRIPT_PAGE_SIZE);
    expect(resolveListMediaPageSize(100, ["fields", "transcription"])).toBe(LIST_MEDIA_TRANSCRIPT_PAGE_SIZE);
  });

  it("does not raise a page that is already small", () => {
    expect(resolveListMediaPageSize(5, ["transcription"])).toBe(5);
  });

  it("caps the default too when transcripts are requested without a pageSize", () => {
    expect(resolveListMediaPageSize(undefined, ["transcription"])).toBe(LIST_MEDIA_DEFAULT_PAGE_SIZE);
  });
});
