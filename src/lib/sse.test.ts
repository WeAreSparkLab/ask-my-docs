import { describe, expect, it } from 'vitest';
import { createSseParser, type SseMessage } from './sse';
import { splitCitations } from './citations';

function collect() {
  const messages: SseMessage[] = [];
  return { messages, parser: createSseParser((m) => messages.push(m)) };
}

describe('createSseParser', () => {
  it('parses complete events', () => {
    const { messages, parser } = collect();
    parser.feed('event: delta\ndata: {"text":"Hi"}\n\nevent: done\ndata: {}\n\n');
    expect(messages).toEqual([
      { event: 'delta', data: '{"text":"Hi"}' },
      { event: 'done', data: '{}' },
    ]);
  });

  it('handles events split across arbitrary chunk boundaries', () => {
    const { messages, parser } = collect();
    const stream = 'event: delta\ndata: {"text":"Hello"}\n\n';
    for (const char of stream) parser.feed(char);
    expect(messages).toEqual([{ event: 'delta', data: '{"text":"Hello"}' }]);
  });

  it('waits for the blank line before emitting', () => {
    const { messages, parser } = collect();
    parser.feed('event: delta\ndata: partial');
    expect(messages).toHaveLength(0);
    parser.feed('\n\n');
    expect(messages).toHaveLength(1);
  });

  it('supports CRLF line endings and defaults the event name', () => {
    const { messages, parser } = collect();
    parser.feed('data: x\r\n\r\n');
    expect(messages).toEqual([{ event: 'message', data: 'x' }]);
  });
});

describe('splitCitations', () => {
  it('turns valid markers into cite parts', () => {
    expect(splitCitations('Use npm [1] and Vite [2].', 2)).toEqual([
      { type: 'text', text: 'Use npm ' },
      { type: 'cite', id: 1 },
      { type: 'text', text: ' and Vite ' },
      { type: 'cite', id: 2 },
      { type: 'text', text: '.' },
    ]);
  });

  it('keeps out-of-range markers as plain text', () => {
    expect(splitCitations('Claim [7]. Real [1].', 2)).toEqual([
      { type: 'text', text: 'Claim [7]. Real ' },
      { type: 'cite', id: 1 },
      { type: 'text', text: '.' },
    ]);
  });

  it('returns a single text part when there are no sources', () => {
    expect(splitCitations('No citations [1] here', 0)).toEqual([
      { type: 'text', text: 'No citations [1] here' },
    ]);
  });

  it('handles adjacent markers', () => {
    const parts = splitCitations('Both [1][2]', 2);
    expect(parts.filter((p) => p.type === 'cite')).toHaveLength(2);
  });
});
