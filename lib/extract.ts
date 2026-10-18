import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';
import { HttpError } from './http.js';
import type { AllowedExtension } from './schemas.js';

const MAX_PDF_PAGES = 150;
const MIN_TEXT_CHARS = 20;

function decodeUtf8(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new HttpError(422, 'The file is not valid UTF-8 text');
  }
  if (text.includes('\u0000')) throw new HttpError(422, 'The file looks like a binary file');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip a leading BOM
}

function startsWithPdfMagic(bytes: Uint8Array): boolean {
  // "%PDF-" must appear at the very start (some producers add a few junk bytes; allow 1 KB).
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  if (!startsWithPdfMagic(bytes)) throw new HttpError(422, 'The file is not a valid PDF');
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new HttpError(422, `PDF has too many pages (max ${MAX_PDF_PAGES})`);
    }
    const { text } = await extractPdfText(pdf, { mergePages: false });
    // Keep page breaks as paragraph breaks so the chunker can respect them.
    return text
      .map((page) => page.trim())
      .filter(Boolean)
      .join('\n\n');
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(422, 'Could not read this PDF (it may be corrupted or encrypted)');
  }
}

/** Extracts plain text from an uploaded file's bytes. Validates content, not just the name. */
export async function extractText(bytes: Uint8Array, extension: AllowedExtension): Promise<string> {
  const raw = extension === 'pdf' ? await extractPdf(bytes) : decodeUtf8(bytes);
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  if (text.length < MIN_TEXT_CHARS) {
    throw new HttpError(
      422,
      extension === 'pdf'
        ? 'No text found in this PDF (scanned/image-only PDFs are not supported)'
        : 'The file has no readable text',
    );
  }
  return text;
}
