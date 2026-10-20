export type AnswerPart = { type: 'text'; text: string } | { type: 'cite'; id: number };

/**
 * Splits an answer into text and citation markers like [1] or [2][3].
 * Markers that do not match a real source (id outside 1..sourceCount) stay as plain text,
 * so a hallucinated "[7]" is never rendered as a clickable citation.
 */
export function splitCitations(text: string, sourceCount: number): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const match of text.matchAll(/\[(\d{1,2})\]/g)) {
    const id = Number(match[1]);
    if (id < 1 || id > sourceCount) continue;
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: 'text', text: text.slice(last, start) });
    parts.push({ type: 'cite', id });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}
