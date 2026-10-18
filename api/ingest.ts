import { chunkText } from '../lib/chunker.js';
import { embedTexts } from '../lib/embed.js';
import { extractText } from '../lib/extract.js';
import { HttpError, errorResponse, getClientIp, json } from '../lib/http.js';
import { limitIngest } from '../lib/ratelimit.js';
import { MAX_DOCUMENTS_PER_USER, MAX_FILE_BYTES, uploadMetaSchema } from '../lib/schemas.js';
import { requireUser } from '../lib/supabase.js';

/** ~100k tokens. Keeps embedding time inside the function's time limit. */
const MAX_CHUNKS_PER_DOCUMENT = 300;
const INSERT_BATCH = 100;
/** Multipart overhead allowance on top of the 2 MB file limit. */
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;

function titleFromFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const withoutExt = clean.replace(/\.[^.]+$/, '').trim();
  return (withoutExt || clean).slice(0, 200);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    await limitIngest({ ip: getClientIp(request), userId: user.id });

    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'File is larger than 2 MB');

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new HttpError(400, 'Expected a multipart form upload');
    }
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Missing "file" field');

    const meta = uploadMetaSchema.safeParse({ name: file.name, size: file.size });
    if (!meta.success) {
      throw new HttpError(
        meta.error.issues[0]?.message.includes('2 MB') ? 413 : 415,
        meta.error.issues[0]?.message ?? 'Invalid file',
      );
    }
    const { extension, mimeType } = meta.data;

    // Friendly pre-check; the database trigger enforces the same limit authoritatively.
    const { count, error: countError } = await user.db
      .from('amd_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if (countError) throw new HttpError(500, 'Could not check your document quota');
    if ((count ?? 0) >= MAX_DOCUMENTS_PER_USER) {
      throw new HttpError(
        409,
        `Document limit reached (${MAX_DOCUMENTS_PER_USER}). Delete one first.`,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_FILE_BYTES) throw new HttpError(413, 'File is larger than 2 MB');

    const text = await extractText(bytes, extension);
    const chunks = chunkText(text);
    if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
      throw new HttpError(
        422,
        `Document is too long (${chunks.length} sections, max ${MAX_CHUNKS_PER_DOCUMENT}). Try a shorter file.`,
      );
    }

    const embeddings = await embedTexts(chunks.map((c) => c.content));

    const title = titleFromFilename(file.name);
    const { data: doc, error: docError } = await user.db
      .from('amd_documents')
      .insert({
        user_id: user.id,
        title,
        filename: file.name.slice(0, 255),
        mime_type: mimeType,
        size_bytes: file.size,
        chunk_count: chunks.length,
      })
      .select('id')
      .single();
    if (docError || !doc) {
      if (docError?.message.includes('Document limit')) {
        throw new HttpError(
          409,
          `Document limit reached (${MAX_DOCUMENTS_PER_USER}). Delete one first.`,
        );
      }
      throw new HttpError(500, 'Could not save the document');
    }

    const rows = chunks.map((c, i) => ({
      document_id: doc.id,
      user_id: user.id,
      chunk_index: c.index,
      content: c.content,
      metadata: c.metadata,
      embedding: embeddings[i],
    }));

    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const { error } = await user.db.from('amd_chunks').insert(rows.slice(i, i + INSERT_BATCH));
      if (error) {
        // Roll back: deleting the document cascades to any chunks already inserted.
        await user.db.from('amd_documents').delete().eq('id', doc.id);
        if (error.message.includes('Chunk limit')) {
          throw new HttpError(409, 'You have reached your storage limit. Delete a document first.');
        }
        throw new HttpError(500, 'Could not save the document');
      }
    }

    return json({ id: doc.id, title, chunkCount: chunks.length }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
