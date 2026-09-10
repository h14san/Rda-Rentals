-- Rwanda Rentals — initial schema.
--
-- RLS is the security boundary for this app: the anon key ships inside the
-- mobile bundle and is extractable, so every table below enables RLS and no
-- table is reachable without a policy that names auth.uid().

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text,
  -- Login identity. E.164, e.g. +250788123456.
  phone          text,
  -- Where tenants actually reach the landlord. Often a different handset from
  -- the login number, so it is stored separately rather than reusing phone.
  whatsapp_phone text,
  avatar_url     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.profiles.whatsapp_phone is
  'E.164 number used to build the wa.me contact link. May differ from phone.';

-- ---------------------------------------------------------------------------
-- listings
-- ---------------------------------------------------------------------------

create table public.listings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  title         text not null check (length(trim(title)) between 3 and 120),
  description   text,
  -- RWF has no subunit in practice, so integer rather than numeric.
  price_rwf     integer not null check (price_rwf > 0),
  property_type text not null check (property_type in ('studio', 'apartment', 'shared', 'house')),
  bedrooms      smallint check (bedrooms between 0 and 20),
  furnished     boolean not null default false,
  district      text,
  sector        text,
  address       text,
  latitude      double precision check (latitude between -90 and 90),
  longitude     double precision check (longitude between -180 and 180),
  -- 'draft' exists so images can be uploaded against a real listing id before
  -- the landlord commits; 'rented' answers the brief's complaint that there is
  -- no way to tell whether a listing is still available.
  status        text not null default 'draft'
                  check (status in ('draft', 'active', 'rented', 'archived')),
  is_featured   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Feed: active listings, newest first, featured floated to the top.
create index listings_feed_idx
  on public.listings (status, is_featured desc, created_at desc);

-- Filter combinations the filters screen actually issues.
create index listings_district_price_idx on public.listings (district, price_rwf);
create index listings_type_price_idx     on public.listings (property_type, price_rwf);
create index listings_owner_idx          on public.listings (owner_id);

-- ---------------------------------------------------------------------------
-- listing_images
-- ---------------------------------------------------------------------------

create table public.listing_images (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  -- Path within the listing-images storage bucket, not a full URL, so the
  -- bucket can move or go private without rewriting rows.
  storage_path text not null,
  position     smallint not null default 0,
  created_at   timestamptz not null default now(),
  unique (listing_id, position)
);

create index listing_images_listing_idx on public.listing_images (listing_id, position);

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger listings_touch_updated_at
  before update on public.listings
  for each row execute function public.touch_updated_at();

-- Every auth user gets a profile row immediately, so the app never has to
-- branch on "profile might not exist yet".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, phone, full_name)
  values (
    new.id,
    new.phone,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.listings       enable row level security;
alter table public.listing_images enable row level security;

-- profiles: anyone signed in can read (needed to show landlord contact on a
-- listing); you may only write your own row.
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- listings: active listings are public; drafts and archived rows are visible
-- only to their owner.
create policy listings_select_active_or_own on public.listings
  for select to anon, authenticated
  using (status = 'active' or owner_id = auth.uid());

create policy listings_insert_own on public.listings
  for insert to authenticated with check (owner_id = auth.uid());

create policy listings_update_own on public.listings
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy listings_delete_own on public.listings
  for delete to authenticated using (owner_id = auth.uid());

-- listing_images: visibility and ownership both delegate to the parent listing,
-- so there is exactly one place where "who owns this" is decided.
create policy listing_images_select on public.listing_images
  for select to anon, authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and (l.status = 'active' or l.owner_id = auth.uid())
  ));

create policy listing_images_write_own on public.listing_images
  for all to authenticated
  using (exists (
    select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do nothing;

-- Objects are keyed {user_id}/{listing_id}/{n}.jpg, so the first path segment
-- is the uploader and can be compared against auth.uid() directly.
create policy listing_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'listing-images');

create policy listing_images_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy listing_images_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy listing_images_delete_own_folder on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
