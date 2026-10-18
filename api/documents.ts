import { HttpError, errorResponse, json } from '../lib/http.js';
import { documentIdSchema } from '../lib/schemas.js';
import { createUserClient, getUser, requireUser } from '../lib/supabase.js';

const COLUMNS = 'id, title, filename, size_bytes, chunk_count, is_public, created_at';

/** GET /api/documents          -> the logged-in user's documents
 *  GET /api/documents?demo=1   -> the public demo corpus (no login needed) */
export async function GET(request: Request): Promise<Response> {
  try {
    const demo = new URL(request.url).searchParams.get('demo') === '1';

    if (demo) {
      const { data, error } = await createUserClient()
        .from('amd_documents')
        .select(COLUMNS)
        .eq('is_public', true)
        .order('title');
      if (error) throw new HttpError(500, 'Could not load documents');
      return json({ documents: data });
    }

    const user = await requireUser(request);
    const { data, error } = await user.db
      .from('amd_documents')
      .select(COLUMNS)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new HttpError(500, 'Could not load documents');
    return json({ documents: data });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/documents?id=<uuid> (RLS also guarantees only the owner can delete). */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await getUser(request);
    if (!user) throw new HttpError(401, 'Please log in to continue');

    const parsed = documentIdSchema.safeParse({ id: new URL(request.url).searchParams.get('id') });
    if (!parsed.success) throw new HttpError(400, 'Invalid document id');

    const { data, error } = await user.db
      .from('amd_documents')
      .delete()
      .eq('id', parsed.data.id)
      .eq('user_id', user.id)
      .select('id');
    if (error) throw new HttpError(500, 'Could not delete the document');
    if (!data || data.length === 0) throw new HttpError(404, 'Document not found');
    return json({ deleted: parsed.data.id });
  } catch (err) {
    return errorResponse(err);
  }
}
