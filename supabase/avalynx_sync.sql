create table if not exists public.avalynx_user_sync (
  user_sub text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.avalynx_user_sync enable row level security;

-- The Avalynx backend accesses this table with SUPABASE_SERVICE_ROLE_KEY.
-- Do not expose direct anonymous client access to this table.
