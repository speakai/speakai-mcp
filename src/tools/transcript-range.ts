import { AxiosInstance } from "axios";
import { z } from "zod";
import { unwrapData } from "./inbound-webhook-utils.js";

// Mirrors the word order of flattenWords() in @speakai/shared; import it instead once that version is published.
const WHITESPACE = /\s+/;
const EDGE_PUNCTUATION = /^\p{P}+|\p{P}+$/gu;
const CURLY_APOSTROPHE = /[‘’ʼ]/g;
const MATCH_CONTEXT_WORDS = 6;
const MAX_LISTED_MATCHES = 10;

const WORD_INDEX_RULE =
  "Word indices count the words of get_transcript's insight.transcript in order, from 0: for each " +
  "sentence, the words of its entities[].text when it has entities, otherwise its text split on " +
  "spaces; tokens that are only punctuation are not counted.";

export const rangeInputSchema = {
  range: z
    .object({
      start: z.number().int().min(0).describe("Index of the first word (0-based, inclusive)"),
      end: z.number().int().min(0).describe("Index of the last word (inclusive, >= start)"),
    })
    .optional()
    .describe(`Exact word range. Needs expectedTranscriptRevision. Prefer quote unless you already hold word indices. ${WORD_INDEX_RULE}`),
  expectedTranscriptRevision: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "transcriptRevision the range was read at (returned by get_transcript, list_media_labels and list_media_comments). " +
        "Required with range. Optional with quote: the quote is found in the current transcript, and a revision you pass makes the call fail with 409 if the transcript changed since you read it."
    ),
  quote: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .optional()
    .describe(
      "Words copied from the transcript, used instead of range. Matching ignores case and leading or trailing " +
        "punctuation, and must cover whole words in order. If the words appear more than once, pass occurrence."
    ),
  occurrence: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Which match of quote to use (1 = first) when the quote appears more than once"),
} as const;

export const STALE_TRANSCRIPT_NOTE =
  "A 409 that says the transcript changed means someone edited it after your revision was read: read the " +
  "transcript again (get_transcript) and retry with the new range or quote. Nothing was saved.";

export const publicId = (what: string) =>
  z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, `${what} must be a Speak id (letters, digits, _ or -)`);

export interface WordRange {
  start: number;
  end: number;
}

export interface RangeInput {
  range?: WordRange;
  expectedTranscriptRevision?: number;
  quote?: string;
  occurrence?: number;
}

export interface ResolvedRange {
  range: WordRange;
  expectedTranscriptRevision: number;
}

interface TranscriptSegment {
  text?: string;
  entities?: { text?: string }[];
}

interface Word {
  text: string;
  norm: string;
}

function normalizeWord(word: string): string {
  return word.normalize("NFC").toLowerCase().replace(CURLY_APOSTROPHE, "'").replace(EDGE_PUNCTUATION, "");
}

function tokens(text: string | undefined): Word[] {
  return (text ?? "")
    .split(WHITESPACE)
    .map((token) => ({ text: token, norm: normalizeWord(token) }))
    .filter((token) => token.norm !== "");
}

function transcriptWords(transcript: TranscriptSegment[] | undefined): Word[] {
  const words: Word[] = [];
  for (const segment of transcript ?? []) {
    const entities = segment.entities ?? [];
    if (entities.length === 0) {
      words.push(...tokens(segment.text));
    } else {
      for (const entity of entities) words.push(...tokens(entity.text));
    }
  }
  return words;
}

/** Word range of quote; throws an Error the agent can act on when it is missing or ambiguous. */
function findQuoteRange(words: Word[], quote: string, occurrence?: number): WordRange {
  const needle = tokens(quote).map((t) => t.norm);
  if (needle.length === 0) {
    throw new Error("quote has no words once punctuation is removed.");
  }

  const starts: number[] = [];
  for (let i = 0; i + needle.length <= words.length; i++) {
    if (needle.every((norm, j) => words[i + j].norm === norm)) starts.push(i);
  }

  if (starts.length === 0) {
    throw new Error(
      `quote was not found in the transcript (${words.length} words). Copy the words exactly from get_transcript; ` +
        "a quote cannot skip words."
    );
  }

  const toRange = (start: number): WordRange => ({ start, end: start + needle.length - 1 });

  if (occurrence !== undefined) {
    if (occurrence > starts.length) {
      throw new Error(`occurrence ${occurrence} requested, but quote appears ${starts.length} time(s).`);
    }
    return toRange(starts[occurrence - 1]);
  }
  if (starts.length === 1) return toRange(starts[0]);

  const listed = starts.slice(0, MAX_LISTED_MATCHES).map((start, i) => {
    const from = Math.max(0, start - MATCH_CONTEXT_WORDS);
    const to = Math.min(words.length, start + needle.length + MATCH_CONTEXT_WORDS);
    const context = words.slice(from, to).map((w) => w.text).join(" ");
    return `  occurrence ${i + 1} (words ${start}-${start + needle.length - 1}): "...${context}..."`;
  });
  throw new Error(
    `quote appears ${starts.length} times. Pass occurrence (1-${starts.length}) or a longer quote.\n${listed.join("\n")}`
  );
}

/** Range and revision for the API from range or quote input; null when neither is given (whole file). */
export async function resolveRange(
  api: AxiosInstance,
  mediaId: string,
  input: RangeInput
): Promise<ResolvedRange | null> {
  const { range, expectedTranscriptRevision, quote, occurrence } = input;

  if (range && quote !== undefined) {
    throw new Error("Pass either range or quote, not both.");
  }
  if (occurrence !== undefined && quote === undefined) {
    throw new Error("occurrence only applies together with quote.");
  }

  if (range) {
    if (range.end < range.start) throw new Error("range.end must be greater than or equal to range.start.");
    if (expectedTranscriptRevision === undefined) {
      throw new Error(
        "expectedTranscriptRevision is required with range. Read it from get_transcript, list_media_labels or list_media_comments."
      );
    }
    return { range, expectedTranscriptRevision };
  }

  if (quote === undefined) {
    if (expectedTranscriptRevision !== undefined) {
      throw new Error("expectedTranscriptRevision only applies together with range or quote.");
    }
    return null;
  }

  const res = await api.get(`/v1/media/transcript/${mediaId}`);
  const media = unwrapData(res.data) ?? {};
  const revision = media.transcriptRevision;
  if (!Number.isInteger(revision)) {
    throw new Error("The server did not return transcriptRevision for this media, so the quote cannot be anchored.");
  }
  const words = transcriptWords(media.insight?.transcript);
  // A revision the agent read earlier is still sent, so the server answers 409 if the transcript moved on since.
  return {
    range: findQuoteRange(words, quote, occurrence),
    expectedTranscriptRevision: expectedTranscriptRevision ?? revision,
  };
}
