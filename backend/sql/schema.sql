create extension if not exists pgcrypto;

create table if not exists profiles (
  session_id text primary key,
  memory_summary text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  title text not null default 'New chat',
  mode text not null default 'chat',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  attachments_json jsonb not null default '[]'::jsonb,
  ocr_text text not null default '',
  mode text not null default 'chat',
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_conversations_session_updated
  on conversations (session_id, updated_at desc);

create index if not exists idx_messages_conversation_created
  on messages (conversation_id, created_at asc);
