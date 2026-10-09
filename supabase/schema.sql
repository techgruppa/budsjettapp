create table if not exists public.shared_budget (
  id text primary key check (id = 'kitchen'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.shared_budget enable row level security;

revoke all on public.shared_budget from anon, public;
grant select, insert, update on public.shared_budget to authenticated;

drop policy if exists "Authenticated users can read the shared budget"
  on public.shared_budget;
create policy "Authenticated users can read the shared budget"
  on public.shared_budget
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create the shared budget"
  on public.shared_budget;
create policy "Authenticated users can create the shared budget"
  on public.shared_budget
  for insert
  to authenticated
  with check (id = 'kitchen');

drop policy if exists "Authenticated users can update the shared budget"
  on public.shared_budget;
create policy "Authenticated users can update the shared budget"
  on public.shared_budget
  for update
  to authenticated
  using (id = 'kitchen')
  with check (id = 'kitchen');

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shared_budget'
  ) then
    alter publication supabase_realtime add table public.shared_budget;
  end if;
end
$$;
