-- Esquema de la aplicación. Idempotente: se puede correr sobre una base vacía
-- o sobre una que ya tiene las tablas (no modifica columnas existentes).
-- Las tablas de sesión (user, session, account, verification) las crea
-- better-auth: ver scripts/db-setup.mjs.

create table if not exists customers (
  id text primary key, user_id text not null, name text not null, phone text, email text,
  notes text, created_at timestamp not null default now());
create table if not exists products (
  id text primary key, user_id text not null, name text not null, category text not null,
  color text, cost_cents integer not null default 0, price_cents integer not null default 0,
  sizes text[] not null default '{}', stock integer not null default 0,
  requested_stock integer not null default 0, active boolean not null default true,
  created_at timestamp not null default now());
create table if not exists orders (
  id text primary key, user_id text not null, customer_id text not null, code text not null,
  status text not null, payment_status text not null, total_cents integer not null,
  paid_cents integer not null default 0, deposit_cents integer not null default 0,
  first_name text, last_name text, size text, block text, professor text, venue text,
  delivery_date text, notes text, created_at timestamp not null default now());
create table if not exists order_items (
  id text primary key, order_id text not null, product_id text not null, size text,
  quantity integer not null, unit_price_cents integer not null, unit_cost_cents integer not null);
create table if not exists payments (
  id text primary key, user_id text not null, order_id text not null, amount_cents integer not null,
  method text not null, paid_at timestamp not null default now(), notes text);
create table if not exists expenses (
  id text primary key, user_id text not null, supplier_id text, batch_id text,
  description text not null, amount_cents integer not null, category text not null default 'factory',
  paid_at timestamp not null default now(), notes text);
create table if not exists cash_accounts (
  id text primary key, user_id text not null, name text not null,
  opening_balance_cents integer not null default 0, active boolean not null default true,
  created_at timestamp not null default now());
create table if not exists cash_movements (
  id text primary key, user_id text not null, account_id text not null, type text not null,
  amount_cents integer not null, description text not null, order_id text, expense_id text,
  occurred_at timestamp not null default now());
create table if not exists supplier_batches (
  id text primary key, user_id text not null, supplier_id text not null, batch_id text not null,
  product_id text not null, quantity integer not null, unit_cost_cents integer not null default 0,
  ordered_at timestamp not null default now());
create table if not exists stock_movements (
  id text primary key, user_id text not null, product_id text not null, batch_id text,
  type text not null, quantity integer not null, notes text, created_at timestamp not null default now());
create table if not exists suppliers (
  id text primary key, user_id text not null, name text not null,
  categories text[] not null default '{}', contact text, active boolean not null default true,
  created_at timestamp not null default now());
create table if not exists production_batches (
  id text primary key, user_id text not null, supplier_id text not null, name text not null,
  status text not null default 'requested', requested_at timestamp not null default now(),
  expected_at text, received_at text, notes text);
create table if not exists batch_orders (
  id text primary key, user_id text not null, batch_id text not null, order_id text not null,
  created_at timestamp not null default now());
create table if not exists stock_receipts (
  id text primary key, user_id text not null, batch_id text not null, idempotency_key text not null,
  received_at timestamp not null default now(), notes text);

-- Tabla de medidas por producto: { columns: ['Ancho', 'Largo'], rows: { M: ['52', '70'] } }
alter table products add column if not exists size_chart jsonb;

create index if not exists customers_user_idx on customers (user_id);
create index if not exists products_user_idx on products (user_id);
create index if not exists orders_user_created_idx on orders (user_id, created_at desc);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists payments_user_idx on payments (user_id, paid_at desc);
create index if not exists payments_order_idx on payments (order_id);
create index if not exists expenses_user_idx on expenses (user_id, paid_at desc);
create index if not exists cash_accounts_user_idx on cash_accounts (user_id);
create index if not exists cash_movements_user_idx on cash_movements (user_id, occurred_at desc);
create index if not exists stock_movements_user_idx on stock_movements (user_id, created_at desc);
create index if not exists suppliers_user_idx on suppliers (user_id);
create index if not exists production_batches_user_idx on production_batches (user_id);
create index if not exists batch_orders_batch_idx on batch_orders (batch_id);
create index if not exists batch_orders_order_idx on batch_orders (order_id);
create index if not exists stock_receipts_key_idx on stock_receipts (user_id, idempotency_key);

-- Stock por talle. El stock previo se conserva como «sin talle», sin adivinar su distribución.
alter table products add column if not exists stock_by_size jsonb;
update products set stock_by_size = jsonb_build_object('', stock) where stock_by_size is null;
alter table products alter column stock_by_size set default '{}'::jsonb;
alter table products alter column stock_by_size set not null;
alter table supplier_batches add column if not exists size text;

alter table stock_movements add column if not exists size text;

-- Pedidos a fábrica: cada línea indica, si corresponde, para qué venta se encargó.
-- Las líneas son lo que se recibe; las ventas vinculadas son solo «para quién».
alter table supplier_batches add column if not exists order_id text;
create index if not exists supplier_batches_batch_idx on supplier_batches (batch_id);
-- Las tandas anteriores guardaban los productos de sus ventas solo en order_items:
-- se copian como líneas una única vez (no se repite si la línea ya existe).
insert into supplier_batches (id, user_id, supplier_id, batch_id, product_id, size, quantity, unit_cost_cents, ordered_at, order_id)
select gen_random_uuid()::text, bo.user_id, pb.supplier_id, bo.batch_id, oi.product_id, oi.size, oi.quantity, oi.unit_cost_cents, bo.created_at, bo.order_id
from batch_orders bo
join production_batches pb on pb.id = bo.batch_id
join order_items oi on oi.order_id = bo.order_id
where not exists (select 1 from supplier_batches sb where sb.batch_id = bo.batch_id and sb.order_id = bo.order_id);
