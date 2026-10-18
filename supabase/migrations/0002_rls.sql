-- Row Level Security: users see/modify only their own rows; everyone can read public rows.
alter table public.documents enable row level security;
alter table public.chunks    enable row level security;

-- documents
create policy documents_select on public.documents
  for select to anon, authenticated
  using (is_public or auth.uid() = user_id);

-- Users can only create private documents for themselves; is_public can never be set by a client.
create policy documents_insert on public.documents
  for insert to authenticated
  with check (auth.uid() = user_id and is_public = false);

create policy documents_delete on public.documents
  for delete to authenticated
  using (auth.uid() = user_id);

-- No UPDATE policy on purpose: documents are immutable (delete + re-upload).

-- chunks
create policy chunks_select on public.chunks
  for select to anon, authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.documents d where d.id = document_id and d.is_public)
  );

create policy chunks_insert on public.chunks
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.user_id = auth.uid() and not d.is_public
    )
  );

create policy chunks_delete on public.chunks
  for delete to authenticated
  using (auth.uid() = user_id);
