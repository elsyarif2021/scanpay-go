-- Skema awal Postgres. Runtime demo menggunakan SQLite.
begin;
create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 name text not null check (length(name) between 1 and 100),
 created_at timestamptz not null default now()
);
create table public.merchants (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles,
 name text not null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.stores (
 id uuid primary key default gen_random_uuid(),
 merchant_id uuid not null references public.merchants,
 name text not null,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.store_members (
 store_id uuid references public.stores on delete cascade,
 profile_id uuid references public.profiles on delete cascade,
 role text not null check (role in ('cashier','manager')),
 primary key (store_id,profile_id)
);
create table public.categories (
 id uuid primary key default gen_random_uuid(),
 merchant_id uuid not null references public.merchants,
 name text not null,
 unique (merchant_id,name)
);
create table public.products (
 id uuid primary key default gen_random_uuid(),
 merchant_id uuid not null references public.merchants,
 barcode text not null,
 name text not null,
 unique (merchant_id,barcode),
 unique (id,merchant_id)
);
alter table public.stores add unique (id,merchant_id);
create table public.store_products (
 store_id uuid,
 product_id uuid,
 merchant_id uuid not null,
 price integer not null check (price > 0),
 primary key (store_id,product_id),
 foreign key (store_id,merchant_id) references public.stores(id,merchant_id),
 foreign key (product_id,merchant_id) references public.products(id,merchant_id)
);
create table public.inventory (
 store_id uuid,
 product_id uuid,
 available integer not null check (available >= 0),
 primary key (store_id,product_id),
 foreign key (store_id,product_id) references public.store_products
);
create table public.orders (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.profiles,
 store_id uuid not null references public.stores,
 idem uuid not null,
 status text not null default 'pending_payment' check (status in ('draft','pending_payment','awaiting_verification','completed','cancelled','expired')),
 payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','failed','expired','refunded','partially_refunded')),
 verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
 settlement_status text not null default 'pending' check (settlement_status in ('pending','processing','settled','failed')),
 total bigint not null check (total >= 0),
 commission bigint not null check (commission between 0 and total),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 unique (customer_id,idem),
 unique (id,store_id)
);
create index orders_store_status on public.orders(store_id,status,created_at desc);
create index stores_merchant on public.stores(merchant_id);
create table public.order_items (
 order_id uuid,
 store_id uuid not null,
 product_id uuid,
 product_name text not null,
 quantity integer not null check (quantity between 1 and 99),
 unit_price integer not null check (unit_price > 0),
 primary key (order_id,product_id),
 foreign key (order_id,store_id) references public.orders(id,store_id) on delete cascade,
 foreign key (store_id,product_id) references public.store_products
);
create table public.stock_reservations (
 order_id uuid,
 store_id uuid not null,
 product_id uuid,
 amount integer not null check (amount > 0),
 expires_at timestamptz not null,
 primary key (order_id,product_id),
 foreign key (order_id,store_id) references public.orders(id,store_id) on delete cascade,
 foreign key (store_id,product_id) references public.inventory
);
create table public.payments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders,
 provider text not null,
 external_id text,
 amount bigint not null check (amount > 0),
 created_at timestamptz not null default now(),
 unique (provider,external_id)
);
create table public.payment_webhooks (
 provider text not null,
 event_id text not null,
 received_at timestamptz not null default now(),
 primary key (provider,event_id)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references public.profiles,
 action text not null,
 entity_id uuid,
 created_at timestamptz not null default now()
);
create schema if not exists scanpay_private;
revoke all on schema scanpay_private from public;
grant usage on schema scanpay_private to authenticated;
create function scanpay_private.staff_access(branch uuid)
 returns boolean language sql stable security definer set search_path = ''
 as $$
   select exists(select 1 from public.store_members m where m.store_id=branch and m.profile_id=(select auth.uid()))
     or exists(select 1 from public.stores s join public.merchants t on t.id=s.merchant_id where s.id=branch and t.owner_id=(select auth.uid()))
 $$;
revoke all on function scanpay_private.staff_access(uuid) from public;
grant execute on function scanpay_private.staff_access(uuid) to authenticated;
do $$
 declare entity text;
 begin
 foreach entity in array array['profiles','merchants','stores','store_members','categories','products','store_products','inventory','orders','order_items','stock_reservations','payments','payment_webhooks','audit_logs'] loop
  execute format('alter table public.%I enable row level security',entity);
  execute format('revoke all on public.%I from anon, authenticated',entity);
 end loop;
 end
$$;
grant select on public.profiles,public.stores,public.merchants,public.orders,public.order_items to authenticated;
create policy own_profile on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy readable_merchants on public.merchants for select to authenticated using (active or owner_id=(select auth.uid()));
create policy readable_stores on public.stores for select to authenticated using (
 (active and exists(select 1 from public.merchants m where m.id=merchant_id and m.active))
 or scanpay_private.staff_access(id)
);
create policy readable_orders on public.orders for select to authenticated using (
 customer_id=(select auth.uid()) or scanpay_private.staff_access(store_id)
);
create policy readable_lines on public.order_items for select to authenticated using (
 exists(select 1 from public.orders o where o.id=order_id)
);
commit;
