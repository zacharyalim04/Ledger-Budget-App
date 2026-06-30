-- ===========================================================================
-- Ledger — Supabase schema
-- Run this in your Supabase project: SQL Editor > New query > paste > Run.
-- It creates three tables and Row Level Security so each user only ever
-- reads/writes their own rows. This is what makes budgets private per account.
-- ===========================================================================

create table if not exists categories (
  id        text not null,
  user_id   uuid not null references auth.users(id) on delete cascade,
  name      text not null,
  kind      text not null check (kind in ('income','expense')),
  bucket    text,
  color     text not null,
  primary key (user_id, id)
);

create table if not exists budgets (
  category  text not null,
  user_id   uuid not null references auth.users(id) on delete cascade,
  "limit"   numeric not null default 0,
  primary key (user_id, category)
);

create table if not exists transactions (
  id        text not null,
  user_id   uuid not null references auth.users(id) on delete cascade,
  type      text not null check (type in ('income','expense')),
  category  text not null,
  amount    numeric not null,
  note      text default '',
  date      date not null,
  alloc     jsonb,
  primary key (user_id, id)
);

-- Turn on Row Level Security.
alter table categories  enable row level security;
alter table budgets     enable row level security;
alter table transactions enable row level security;

-- Policies: a user can do anything to rows where user_id = their auth id.
create policy "own categories"  on categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own budgets"     on budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own transactions" on transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
