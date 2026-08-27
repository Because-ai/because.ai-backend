create table if not exists learned_adjustments (
  metric text not null,
  segment text not null,
  kind text not null check (kind in ('band_multiplier', 'suppressed_driver')),
  value jsonb not null,
  reason text not null,
  updated_at timestamptz not null default now(),
  primary key (metric, segment, kind)
);
