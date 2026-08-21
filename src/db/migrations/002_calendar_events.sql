create table if not exists calendar_events (
  id text primary key,
  label text not null,
  region text,
  starts_on date not null,
  ends_on date not null,
  kind text not null check (kind in ('holiday', 'promo', 'launch'))
);

create index if not exists idx_calendar_events_dates on calendar_events (starts_on, ends_on);
