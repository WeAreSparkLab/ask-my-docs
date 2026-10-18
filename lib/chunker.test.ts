import { describe, expect, it } from 'vitest';
import { chunkText, estimateTokens } from './chunker';

const sentence = 'The quick brown fox jumps over the lazy dog near the quiet river bank. ';
const longParagraph = sentence.repeat(60).trim(); // ~4,300 chars, well over one chunk

describe('chunkText', () => {
  it('returns no chunks for empty or whitespace-only input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('  \n\n \r\n ')).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    const chunks = chunkText('Hello world.\n\nSecond paragraph.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].content).toBe('Hello world.\n\nSecond paragraph.');
    expect(chunks[0].metadata.heading).toBeNull();
  });

  it('normalises Windows line endings', () => {
    const chunks = chunkText('One.\r\n\r\nTwo.');
    expect(chunks[0].content).toBe('One.\n\nTwo.');
  });

  it('keeps every chunk within the target size and numbers them sequentially', () => {
    const text = Array.from({ length: 30 }, () => longParagraph).join('\n\n');
    const chunks = chunkText(text, { targetTokens: 500, overlapTokens: 50 });
    expect(chunks.length).toBeGreaterThan(5);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.tokens).toBeLessThanOrEqual(500);
      expect(c.content.length).toBeGreaterThan(0);
    });
  });

  it('overlaps consecutive chunks when it has to split inside a section', () => {
    const chunks = chunkText(longParagraph.repeat(3), { targetTokens: 200, overlapTokens: 40 });
    expect(chunks.length).toBeGreaterThan(2);
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1].content.slice(-60);
      const probe = tail.slice(tail.indexOf(' ') + 1, tail.indexOf(' ') + 25);
      expect(chunks[i].content).toContain(probe);
    }
  });

  it('does not lose any words', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `word${i}`);
    const chunks = chunkText(words.join(' '), { targetTokens: 100, overlapTokens: 10 });
    const seen = new Set(chunks.flatMap((c) => c.content.split(/\s+/)));
    for (const w of words) expect(seen.has(w)).toBe(true);
  });

  it('tracks the heading path in chunk metadata', () => {
    const body = (n: number) => sentence.repeat(n).trim();
    const text = [
      '# Guide',
      body(5),
      '## Install',
      body(8),
      '### Windows',
      body(8),
      '## Usage',
      body(8),
    ].join('\n\n');
    const headings = chunkText(text, { targetTokens: 300, overlapTokens: 30, minTokens: 50 }).map(
      (c) => c.metadata.heading,
    );
    expect(headings).toContain('Guide');
    expect(headings).toContain('Guide > Install');
    expect(headings).toContain('Guide > Install > Windows');
    expect(headings).toContain('Guide > Usage');
  });

  it('starts a new chunk at a heading once the current chunk is big enough', () => {
    const text = `# A\n\n${sentence.repeat(6)}\n\n# B\n\n${sentence.repeat(6)}`;
    const chunks = chunkText(text, { minTokens: 50 });
    expect(chunks).toHaveLength(2);
    expect(chunks[1].content.startsWith('# B')).toBe(true);
  });

  it('merges tiny sections instead of emitting near-empty chunks', () => {
    const chunks = chunkText('# A\n\nShort.\n\n# B\n\nAlso short.\n\n# C\n\nTiny.');
    expect(chunks).toHaveLength(1);
  });

  it('does not treat # lines inside code fences as headings or split on blank lines in them', () => {
    const text = '# Title\n\n```bash\n# not a heading\n\nnpm install\n```\n\nAfter.';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain('```bash\n# not a heading\n\nnpm install\n```');
    expect(chunks[0].metadata.heading).toBe('Title');
  });

  it('splits an oversized paragraph at sentence boundaries', () => {
    const chunks = chunkText(longParagraph, { targetTokens: 200, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks.slice(0, -1)) expect(c.content.trimEnd().endsWith('.')).toBe(true);
  });

  it('hard-splits text that has no natural boundaries', () => {
    const chunks = chunkText('x'.repeat(10_000), { targetTokens: 200, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(10);
    chunks.forEach((c) => expect(c.tokens).toBeLessThanOrEqual(200));
  });

  it('rejects invalid options', () => {
    expect(() => chunkText('text', { targetTokens: 100, overlapTokens: 100 })).toThrow(RangeError);
    expect(() => chunkText('text', { targetTokens: 100, overlapTokens: -1 })).toThrow(RangeError);
  });
});

describe('estimateTokens', () => {
  it('is roughly chars / 3.5, rounded up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(35))).toBe(10);
    expect(estimateTokens('a'.repeat(36))).toBe(11);
  });
});
