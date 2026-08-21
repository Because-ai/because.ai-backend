create table if not exists orders (
  row_id integer primary key,
  order_id text not null,
  order_date date not null,
  ship_date date not null,
  ship_mode text not null,
  customer_id text not null,
  customer_name text not null,
  segment text not null,
  country text not null,
  city text not null,
  state text not null,
  postal_code text,
  region text not null,
  product_id text not null,
  category text not null,
  sub_category text not null,
  product_name text not null,
  sales numeric not null,
  quantity integer not null,
  discount numeric not null,
  profit numeric not null
);

create index if not exists idx_orders_region_date on orders (region, order_date);
create index if not exists idx_orders_customer on orders (customer_id);
