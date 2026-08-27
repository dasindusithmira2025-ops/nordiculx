-- ============================================================
-- Nordic Lux – Complete Supabase schema (single migration)
-- Run in: Supabase → SQL Editor → New query → Paste & Run
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category text not null,
  price numeric not null,
  original_price numeric,
  image text not null,
  images text,
  badge text,
  rating int default 5,
  country text default 'USA',
  reviews int default 0,
  description text,
  stock int not null,
  sku text not null,
  type text,
  overview text,
  ingredients jsonb,
  benefits jsonb,
  how_to_use jsonb,
  tips jsonb,
  skin_concerns jsonb,
  specification_tags jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(sku)
);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_sku_idx on public.products (sku);

-- Categories
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  count int default 0,
  image text not null,
  description text,
  slug text not null,
  created_at timestamptz default now() not null,
  unique(slug)
);
create index if not exists categories_slug_idx on public.categories (slug);

-- Customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  phone text,
  address text,
  city text,
  country text,
  orders int default 0,
  total_spent numeric default 0,
  created_at timestamptz default now() not null,
  last_order_at timestamptz
);
create index if not exists customers_email_idx on public.customers (email);

-- Invoices (orders)
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  customer_id text,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  shipping_address jsonb,
  items jsonb not null,
  subtotal numeric not null,
  tax numeric not null,
  shipping numeric not null,
  total numeric not null,
  status text not null default 'pending',
  payment_status text not null default 'pending',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(order_number)
);
create index if not exists invoices_order_number_idx on public.invoices (order_number);
create index if not exists invoices_status_idx on public.invoices (status);
create index if not exists invoices_created_at_idx on public.invoices (created_at desc);

-- SEO
create table if not exists public.seo (
  id uuid primary key default gen_random_uuid(),
  page text not null,
  title text,
  description text,
  keywords text,
  og_image text,
  updated_at timestamptz default now() not null,
  unique(page)
);
create index if not exists seo_page_idx on public.seo (page);

-- Admin users (custom table, not Supabase Auth)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  role text not null default 'staff',
  phone text,
  password text,
  is_active boolean default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(email)
);
create index if not exists users_email_idx on public.users (email);

-- Support chat
create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_session_id text not null,
  product_id text,
  product_name text,
  status text not null default 'bot' check (status in ('bot','awaiting_agent','closed')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists support_conversations_status_idx on public.support_conversations (status);
create index if not exists support_conversations_updated_idx on public.support_conversations (updated_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  role text not null check (role in ('bot','user','agent')),
  body text not null,
  sender_name text,
  created_at timestamptz default now() not null
);
create index if not exists support_messages_conversation_idx on public.support_messages (conversation_id);

-- CMS
create table if not exists public.cms_home (
  id uuid primary key default gen_random_uuid(),
  singleton_key text unique not null default 'default',
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);

create table if not exists public.cms_blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text not null,
  date_display text not null,
  read_time_minutes int not null default 5,
  category text,
  image text not null,
  body text[] not null default '{}',
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.cms_pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  layout text not null default 'default',
  published boolean not null default false,
  blocks jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Affiliate program
create table if not exists public.affiliate_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password text not null,
  affiliate_code text not null unique,
  commission_rate numeric default 10 not null,
  status text default 'pending' not null check (status in ('active', 'pending', 'suspended')),
  phone text,
  bio text,
  social_handles jsonb,
  total_clicks int default 0 not null,
  total_conversions int default 0 not null,
  total_earnings numeric default 0 not null,
  pending_earnings numeric default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index if not exists affiliate_members_code_idx on public.affiliate_members (affiliate_code);
create index if not exists affiliate_members_email_idx on public.affiliate_members (email);

create table if not exists public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references public.affiliate_members(id) on delete cascade,
  affiliate_code text not null,
  product_id text,
  product_name text,
  source text default 'link' not null,
  created_at timestamptz default now() not null
);
create index if not exists affiliate_clicks_affiliate_idx on public.affiliate_clicks (affiliate_id);

create table if not exists public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid references public.affiliate_members(id) on delete cascade,
  affiliate_code text not null,
  order_id text not null,
  order_number text not null,
  order_total numeric not null,
  commission numeric not null,
  status text default 'pending' not null check (status in ('pending', 'approved', 'paid')),
  created_at timestamptz default now() not null
);
create index if not exists affiliate_referrals_affiliate_idx on public.affiliate_referrals (affiliate_id);

create table if not exists public.affiliate_settings (
  id int primary key default 1,
  default_commission_rate numeric default 10 not null,
  cookie_days int default 30 not null,
  program_name text default 'Nordic Lux Affiliate Program' not null,
  program_description text default '' not null,
  updated_at timestamptz default now() not null
);
insert into public.affiliate_settings (id) values (1) on conflict (id) do nothing;

-- Row level security (permissive for anon — tighten in production)
alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.seo enable row level security;
alter table public.users enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.cms_home enable row level security;
alter table public.cms_blog_posts enable row level security;
alter table public.cms_pages enable row level security;
alter table public.affiliate_members enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.affiliate_settings enable row level security;

