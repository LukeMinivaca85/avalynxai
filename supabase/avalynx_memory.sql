create extension if not exists pgcrypto;
create table if not exists public.avalynx_memories (
 id uuid primary key default gen_random_uuid(), user_id text not null,
 scope text not null check (scope in ('user','project','temporary')), project_id text,
 content text not null, tags text[] not null default '{}', importance smallint not null default 5 check (importance between 0 and 10),
 source_chat_id text, expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists avalynx_memories_user_idx on public.avalynx_memories(user_id);
create index if not exists avalynx_memories_scope_idx on public.avalynx_memories(user_id,scope);
create index if not exists avalynx_memories_project_idx on public.avalynx_memories(user_id,project_id);
create index if not exists avalynx_memories_expiry_idx on public.avalynx_memories(expires_at);
alter table public.avalynx_memories enable row level security;
