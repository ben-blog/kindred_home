-- Album drafts for the leader. Additive only.
-- Does not alter, drop, or rewrite any existing table or row.
-- Apply by hand on kinxdred_home after review. Do not apply it from CI.

create table if not exists public.album_submissions (
  id uuid primary key default gen_random_uuid(),
  character text not null check (character ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null check (status in ('drafted', 'generated', 'approved', 'published', 'rejected')),
  draft_path text check (
    draft_path is null
    or draft_path ~ '^drafts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  ),
  final_path text check (
    final_path is null
    or final_path ~ '^[a-z0-9]+(?:-[a-z0-9]+)*/[a-z0-9][a-z0-9_-]{0,80}\.webp$'
  ),
  generated jsonb,
  edited jsonb,
  reviewer_note text check (reviewer_note is null or char_length(reviewer_note) <= 500),
  gallery_item_id text check (
    gallery_item_id is null or gallery_item_id ~ '^[A-Za-z0-9_-]{1,80}$'
  ),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint album_submissions_generated_size check (
    generated is null or octet_length(generated::text) <= 24000
  ),
  constraint album_submissions_edited_size check (
    edited is null or octet_length(edited::text) <= 24000
  )
);

create index if not exists album_submissions_status_created_idx
  on public.album_submissions (status, created_at desc);

alter table public.album_submissions enable row level security;

-- No policies. anon and authenticated have no grants. The server uses the service key.
do $revoke$
declare
  role_name text;
begin
  execute 'revoke all on table public.album_submissions from public';
  foreach role_name in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on table public.album_submissions from %I', role_name);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on table public.album_submissions to service_role;
  end if;
end
$revoke$;

comment on table public.album_submissions is
  'Leader album drafts. gallery_item_id is the public gallery item_id text. Service role only.';
comment on column public.album_submissions.generated is
  'Model caption, felt memory, and the leader note. Replaced when the caption is regenerated.';
comment on column public.album_submissions.edited is
  'Leader edits of the caption. Publish prefers this over generated.';
comment on column public.album_submissions.reviewer_note is
  'Why a submission was rejected.';
