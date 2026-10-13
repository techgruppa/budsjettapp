create table if not exists public.shared_budget (
  id text primary key check (id = 'kitchen'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_budgets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.shared_budget enable row level security;
alter table public.user_budgets enable row level security;

revoke all on public.shared_budget from anon, authenticated, public;
revoke all on public.user_budgets from anon, public;
grant select, insert, update on public.user_budgets to authenticated;

drop policy if exists "Authenticated users can read the shared budget"
  on public.shared_budget;
drop policy if exists "Authenticated users can create the shared budget"
  on public.shared_budget;
drop policy if exists "Authenticated users can update the shared budget"
  on public.shared_budget;

drop policy if exists "Users can read their own budget" on public.user_budgets;
create policy "Users can read their own budget"
  on public.user_budgets
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create their own budget" on public.user_budgets;
create policy "Users can create their own budget"
  on public.user_budgets
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own budget" on public.user_budgets;
create policy "Users can update their own budget"
  on public.user_budgets
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

insert into public.user_budgets (user_id, data)
select users.id, legacy.data
from auth.users as users
cross join public.shared_budget as legacy
where legacy.id = 'kitchen'
  and not exists (select 1 from public.user_budgets)
on conflict (user_id) do nothing;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_budgets'
  ) then
    alter publication supabase_realtime add table public.user_budgets;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shared_budget'
  ) then
    alter publication supabase_realtime drop table public.shared_budget;
  end if;
end
$$;
