-- BFH integration foundation (Validation phase — BFH Academy alpha).
-- Internal-only tables live in the app schema (never PostgREST-exposed);
-- all access is via SECURITY DEFINER RPCs and service_role. RLS is enabled
-- with no policies (deny-all to anon/authenticated; definer/service_role
-- bypass) — the same posture as other app-internal tables.

-- Identity mapping: BFH externalUserId <-> NovaKore user, per org + provider.
create table app.external_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'built_for_her',
  external_user_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  access_level text not null check (access_level in ('member','coach','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_user_id),
  unique (organization_id, provider, user_id)
);
alter table app.external_identities enable row level security;

-- Org-scoped inbound API keys (hashed; raw key shown once at creation time).
create table app.organization_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','revoked')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (organization_id, prefix)
);
alter table app.organization_api_keys enable row level security;

-- Single-use handoff nonce ledger (replay protection).
create table app.bfh_handoff_nonces (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nonce text not null,
  external_user_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now(),
  primary key (organization_id, nonce)
);
alter table app.bfh_handoff_nonces enable row level security;

-- Per-org integration config incl. the handoff HMAC shared secret (sensitive;
-- readable only by service_role / definer functions — no RLS policy granted).
create table app.bfh_integration_config (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  handoff_secret text not null,
  outbound_endpoint_id uuid references public.webhook_endpoints(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.bfh_integration_config enable row level security;

-- Inbound API idempotency ledger (same key -> same stored response).
create table app.bfh_api_idempotency (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  idempotency_key text not null,
  request_kind text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, idempotency_key)
);
alter table app.bfh_api_idempotency enable row level security;

-- SHA-256 hex helper for API-key hashing (pgcrypto lives in extensions).
create or replace function app.bfh_hash_key(p_key text)
returns text language sql immutable
set search_path to ''
as $$ select encode(extensions.digest(p_key, 'sha256'), 'hex'); $$;
