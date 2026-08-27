create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  finding_id text not null,
  metric text not null,
  segment text not null,
  persona text,
  role text,
  target text not null check (target in ('finding', 'sentence', 'cause', 'action')),
  target_ref text,
  verdict text not null check (verdict in ('accept', 'reject', 'correct')),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_series on feedback (metric, segment, created_at desc);
create index if not exists idx_feedback_finding on feedback (finding_id);
