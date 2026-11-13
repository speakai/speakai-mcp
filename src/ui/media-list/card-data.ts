export const MEDIA_LIST_CARD_URI = "ui://speak/media-list";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export const MEDIA_LIST_CARD_META_KEY = "co.speakai/mediaList";
export const MEDIA_LIST_CARD_MAX_ROWS = 3;
export const MATCH_LINE_MAX_CHARS = 160;

export interface MediaListCardItem {
  mediaId: string;
  name: string;
  createdAt?: string;
  durationSeconds?: number;
  mediaType?: string;
  state?: string;
  matchLine?: string;
}

export interface MediaListCard {
  source: "list_media" | "search_media";
  total: number;
  query?: string;
  items: MediaListCardItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function durationSecondsOf(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  const seconds = value.inSecond;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function firstMatchLine(sentences: unknown): string | undefined {
  if (!Array.isArray(sentences)) return undefined;
  const text = isRecord(sentences[0]) ? nonEmptyString(sentences[0].text) : undefined;
  if (!text) return undefined;
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > MATCH_LINE_MAX_CHARS ? `${line.slice(0, MATCH_LINE_MAX_CHARS - 1)}…` : line;
}

function toCardItem(raw: unknown, withMatchLine: boolean): MediaListCardItem | undefined {
  if (!isRecord(raw)) return undefined;
  const mediaId = nonEmptyString(raw.mediaId);
  const name = nonEmptyString(raw.name);
  if (!mediaId || !name) return undefined;

  const item: MediaListCardItem = { mediaId, name };
  const createdAt = nonEmptyString(raw.createdAt);
  if (createdAt) item.createdAt = createdAt;
  const durationSeconds = durationSecondsOf(raw.duration);
  if (durationSeconds !== undefined) item.durationSeconds = durationSeconds;
  const mediaType = nonEmptyString(raw.mediaType);
  if (mediaType) item.mediaType = mediaType;
  const state = nonEmptyString(raw.state);
  if (state) item.state = state;
  if (withMatchLine) {
    const matchLine = firstMatchLine(raw.sentences);
    if (matchLine) item.matchLine = matchLine;
  }
  return item;
}

function toCard(
  source: MediaListCard["source"],
  rows: unknown,
  total: number,
  query?: string
): MediaListCard | undefined {
  if (!Array.isArray(rows)) return undefined;
  const items: MediaListCardItem[] = [];
  for (const row of rows) {
    if (items.length === MEDIA_LIST_CARD_MAX_ROWS) break;
    const item = toCardItem(row, source === "search_media");
    if (item) items.push(item);
  }
  if (!items.length) return undefined;
  const card: MediaListCard = { source, total: Math.max(total, items.length), items };
  if (query) card.query = query;
  return card;
}

export function buildListMediaCard(body: unknown): MediaListCard | undefined {
  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  if (!data) return undefined;
  const total = typeof data.totalCount === "number" ? data.totalCount : 0;
  return toCard("list_media", data.mediaList, total);
}

export function buildSearchMediaCard(body: unknown, query: string): MediaListCard | undefined {
  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  if (!data || !Array.isArray(data.media)) return undefined;
  return toCard("search_media", data.media, data.media.length, query);
}

export function mediaListCardResultMeta(card: MediaListCard | undefined): Record<string, unknown> | undefined {
  return card ? { [MEDIA_LIST_CARD_META_KEY]: card } : undefined;
}

export const mediaListCardToolMeta = {
  ui: { resourceUri: MEDIA_LIST_CARD_URI },
  "ui/resourceUri": MEDIA_LIST_CARD_URI,
} as const;
