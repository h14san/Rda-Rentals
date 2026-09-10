-- Seed data for local/staging verification.
--
-- Creates two demo landlords and 15 listings across the brief's launch
-- neighbourhoods, so the feed and filters can be exercised against realistic
-- data before any real listing exists.
--
-- Listings are seeded WITHOUT images: image rows point at objects in the
-- listing-images storage bucket, and there is nothing to point at until a real
-- upload happens. The feed renders a "No photo" placeholder for these. Post a
-- listing through the app to see the image path end to end.
--
-- Run against a NON-PRODUCTION project only:
--   psql "$DATABASE_URL" -f supabase/seed.sql

begin;

-- ---------------------------------------------------------------------------
-- demo landlords
-- ---------------------------------------------------------------------------
-- Inserting into auth.users directly is the standard Supabase seeding route;
-- the on_auth_user_created trigger creates the matching profile row.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'demo.landlord1@example.com',
    crypt('demo-password-1', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Aline Uwase"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'demo.landlord2@example.com',
    crypt('demo-password-2', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Eric Habimana"}'::jsonb
  )
on conflict (id) do nothing;

-- The trigger fills id/phone/full_name; add the contact numbers the app needs
-- for the WhatsApp CTA.
update public.profiles
set full_name = 'Aline Uwase', whatsapp_phone = '+250788111222'
where id = 'aaaaaaaa-0000-4000-8000-000000000001';

update public.profiles
set full_name = 'Eric Habimana', whatsapp_phone = '+250788333444'
where id = 'aaaaaaaa-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- listings
-- ---------------------------------------------------------------------------
-- Prices reflect the Kigali market: studios 80-150k, one-beds 150-250k,
-- two-beds 250-450k, family houses 500k+.

insert into public.listings (
  owner_id, title, description, price_rwf, property_type, bedrooms, furnished,
  district, sector, address, latitude, longitude, status, is_featured, created_at
)
values
  ('aaaaaaaa-0000-4000-8000-000000000001',
   'Bright studio near Kimironko market',
   'Self-contained studio with its own entrance, water tank and 24/7 security. Walking distance to Kimironko market and the bus stage.',
   110000, 'studio', 0, false, 'Gasabo', 'Kimironko', 'KG 11 Ave, near the market',
   -1.9407, 30.1265, 'active', true, now() - interval '2 days'),

  ('aaaaaaaa-0000-4000-8000-000000000001',
   'Furnished 1-bedroom in Remera',
   'Fully furnished with fridge, cooker and hot water. Ideal for a young professional working around Remera or the airport road.',
   230000, 'apartment', 1, true, 'Gasabo', 'Remera', 'Near Amahoro Stadium',
   -1.9536, 30.1096, 'active', false, now() - interval '3 days'),

  ('aaaaaaaa-0000-4000-8000-000000000002',
   'Spacious 2-bedroom apartment, Kacyiru',
   'Two large bedrooms, open kitchen, balcony with a city view. Quiet compound with parking. Water and garbage collection included.',
   380000, 'apartment', 2, false, 'Gasabo', 'Kacyiru', 'KG 7 Ave',
   -1.9366, 30.0930, 'active', false, now() - interval '5 days'),

  ('aaaaaaaa-0000-4000-8000-000000000002',
   'Affordable shared room in Nyamirambo',
   'Shared house with three other tenants. Room is private, kitchen and bathroom shared. Good option for students.',
   65000, 'shared', 1, false, 'Nyarugenge', 'Nyamirambo', 'Near the Green Mosque',
   -1.9797, 30.0442, 'active', false, now() - interval '1 day'),

  ('aaaaaaaa-0000-4000-8000-000000000001',
   'Modern studio in Gisozi',
   'Newly built studio, tiled throughout, with a small private yard. Reliable water supply.',
   95000, 'studio', 0, false, 'Gasabo', 'Gisozi', 'Near Gisozi Genocide Memorial',
   -1.9182, 30.0705, 'active', false, now() - interval '6 days'),

  ('aaaaaaaa-0000-4000-8000-000000000002',
   'Family house with garden, Kanombe',
   'Three bedrooms, sitting room, separate dining, and a large garden. Boys quarter included. Good for a family.',
   650000, 'house', 3, false, 'Kicukiro', 'Kanombe', 'Off the airport road',
   -1.9700, 30.1400, 'active', false, now() - interval '8 days'),

  ('aaaaaaaa-0000-4000-8000-000000000001',
   'Cosy 1-bedroom near Kimironko',
   'Compact one-bedroom in a small compound. Water tank, parking for one car, and a shared courtyard.',
   165000, 'apartment', 1, false, 'Gasabo', 'Kimironko', 'KG 203 St',
   -1.9430, 30.1230, 'active', false, now() - interval '4 days'),

  ('aaaaaaaa-0000-4000-8000-000000000002',
   'Furnished 2-bedroom, Kimihurura',
   'Fully furnished, ready to move in. Backup power and a generator for the compound. Suits expats and NGO staff.',
   750000, 'apartment', 2, true, 'Gasabo', 'Kimihurura', 'KG 5 Ave',
   -1.9505, 30.0930, 'active', true, now() - interval '7 days'),

  ('aaaaaaaa-0000-4000-8000-000000000001',
   'Budget studio in Gatenga',
   'Simple studio, shared water point, secure gate. Cheapest option in the area.',
   55000, 'studio', 0, false, 'Kicukiro', 'Gatenga', 'Near Gatenga sector office',
   -1.9880, 30.0930, 'active', false, now() - interval '9 days'),

  ('aaaaaaaa-0000-4000-8000-000000000002',
   'Three-bedroom house in Kicukiro',
   'Standalone house with a walled compound, borehole water and space for two cars.',
   520000, 'house', 3, false, 'Kicukiro', 'Kicukiro', 'Kicukiro centre',
   -1.9840, 30.1020, 'active', false, now() - interval '11 days'),

  ('aaaaaaaa-0000-4000-8000-000000000001',
   'Shared apartment room, Remera',
   'One room in a two-bedroom apartment. Shared kitchen and sitting room with one other tenant.',
   80000, 'shared', 1, true, 'Gasabo', 'Remera', 'Near Giporoso',
   -1.9570, 30.1150, 'active', false, now() - interval '2 days'),

  ('aaaaaaaa-0000-4000-8000-000000000002',
   'One-bedroom in Nyamirambo',
   'Bright one-bedroom on the upper floor with a small balcony. Lively neighbourhood, good transport links.',
   140000, 'apartment', 1, false, 'Nyarugenge', 'Nyamirambo', 'KN 2 Ave',
   -1.9760, 30.0470, 'active', false, now() - interval '10 days'),

  ('aaaaaaaa-0000-4000-8000-000000000001',
   'Executive 2-bedroom, Kacyiru',
   'High-end finishes, fitted wardrobes, and a shared gym in the building. Close to the embassies.',
   900000, 'apartment', 2, true, 'Gasabo', 'Kacyiru', 'KG 9 Ave',
   -1.9340, 30.0900, 'active', false, now() - interval '12 days'),

  ('aaaaaaaa-0000-4000-8000-000000000002',
   'Studio near University of Rwanda campus',
   'Small studio popular with students. Prepaid electricity and a shared water tap.',
   70000, 'studio', 0, false, 'Gasabo', 'Remera', 'Near the UR Remera campus',
   -1.9590, 30.1080, 'active', false, now() - interval '1 day'),

  ('aaaaaaaa-0000-4000-8000-000000000001',
   'Two-bedroom in Kinyinya',
   'Quiet residential area, newly tarmacked road, and a small garden. Water and power reliable.',
   290000, 'apartment', 2, false, 'Gasabo', 'Kinyinya', 'Kinyinya, near the health centre',
   -1.9210, 30.0980, 'active', false, now() - interval '14 days');

-- One rented and one draft listing, so the profile screen's status states and
-- the feed's "active only" filter can both be verified.
insert into public.listings (
  owner_id, title, description, price_rwf, property_type, bedrooms, furnished,
  district, sector, address, status, created_at
)
values
  ('aaaaaaaa-0000-4000-8000-000000000001',
   'Already rented 1-bedroom, Gisozi',
   'This unit has been taken. Kept visible to the owner only.',
   150000, 'apartment', 1, false, 'Gasabo', 'Gisozi', 'Gisozi',
   'rented', now() - interval '20 days'),

  ('aaaaaaaa-0000-4000-8000-000000000001',
   'Unfinished draft listing',
   null,
   200000, 'apartment', 2, false, 'Gasabo', 'Kacyiru', null,
   'draft', now() - interval '1 hour');

commit;
