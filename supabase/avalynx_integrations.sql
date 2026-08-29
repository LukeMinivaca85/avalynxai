create table if not exists public.avalynx_integration_connections (
  user_sub text not null,
  provider text not null,
  access_token_enc text not null,
  refresh_token_enc text,
  token_type text not null default 'Bearer',
  scope text not null default '',
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_sub, provider)
);

create index if not exists avalynx_integration_connections_user_idx
  on public.avalynx_integration_connections(user_sub);

alter table public.avalynx_integration_connections enable row level security;
-- This table is server-only. The Avalynx backend accesses it with SUPABASE_SERVICE_ROLE_KEY.
-- Do not create anon/client policies for token rows.
