-- =============================================================
-- VELOUR — Supabase schema
-- Run this whole file ONCE in the Supabase SQL Editor:
-- Dashboard → SQL Editor → "New query" → paste this whole file → Run
-- =============================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- PRODUCTS
-- ---------------------------------------------------------------
create table if not exists products (
  id text primary key,
  name text not null,
  category text not null,
  price numeric not null,
  shades text[] default '{}',
  description text,
  color_from text,
  color_to text,
  icon text,
  created_at timestamptz default now()
);

alter table products enable row level security;

create policy "Products are publicly readable"
  on products for select
  using (true);

-- ---------------------------------------------------------------
-- PROFILES  (one row per signed-up user, linked to Supabase Auth)
-- ---------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row the moment someone signs up.
-- Also grants admin automatically to admin@velour.com, matching
-- the behavior of the earlier localStorage demo.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, is_admin)
  values (
    new.id,
    new.raw_user_meta_data ->> 'name',
    new.email,
    (lower(new.email) = 'admin@velour.com')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Now that profiles exists, restrict product writes to admins only
create policy "Only admins can insert products"
  on products for insert
  with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "Only admins can update products"
  on products for update
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "Only admins can delete products"
  on products for delete
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- ---------------------------------------------------------------
-- CART ITEMS
-- ---------------------------------------------------------------
create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  product_id text references products(id) on delete cascade not null,
  shade text,
  qty int not null default 1,
  created_at timestamptz default now()
);

alter table cart_items enable row level security;

create policy "Users manage their own cart"
  on cart_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- WISHLIST ITEMS
-- ---------------------------------------------------------------
create table if not exists wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  product_id text references products(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (user_id, product_id)
);

alter table wishlist_items enable row level security;

create policy "Users manage their own wishlist"
  on wishlist_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- REVIEWS
-- ---------------------------------------------------------------
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  product_id text references products(id) on delete cascade not null,
  user_name text not null,
  rating int not null check (rating between 1 and 5),
  text text,
  created_at timestamptz default now()
);

alter table reviews enable row level security;

create policy "Reviews are publicly readable"
  on reviews for select
  using (true);

create policy "Logged-in users can post reviews"
  on reviews for insert
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------
create table if not exists orders (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  shipping jsonb,
  items jsonb,
  total numeric not null,
  status text default 'Confirmed',
  created_at timestamptz default now()
);

alter table orders enable row level security;

create policy "Users see their own orders, admins see all"
  on orders for select
  using (auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "Users create their own orders"
  on orders for insert
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- APPOINTMENTS  (booking form — open to anyone, even signed out)
-- ---------------------------------------------------------------
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service text,
  date date,
  time time,
  email text,
  phone text,
  notes text,
  created_at timestamptz default now()
);

alter table appointments enable row level security;

create policy "Anyone can request an appointment"
  on appointments for insert
  with check (true);

create policy "Only admins can view appointment requests"
  on appointments for select
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- ---------------------------------------------------------------
-- SEED DATA  (the 12 starter products)
-- ---------------------------------------------------------------
insert into products (id, name, category, price, shades, description, color_from, color_to, icon) values
('lip-bordeaux', 'Velours Bullet — Bordeaux', 'lips', 38, '{Bordeaux,Garnet,Merlot}', 'A blackened-red velvet lipstick with a soft-matte finish. Long-wear, non-drying.', '#7A1830', '#2B0512', 'lips'),
('lip-fig', 'Wine Stain Tint — Fig', 'lips', 29, '{Fig,Rose}', 'A sheer, buildable lip and cheek stain in muted fig. Dries down to a natural flush.', '#B8863F', '#4A0E1F', 'lips'),
('lip-garnet', 'Gilded Gloss — Garnet', 'lips', 26, '{Garnet,Champagne}', 'High-shine lacquer gloss layered over a fine gold shimmer.', '#6B1128', '#150508', 'lips'),
('face-foundation', 'Velvet Skin Foundation', 'face', 52, '{Ivoire,Sable,Noisette,Acajou}', 'Buildable medium-to-full coverage with a soft satin finish, 24 shades.', '#D4AF6A', '#7A1830', 'face'),
('face-highlighter', 'Gold-Cast Highlighter', 'face', 34, '{"Molten Gold"}', 'A pressed powder highlighter with a warm, molten-gold sheen.', '#E8CD94', '#B8863F', 'face'),
('face-blush', 'Wine Flush Blush', 'face', 31, '{"Bordeaux Flush","Rose Fig"}', 'A cream-to-powder blush in a dusty bordeaux, mimics a natural warmed flush.', '#7A1830', '#B8863F', 'face'),
('eyes-palette', 'Smoked Bordeaux Palette', 'eyes', 58, '{"Bordeaux Edition"}', 'Nine wine, bronze and gold eyeshadows in matte and metallic finishes.', '#4A0E1F', '#B8863F', 'eyes'),
('eyes-liner', 'Gilded Liquid Liner', 'eyes', 27, '{"Wine Black"}', 'Fine-tip precision liner in deep wine-black with a subtle gold shimmer edge.', '#150508', '#7A1830', 'eyes'),
('eyes-mascara', 'Velour Lash — Volume', 'eyes', 24, '{Noir}', 'A jet lengthening mascara with a gold-barrelled wand.', '#D4AF6A', '#2B0512', 'eyes'),
('skin-serum', 'Resveratrol Glow Serum', 'skin', 64, '{}', 'A red-wine-derived antioxidant serum for a dewy, even-toned complexion.', '#F3E2BB', '#7A1830', 'skin'),
('skin-mist', 'Gold Mineral Setting Mist', 'skin', 36, '{}', 'A fine setting mist infused with mineral gold shimmer for a lit-from-within finish.', '#B8863F', '#150508', 'skin'),
('skin-primer', 'Velvet Primer', 'skin', 40, '{}', 'A silk-finish, pore-blurring primer that preps skin for long-wear makeup.', '#7A1830', '#F3E2BB', 'skin')
on conflict (id) do nothing;
