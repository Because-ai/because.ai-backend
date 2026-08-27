create table if not exists marketing_spend (
  id bigint generated always as identity primary key,
  spend_date date not null,
  region text not null,
  channel text not null,
  spend numeric not null
);

create index if not exists idx_marketing_spend_region_date on marketing_spend (region, spend_date);
