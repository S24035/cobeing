-- Supabase schema for CoBeing (Phase 0)
-- Apply in Supabase SQL editor

create extension if not exists "pgcrypto";

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  ai_name text,
  persona text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- tasks
create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  priority int,
  due_at timestamptz,
  category text,
  status text,
  status_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists tasks_due_at_idx on public.tasks(due_at);
create index if not exists tasks_updated_at_idx on public.tasks(updated_at);

create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- task templates
create table if not exists public.task_templates (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists task_templates_user_id_idx on public.task_templates(user_id);
create index if not exists task_templates_updated_at_idx on public.task_templates(updated_at);

create trigger set_task_templates_updated_at
before update on public.task_templates
for each row execute function public.set_updated_at();

-- diary entries
create table if not exists public.diary_entries (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key text not null, -- YYYY-MM-DD
  mood int,
  line text,
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists diary_entries_user_id_idx on public.diary_entries(user_id);
create index if not exists diary_entries_date_idx on public.diary_entries(date_key);
create index if not exists diary_entries_updated_at_idx on public.diary_entries(updated_at);

create trigger set_diary_entries_updated_at
before update on public.diary_entries
for each row execute function public.set_updated_at();

-- calendar events
create table if not exists public.calendar_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key text not null, -- YYYY-MM-DD
  title text not null,
  start_time text,
  end_time text,
  note text,
  reflect_to_chat boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists calendar_events_user_id_idx on public.calendar_events(user_id);
create index if not exists calendar_events_date_idx on public.calendar_events(date_key);
create index if not exists calendar_events_updated_at_idx on public.calendar_events(updated_at);

create trigger set_calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

-- chat messages (limited retention by app rules)
create table if not exists public.chat_messages (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists chat_messages_user_id_idx on public.chat_messages(user_id);
create index if not exists chat_messages_created_at_idx on public.chat_messages(created_at);
create index if not exists chat_messages_updated_at_idx on public.chat_messages(updated_at);

create trigger set_chat_messages_updated_at
before update on public.chat_messages
for each row execute function public.set_updated_at();

-- subscription status
create table if not exists public.subscription_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'inactive',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create trigger set_subscription_status_updated_at
before update on public.subscription_status
for each row execute function public.set_updated_at();

-- usage counters (AI usage)
create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_key text not null, -- YYYY-MM
  ai_calls_used int not null default 0,
  ai_tokens_used int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_key)
);

create trigger set_usage_counters_updated_at
before update on public.usage_counters
for each row execute function public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_templates enable row level security;
alter table public.diary_entries enable row level security;
alter table public.calendar_events enable row level security;
alter table public.chat_messages enable row level security;
alter table public.subscription_status enable row level security;
alter table public.usage_counters enable row level security;

-- policies: profiles
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- policies: tasks
create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

-- policies: task_templates
create policy "task_templates_select_own" on public.task_templates
  for select using (auth.uid() = user_id);
create policy "task_templates_insert_own" on public.task_templates
  for insert with check (auth.uid() = user_id);
create policy "task_templates_update_own" on public.task_templates
  for update using (auth.uid() = user_id);
create policy "task_templates_delete_own" on public.task_templates
  for delete using (auth.uid() = user_id);

-- policies: diary_entries
create policy "diary_entries_select_own" on public.diary_entries
  for select using (auth.uid() = user_id);
create policy "diary_entries_insert_own" on public.diary_entries
  for insert with check (auth.uid() = user_id);
create policy "diary_entries_update_own" on public.diary_entries
  for update using (auth.uid() = user_id);
create policy "diary_entries_delete_own" on public.diary_entries
  for delete using (auth.uid() = user_id);

-- policies: calendar_events
create policy "calendar_events_select_own" on public.calendar_events
  for select using (auth.uid() = user_id);
create policy "calendar_events_insert_own" on public.calendar_events
  for insert with check (auth.uid() = user_id);
create policy "calendar_events_update_own" on public.calendar_events
  for update using (auth.uid() = user_id);
create policy "calendar_events_delete_own" on public.calendar_events
  for delete using (auth.uid() = user_id);

-- policies: chat_messages
create policy "chat_messages_select_own" on public.chat_messages
  for select using (auth.uid() = user_id);
create policy "chat_messages_insert_own" on public.chat_messages
  for insert with check (auth.uid() = user_id);
create policy "chat_messages_update_own" on public.chat_messages
  for update using (auth.uid() = user_id);
create policy "chat_messages_delete_own" on public.chat_messages
  for delete using (auth.uid() = user_id);

-- policies: subscription_status
create policy "subscription_status_select_own" on public.subscription_status
  for select using (auth.uid() = user_id);
create policy "subscription_status_insert_own" on public.subscription_status
  for insert with check (auth.uid() = user_id);
create policy "subscription_status_update_own" on public.subscription_status
  for update using (auth.uid() = user_id);

-- policies: usage_counters
create policy "usage_counters_select_own" on public.usage_counters
  for select using (auth.uid() = user_id);
create policy "usage_counters_insert_own" on public.usage_counters
  for insert with check (auth.uid() = user_id);
create policy "usage_counters_update_own" on public.usage_counters
  for update using (auth.uid() = user_id);
