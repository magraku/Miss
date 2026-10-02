-- MissPedia — Supabase schema. Run in the SQL editor of your project.
-- Auth uses email magic links (enable Email provider + OTP in Authentication).

create table if not exists public.courses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doc_key    text not null,
  name       text not null,
  lang       text not null default 'en',
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

-- one row per (user, course): client upserts on this pair
create unique index if not exists courses_user_doc_key on public.courses(user_id, doc_key);

alter table public.courses enable row level security;

-- Ownership policies (TO authenticated + uid predicate, WITH CHECK on writes)
create policy "courses_select_own" on public.courses
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "courses_insert_own" on public.courses
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "courses_update_own" on public.courses
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "courses_delete_own" on public.courses
  for delete to authenticated
  using ((select auth.uid()) = user_id);
