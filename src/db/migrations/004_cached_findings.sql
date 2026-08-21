create extension if not exists pgcrypto;

create table if not exists cached_findings (
  id uuid primary key default gen_random_uuid(),
  metric text not null,
  segment text not null,
  period text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cached_findings_lookup on cached_findings (metric, segment, created_at desc);
