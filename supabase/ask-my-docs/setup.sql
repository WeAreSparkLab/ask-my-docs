-- Ask My Docs: full database setup. Paste into Supabase Dashboard > SQL Editor and run once.
-- Everything is prefixed amd_ so it can live safely in a project shared with other apps.
create extension if not exists vector with schema extensions;
set search_path = public, extensions;

-- ===== 0001_schema =====
-- Ask My Docs: core schema.

-- user_id is NULL for the public demo corpus (seeded with the service role, never by end users).
create table public.amd_documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  filename    text not null check (char_length(filename) between 1 and 255),
  mime_type   text not null check (mime_type in ('text/markdown', 'text/plain', 'application/pdf')),
  size_bytes  integer not null check (size_bytes > 0 and size_bytes <= 2097152), -- 2 MB
  chunk_count integer not null default 0 check (chunk_count >= 0),
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  -- a document is either owned by a user or part of the public corpus
  constraint amd_documents_owner_or_public check (user_id is not null or is_public)
);

create index amd_documents_user_id_idx on public.amd_documents (user_id);
create index amd_documents_public_idx on public.amd_documents (is_public) where is_public;

create table public.amd_chunks (
  id          bigint generated always as identity primary key,
  document_id uuid not null references public.amd_documents (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content     text not null check (char_length(content) between 1 and 8000),
  metadata    jsonb not null default '{}'::jsonb,
  embedding   vector(384) not null,
  created_at  timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index amd_chunks_user_id_idx on public.amd_chunks (user_id);

-- Approximate nearest-neighbour index for cosine distance (gte-small embeddings are normalized).
create index amd_chunks_embedding_hnsw_idx
  on public.amd_chunks using hnsw (embedding vector_cosine_ops);

-- ===== 0002_rls =====
-- Row Level Security: users see/modify only their own rows; everyone can read public rows.
alter table public.amd_documents enable row level security;
alter table public.amd_chunks    enable row level security;

-- documents
create policy amd_documents_select on public.amd_documents
  for select to anon, authenticated
  using (is_public or auth.uid() = user_id);

-- Users can only create private documents for themselves; is_public can never be set by a client.
create policy amd_documents_insert on public.amd_documents
  for insert to authenticated
  with check (auth.uid() = user_id and is_public = false);

create policy amd_documents_delete on public.amd_documents
  for delete to authenticated
  using (auth.uid() = user_id);

-- No UPDATE policy on purpose: documents are immutable (delete + re-upload).

-- chunks
create policy amd_chunks_select on public.amd_chunks
  for select to anon, authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.amd_documents d where d.id = document_id and d.is_public)
  );

create policy amd_chunks_insert on public.amd_chunks
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.amd_documents d
      where d.id = document_id and d.user_id = auth.uid() and not d.is_public
    )
  );

create policy amd_chunks_delete on public.amd_chunks
  for delete to authenticated
  using (auth.uid() = user_id);

-- ===== 0003_match_chunks =====
-- Similarity search. SECURITY INVOKER so RLS applies to the caller.
--   only_public = true  -> search the public demo corpus (works for anon)
--   only_public = false -> search only the caller's own documents
create or replace function public.amd_match_chunks(
  query_embedding     vector(384),
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
  from public.amd_chunks c
  join public.amd_documents d on d.id = c.document_id
  where ((only_public and d.is_public) or (not only_public and c.user_id = auth.uid()))
    and (filter_document_ids is null or c.document_id = any (filter_document_ids))
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.amd_match_chunks(vector, int, boolean, uuid[], float) from public;
grant execute on function public.amd_match_chunks(vector, int, boolean, uuid[], float)
  to anon, authenticated;

-- ===== 0004_limits =====
-- Server-side quotas so they hold even if someone bypasses the API and calls PostgREST directly.

-- Max 20 documents per user.
create or replace function public.amd_enforce_document_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is not null
     and (select count(*) from public.amd_documents where user_id = new.user_id) >= 20 then
    raise exception 'Document limit reached (20 per user)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger amd_documents_limit
  before insert on public.amd_documents
  for each row execute function public.amd_enforce_document_limit();

-- Max 3000 chunks per user (~12 MB of storage); checked once per INSERT statement.
create or replace function public.amd_enforce_chunk_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.amd_chunks c
    where c.user_id in (select distinct user_id from new_rows where user_id is not null)
    group by c.user_id
    having count(*) > 3000
  ) then
    raise exception 'Chunk limit reached (3000 per user)' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create trigger amd_chunks_limit
  after insert on public.amd_chunks
  referencing new table as new_rows
  for each statement execute function public.amd_enforce_chunk_limit();

