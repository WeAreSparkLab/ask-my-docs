import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, chatRequestSchema, uploadMetaSchema } from './schemas';

describe('chatRequestSchema', () => {
  it('trims and defaults demo to false', () => {
    expect(chatRequestSchema.parse({ question: '  What is this?  ' })).toEqual({
      question: 'What is this?',
      demo: false,
    });
  });
  it('rejects short, long and non-string questions', () => {
    expect(chatRequestSchema.safeParse({ question: 'hi' }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ question: 'x'.repeat(1001) }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ question: 42 }).success).toBe(false);
  });
});

describe('uploadMetaSchema', () => {
  it('accepts md, txt and pdf and derives the MIME type from the extension', () => {
    expect(uploadMetaSchema.parse({ name: 'README.MD', size: 100 }).mimeType).toBe('text/markdown');
    expect(uploadMetaSchema.parse({ name: 'a.txt', size: 1 }).mimeType).toBe('text/plain');
    expect(uploadMetaSchema.parse({ name: 'a.b.pdf', size: 1 }).mimeType).toBe('application/pdf');
  });
  it('rejects other types, including double extensions that end in a bad one', () => {
    expect(uploadMetaSchema.safeParse({ name: 'a.exe', size: 1 }).success).toBe(false);
    expect(uploadMetaSchema.safeParse({ name: 'a.pdf.exe', size: 1 }).success).toBe(false);
    expect(uploadMetaSchema.safeParse({ name: 'noextension', size: 1 }).success).toBe(false);
    expect(uploadMetaSchema.safeParse({ name: 'constructor', size: 1 }).success).toBe(false);
  });
  it('enforces the size limit', () => {
    expect(uploadMetaSchema.safeParse({ name: 'a.md', size: MAX_FILE_BYTES }).success).toBe(true);
    expect(uploadMetaSchema.safeParse({ name: 'a.md', size: MAX_FILE_BYTES + 1 }).success).toBe(
      false,
    );
    expect(uploadMetaSchema.safeParse({ name: 'a.md', size: 0 }).success).toBe(false);
  });
});