drop policy if exists "Products are viewable by everyone" on public.products;
drop policy if exists "Anyone can insert products" on public.products;
drop policy if exists "Anyone can update products" on public.products;
drop policy if exists "Anyone can delete products" on public.products;
create policy "Products are viewable by everyone" on public.products for select using (true);
create policy "Anyone can insert products" on public.products for insert with check (true);
create policy "Anyone can update products" on public.products for update using (true);
create policy "Anyone can delete products" on public.products for delete using (true);

drop policy if exists "Categories are viewable by everyone" on public.categories;
drop policy if exists "Anyone can manage categories" on public.categories;
create policy "Categories are viewable by everyone" on public.categories for select using (true);
create policy "Anyone can manage categories" on public.categories for all using (true);

drop policy if exists "Customers are viewable by everyone" on public.customers;
drop policy if exists "Anyone can manage customers" on public.customers;
create policy "Customers are viewable by everyone" on public.customers for select using (true);
create policy "Anyone can manage customers" on public.customers for all using (true);

drop policy if exists "Invoices are viewable by everyone" on public.invoices;
drop policy if exists "Anyone can manage invoices" on public.invoices;
create policy "Invoices are viewable by everyone" on public.invoices for select using (true);
create policy "Anyone can manage invoices" on public.invoices for all using (true);

drop policy if exists "SEO is viewable by everyone" on public.seo;
drop policy if exists "Anyone can manage SEO" on public.seo;
create policy "SEO is viewable by everyone" on public.seo for select using (true);
create policy "Anyone can manage SEO" on public.seo for all using (true);

drop policy if exists "Users are viewable by everyone" on public.users;
drop policy if exists "Anyone can manage users" on public.users;
create policy "Users are viewable by everyone" on public.users for select using (true);
create policy "Anyone can manage users" on public.users for all using (true);

drop policy if exists "support_conversations_all" on public.support_conversations;
drop policy if exists "support_messages_all" on public.support_messages;
create policy "support_conversations_all" on public.support_conversations for all using (true) with check (true);
create policy "support_messages_all" on public.support_messages for all using (true) with check (true);

drop policy if exists "cms_home_select" on public.cms_home;
drop policy if exists "cms_home_insert" on public.cms_home;
drop policy if exists "cms_home_update" on public.cms_home;
create policy "cms_home_select" on public.cms_home for select using (true);
create policy "cms_home_insert" on public.cms_home for insert with check (true);
create policy "cms_home_update" on public.cms_home for update using (true);

drop policy if exists "cms_blog_select" on public.cms_blog_posts;
drop policy if exists "cms_blog_insert" on public.cms_blog_posts;
drop policy if exists "cms_blog_update" on public.cms_blog_posts;
drop policy if exists "cms_blog_delete" on public.cms_blog_posts;
create policy "cms_blog_select" on public.cms_blog_posts for select using (true);
create policy "cms_blog_insert" on public.cms_blog_posts for insert with check (true);
create policy "cms_blog_update" on public.cms_blog_posts for update using (true);
create policy "cms_blog_delete" on public.cms_blog_posts for delete using (true);

drop policy if exists "cms_pages_select" on public.cms_pages;
drop policy if exists "cms_pages_insert" on public.cms_pages;
drop policy if exists "cms_pages_update" on public.cms_pages;
drop policy if exists "cms_pages_delete" on public.cms_pages;
create policy "cms_pages_select" on public.cms_pages for select using (true);
create policy "cms_pages_insert" on public.cms_pages for insert with check (true);
create policy "cms_pages_update" on public.cms_pages for update using (true);
create policy "cms_pages_delete" on public.cms_pages for delete using (true);

drop policy if exists "Allow all affiliate_members" on public.affiliate_members;
drop policy if exists "Allow all affiliate_clicks" on public.affiliate_clicks;
drop policy if exists "Allow all affiliate_referrals" on public.affiliate_referrals;
drop policy if exists "Allow all affiliate_settings" on public.affiliate_settings;
create policy "Allow all affiliate_members" on public.affiliate_members for all using (true) with check (true);
create policy "Allow all affiliate_clicks" on public.affiliate_clicks for all using (true) with check (true);
create policy "Allow all affiliate_referrals" on public.affiliate_referrals for all using (true) with check (true);
create policy "Allow all affiliate_settings" on public.affiliate_settings for all using (true) with check (true);

-- updated_at triggers
drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();

drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at before update on public.users for each row execute function public.set_updated_at();

-- Safe column adds for existing databases created from older migrations
alter table public.products add column if not exists images text;
alter table public.products add column if not exists skin_concerns jsonb;
alter table public.products add column if not exists specification_tags jsonb;
alter table public.support_messages add column if not exists sender_name text;

-- Performance indexes for common query patterns
create index if not exists products_created_at_idx on public.products (created_at);
create index if not exists affiliate_clicks_created_at_idx on public.affiliate_clicks (created_at desc);
create index if not exists affiliate_referrals_created_at_idx on public.affiliate_referrals (created_at desc);
