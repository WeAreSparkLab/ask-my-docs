-- Ask My Docs: core schema.
create extension if not exists vector with schema extensions;

-- user_id is NULL for the public demo corpus (seeded with the service role, never by end users).
create table public.documents (
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
  constraint documents_owner_or_public check (user_id is not null or is_public)
);

create index documents_user_id_idx on public.documents (user_id);
create index documents_public_idx on public.documents (is_public) where is_public;

create table public.chunks (
  id          bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content     text not null check (char_length(content) between 1 and 8000),
  metadata    jsonb not null default '{}'::jsonb,
  embedding   extensions.vector(384) not null,
  created_at  timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index chunks_user_id_idx on public.chunks (user_id);

-- Approximate nearest-neighbour index for cosine distance (gte-small embeddings are normalized).
create index chunks_embedding_hnsw_idx
  on public.chunks using hnsw (embedding extensions.vector_cosine_ops);
