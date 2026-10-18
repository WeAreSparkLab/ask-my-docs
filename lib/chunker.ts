/**
 * Heading- and paragraph-aware text chunker.
 *
 * - Splits Markdown/plain text into chunks of roughly `targetTokens` tokens.
 * - Never splits inside a paragraph unless that paragraph alone is too large
 *   (then it falls back to lines, sentences, words, and finally characters).
 * - Fenced code blocks are treated as a single paragraph.
 * - A heading starts a new chunk once the current chunk is "big enough" (`minTokens`),
 *   so tiny sections are merged instead of becoming near-empty chunks.
 * - When a chunk is closed because it is full (not because of a heading), the next chunk
 *   starts with ~`overlapTokens` of trailing text from the previous one.
 *
 * Token counts are estimated (~3.5 chars per token, deliberately a bit pessimistic) so that
 * chunks stay under the 512-token input limit of the gte-small embedding model.
 */

export interface ChunkOptions {
  /** Target chunk size in estimated tokens. */
  targetTokens?: number;
  /** Tokens of trailing context repeated at the start of the next chunk. */
  overlapTokens?: number;
  /** A heading only forces a new chunk if the current one has at least this many tokens. */
  minTokens?: number;
}

export interface Chunk {
  index: number;
  content: string;
  tokens: number;
  metadata: {
    /** Heading path of where the chunk starts, e.g. "Setup > Install". Null if none. */
    heading: string | null;
  };
}

const CHARS_PER_TOKEN = 3.5;

export const DEFAULT_CHUNK_OPTIONS = {
  targetTokens: 500,
  overlapTokens: 50,
  minTokens: 125,
} satisfies Required<ChunkOptions>;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

interface Piece {
  text: string;
  tokens: number;
  isHeading: boolean;
  headingPath: string[];
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;

/** Splits text into paragraph-level blocks, tracking the heading path of each block. */
function parseBlocks(text: string): Piece[] {
  const blocks: Piece[] = [];
  const stack: { level: number; title: string }[] = [];
  const path = () => stack.map((h) => h.title);

  let para: string[] = [];
  let inFence = false;

  const flushPara = () => {
    const joined = para.join('\n').trim();
    para = [];
    if (joined) {
      blocks.push({
        text: joined,
        tokens: estimateTokens(joined),
        isHeading: false,
        headingPath: path(),
      });
    }
  };

  for (const line of text.split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      para.push(line);
      continue;
    }
    if (inFence) {
      para.push(line);
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushPara();
      const level = heading[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, title: heading[2] });
      blocks.push({
        text: line.trim(),
        tokens: estimateTokens(line),
        isHeading: true,
        headingPath: path(),
      });
    } else if (line.trim() === '') {
      flushPara();
    } else {
      para.push(line);
    }
  }
  flushPara();
  return blocks;
}

const SPLITTERS: { re: RegExp; join: string }[] = [
  { re: /\n/, join: '\n' },
  { re: /(?<=[.!?])\s+/, join: ' ' },
  { re: /\s+/, join: ' ' },
];

/** Splits an oversized text into parts of at most `maxTokens`, preferring natural boundaries. */
function splitOversized(text: string, maxTokens: number, level = 0): string[] {
  if (estimateTokens(text) <= maxTokens) return [text];

  if (level >= SPLITTERS.length) {
    const maxChars = Math.max(1, Math.floor(maxTokens * CHARS_PER_TOKEN));
    const out: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) out.push(text.slice(i, i + maxChars));
    return out;
  }

  const { re, join } = SPLITTERS[level];
  const parts = text.split(re).filter((p) => p.length > 0);
  if (parts.length <= 1) return splitOversized(text, maxTokens, level + 1);

  const out: string[] = [];
  let current = '';
  const push = () => {
    if (current) out.push(current);
    current = '';
  };
  for (const part of parts) {
    if (estimateTokens(part) > maxTokens) {
      push();
      out.push(...splitOversized(part, maxTokens, level + 1));
      continue;
    }
    const candidate = current ? current + join + part : part;
    if (estimateTokens(candidate) > maxTokens) {
      push();
      current = part;
    } else {
      current = candidate;
    }
  }
  push();
  return out;
}

/** Returns roughly the last `overlapTokens` of `text`, starting at a word boundary. */
function tailOverlap(text: string, overlapTokens: number): string {
  if (overlapTokens <= 0) return '';
  const maxChars = Math.floor(overlapTokens * CHARS_PER_TOKEN);
  if (text.length <= maxChars) return text;
  const tail = text.slice(text.length - maxChars);
  const firstSpace = tail.search(/\s/);
  const trimmed = firstSpace === -1 ? tail : tail.slice(firstSpace + 1);
  return trimmed.trim();
}

export function chunkText(input: string, options: ChunkOptions = {}): Chunk[] {
  const { targetTokens, overlapTokens, minTokens } = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  if (targetTokens < 2 || overlapTokens < 0 || overlapTokens >= targetTokens) {
    throw new RangeError('overlapTokens must be >= 0 and smaller than targetTokens');
  }

  const text = input.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];

  // Pieces are capped so that (overlap + piece) never exceeds the target.
  // The extra 1 reserves room for the paragraph separator between overlap and first piece.
  const maxPieceTokens = Math.max(1, targetTokens - overlapTokens - 1);
  const pieces: Piece[] = parseBlocks(text).flatMap((block) =>
    splitOversized(block.text, maxPieceTokens).map((part) => ({
      ...block,
      text: part,
      tokens: estimateTokens(part),
    })),
  );

  const chunks: Chunk[] = [];
  let parts: string[] = [];
  let tokens = 0;
  let hasRealContent = false; // false while the buffer holds only overlap text
  let chunkHeading: string[] | null = null;

  const emit = (withOverlap: boolean) => {
    const content = parts.join('\n\n');
    chunks.push({
      index: chunks.length,
      content,
      tokens: estimateTokens(content),
      metadata: { heading: chunkHeading && chunkHeading.length ? chunkHeading.join(' > ') : null },
    });
    const overlap = withOverlap ? tailOverlap(content, overlapTokens) : '';
    parts = overlap ? [overlap] : [];
    tokens = overlap ? estimateTokens(overlap) : 0;
    hasRealContent = false;
    chunkHeading = null;
  };

  for (const piece of pieces) {
    if (hasRealContent) {
      if (piece.isHeading && tokens >= minTokens) {
        emit(false);
      } else if (tokens + 1 + piece.tokens > targetTokens) {
        emit(true);
      }
    }
    if (!hasRealContent) chunkHeading = piece.headingPath;
    tokens += piece.tokens + (parts.length ? 1 : 0);
    parts.push(piece.text);
    hasRealContent = true;
  }
  if (hasRealContent) emit(false);

  return chunks;
}
