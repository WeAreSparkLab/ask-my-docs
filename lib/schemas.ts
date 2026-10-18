import { z } from 'zod';

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_DOCUMENTS_PER_USER = 20;
export const EMBEDDING_DIMENSIONS = 384;
export const MATCH_COUNT = 5;

/** Allowed uploads. The extension decides the type; browser-reported MIME types are unreliable. */
export const ALLOWED_FILE_TYPES = {
  md: 'text/markdown',
  txt: 'text/plain',
  pdf: 'application/pdf',
} as const;

export type AllowedExtension = keyof typeof ALLOWED_FILE_TYPES;

export const chatRequestSchema = z.object({
  question: z.string().trim().min(3, 'Question is too short').max(1000, 'Question is too long'),
  /** true = search the public demo corpus (no login required). */
  demo: z.boolean().default(false),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const documentIdSchema = z.object({ id: z.uuid() });

export const uploadMetaSchema = z
  .object({
    name: z.string().min(1).max(255),
    size: z.number().int().positive().max(MAX_FILE_BYTES, 'File is larger than 2 MB'),
  })
  .transform((file, ctx) => {
    const ext = file.name.includes('.') ? (file.name.split('.').pop()?.toLowerCase() ?? '') : '';
    if (!Object.hasOwn(ALLOWED_FILE_TYPES, ext)) {
      ctx.addIssue({ code: 'custom', message: 'Only .md, .txt and .pdf files are supported' });
      return z.NEVER;
    }
    const extension = ext as AllowedExtension;
    return { ...file, extension, mimeType: ALLOWED_FILE_TYPES[extension] };
  });
export type UploadMeta = z.output<typeof uploadMetaSchema>;

/** Response shape of the `amd-embed` Edge Function. */
export const embedResponseSchema = z.object({
  embeddings: z.array(z.array(z.number()).length(EMBEDDING_DIMENSIONS)),
});
