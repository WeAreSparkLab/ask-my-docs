-- Server-side quotas so they hold even if someone bypasses the API and calls PostgREST directly.

-- Max 20 documents per user.
create or replace function public.enforce_document_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is not null
     and (select count(*) from public.documents where user_id = new.user_id) >= 20 then
    raise exception 'Document limit reached (20 per user)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger documents_limit
  before insert on public.documents
  for each row execute function public.enforce_document_limit();

-- Max 3000 chunks per user (~12 MB of storage); checked once per INSERT statement.
create or replace function public.enforce_chunk_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.chunks c
    where c.user_id in (select distinct user_id from new_rows where user_id is not null)
    group by c.user_id
    having count(*) > 3000
  ) then
    raise exception 'Chunk limit reached (3000 per user)' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create trigger chunks_limit
  after insert on public.chunks
  referencing new table as new_rows
  for each statement execute function public.enforce_chunk_limit();
