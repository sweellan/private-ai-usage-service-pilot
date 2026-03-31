create extension if not exists pgcrypto;

create schema if not exists ai_usage;

create type ai_usage.principal_role as enum ('admin', 'member');

create table if not exists ai_usage.projects (
  slug text primary key,
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists ai_usage.principals (
  principal_id text primary key,
  project_slug text not null references ai_usage.projects(slug) on delete cascade,
  member_id text not null,
  member_name text not null,
  team text not null default '',
  email text not null default '',
  role ai_usage.principal_role not null default 'member',
  token_hash text not null unique,
  token_hint text not null,
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (project_slug, member_id)
);

create table if not exists ai_usage.usage_reports (
  report_id uuid primary key default gen_random_uuid(),
  project_slug text not null references ai_usage.projects(slug) on delete cascade,
  principal_id text not null references ai_usage.principals(principal_id) on delete restrict,
  member_id text not null,
  member_name text not null,
  team text not null default '',
  hostname text,
  client_version text,
  uploaded_at timestamptz not null default timezone('utc', now()),
  report_generated_at timestamptz,
  raw_hash text not null,
  report jsonb not null,
  summary jsonb not null
);

create table if not exists ai_usage.upload_events (
  event_id uuid primary key default gen_random_uuid(),
  project_slug text not null references ai_usage.projects(slug) on delete cascade,
  principal_id text not null references ai_usage.principals(principal_id) on delete restrict,
  member_id text not null,
  event_type text not null,
  created_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_ai_usage_principals_project_role
  on ai_usage.principals (project_slug, role)
  where revoked_at is null;

create index if not exists idx_ai_usage_usage_reports_project_member_uploaded_at
  on ai_usage.usage_reports (project_slug, member_id, uploaded_at desc);

create index if not exists idx_ai_usage_upload_events_project_member_created_at
  on ai_usage.upload_events (project_slug, member_id, created_at desc);

create or replace view ai_usage.latest_usage_reports as
select distinct on (project_slug, member_id)
  report_id,
  project_slug,
  principal_id,
  member_id,
  member_name,
  team,
  hostname,
  client_version,
  uploaded_at,
  report_generated_at,
  raw_hash,
  report,
  summary
from ai_usage.usage_reports
order by project_slug, member_id, uploaded_at desc, report_id desc;

alter table ai_usage.projects enable row level security;
alter table ai_usage.principals enable row level security;
alter table ai_usage.usage_reports enable row level security;
alter table ai_usage.upload_events enable row level security;

revoke all on schema ai_usage from anon, authenticated;
revoke all on all tables in schema ai_usage from anon, authenticated;
revoke all on all sequences in schema ai_usage from anon, authenticated;

comment on schema ai_usage is 'Private AI usage data plane. End users should not query these tables directly.';
comment on table ai_usage.principals is 'One principal, one private access token, one role.';
comment on view ai_usage.latest_usage_reports is 'Latest append-only report per member for service-side aggregation.';
