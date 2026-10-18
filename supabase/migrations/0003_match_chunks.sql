-- Similarity search. SECURITY INVOKER so RLS applies to the caller.
--   only_public = true  -> search the public demo corpus (works for anon)
--   only_public = false -> search only the caller's own documents
create or replace function public.match_chunks(
  query_embedding     extensions.vector(384),
  match_count         int     default 5,
  only_public         boolean default false,
  filter_document_ids uuid[]  default null,
  min_similarity      float   default 0
)
returns table (
  id             bigint,
  document_id    uuid,
  document_title text,
  chunk_index    int,
  content        text,
  metadata       jsonb,
  similarity     float
)
language sql
stable
security invoker
set search_path = public, extensions
set hnsw.ef_search = 100 -- the index is filtered after the scan; widen the candidate list
as $$
  select
    c.id,
    c.document_id,
    d.title,
    c.chunk_index,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where ((only_public and d.is_public) or (not only_public and c.user_id = auth.uid()))
    and (filter_document_ids is null or c.document_id = any (filter_document_ids))
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.match_chunks(extensions.vector, int, boolean, uuid[], float) from public;
grant execute on function public.match_chunks(extensions.vector, int, boolean, uuid[], float)
  to anon, authenticated;
