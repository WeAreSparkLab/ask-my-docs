import { describe, expect, it } from 'vitest';
import { extractText } from './extract';
import { HttpError } from './http';

const enc = (s: string) => new TextEncoder().encode(s);

/** Builds a tiny but valid one-page PDF containing `text`. */
function makePdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return enc(pdf);
}

async function failure(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    return err as HttpError;
  }
  throw new Error('expected the promise to reject');
}

describe('extractText', () => {
  it('reads markdown and text, normalising line endings and stripping a BOM', async () => {
    const out = await extractText(enc('﻿# Title\r\n\r\nSome body text here.'), 'md');
    expect(out).toBe('# Title\n\nSome body text here.');
  });

  it('rejects invalid UTF-8 and binary content with 422', async () => {
    const bad = await failure(extractText(new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]), 'txt'));
    expect(bad.status).toBe(422);
    const nul = await failure(extractText(enc('hello\u0000world, long enough text'), 'txt'));
    expect(nul.status).toBe(422);
  });

  it('rejects files with (almost) no text', async () => {
    expect((await failure(extractText(enc('  \n '), 'md'))).status).toBe(422);
  });

  it('extracts text from a PDF', async () => {
    const out = await extractText(makePdf('Hello from a tiny PDF document'), 'pdf');
    expect(out).toContain('Hello from a tiny PDF document');
  });

  it('rejects a fake PDF (wrong magic bytes) and a corrupt one', async () => {
    const fake = await failure(extractText(enc('just plain text pretending to be a pdf'), 'pdf'));
    expect(fake.status).toBe(422);
    const corrupt = await failure(extractText(enc('%PDF-1.4\nthis is not really a pdf'), 'pdf'));
    expect(corrupt.status).toBe(422);
  });
});
