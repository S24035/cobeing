-- Migration: add chat_messages.updated_at for /api/sync delta query compatibility
-- Safe to run multiple times.

begin;

alter table public.chat_messages
  add column if not exists updated_at timestamptz;

update public.chat_messages
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.chat_messages
  alter column updated_at set default now();

alter table public.chat_messages
  alter column updated_at set not null;

create index if not exists chat_messages_updated_at_idx
  on public.chat_messages(updated_at);

drop trigger if exists set_chat_messages_updated_at on public.chat_messages;
create trigger set_chat_messages_updated_at
before update on public.chat_messages
for each row execute function public.set_updated_at();

commit;
