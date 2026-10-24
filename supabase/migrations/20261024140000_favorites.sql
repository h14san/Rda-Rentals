-- Favorites (Features #17): one list, no collections. The Blueprint (§15)
-- says explicitly that the user chose a single list.

create table public.favorites (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  listing_id   uuid not null references public.listings (id) on delete cascade,
  -- Captured when saved, so the list can say "price dropped" without a price
  -- history table. Only the latest change is visible, which is the one a
  -- renter acts on.
  price_at_save integer,
  created_at   timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index favorites_listing_idx on public.favorites (listing_id);

-- Set by the server so a client cannot fake a "price dropped" badge on its own
-- list. Runs as the caller: they can only favorite a listing they can see.
create or replace function public.favorites_capture_price()
returns trigger
language plpgsql
as $fn$
begin
  select price_rwf into new.price_at_save
  from public.listings where id = new.listing_id;
  return new;
end;
$fn$;

create trigger favorites_capture_price
  before insert on public.favorites
  for each row execute function public.favorites_capture_price();

alter table public.favorites enable row level security;

create policy favorites_select_own on public.favorites
  for select to authenticated using (user_id = auth.uid());

create policy favorites_delete_own on public.favorites
  for delete to authenticated using (user_id = auth.uid());

-- Only a currently published listing can be saved. Without this, a renter who
-- had a paused listing's id could favorite it and, through the policy below,
-- read a listing that is no longer public.
create policy favorites_insert_published on public.favorites
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.listings l
      where l.id = listing_id and l.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- Saved listings stay readable after they stop being published
-- ---------------------------------------------------------------------------
-- Otherwise a listing that gets rented would vanish from the list silently,
-- which is exactly the "is it still available?" uncertainty the feature
-- exists to remove. Moderation states are excluded: a suspended or rejected
-- listing disappears, because showing it would undo the moderation.
-- Permissive policies OR together, so this only adds visibility.

create policy listings_select_favorited on public.listings
  for select to authenticated
  using (
    status in ('published', 'paused', 'unavailable', 'rented')
    and exists (
      select 1 from public.favorites f
      where f.listing_id = listings.id and f.user_id = auth.uid()
    )
  );

create policy listing_images_select_favorited on public.listing_images
  for select to authenticated
  using (exists (
    select 1
    from public.listings l
    join public.favorites f on f.listing_id = l.id and f.user_id = auth.uid()
    where l.id = listing_id
      and l.status in ('published', 'paused', 'unavailable', 'rented')
  ));
