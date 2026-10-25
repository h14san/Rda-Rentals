# Rwanda Rentals

A long-term rental marketplace for Rwanda, starting in Kigali. Renters browse,
filter, compare and save listings, or describe what they want to an AI
assistant. Landlords post a rental with photos in a few minutes.

The product is heading toward a privacy-controlled marketplace: in-app chat
instead of phone numbers, specific verification badges, booking, and an admin
console. Contact is over WhatsApp until in-app chat ships.

## Source documents

| Document | Role |
|---|---|
| `docs/RWANDA RENTALS blue print.docx` | **The spec.** Architecture, the 16 product rules, MVP definition, 9 phases |
| `docs/Rwanda_Rentals_Features.pdf` | **The spec.** 69-feature catalogue, consistent with the Blueprint |
| `docs/Rwanda_Rentals_Third_Party_Services.pdf` | Vendor categories; examples, not selections |
| `docs/Rwanda_Rentals_Brief.docx` | Historical: the original MVP spec the first build followed |
| `docs/RWANDA RENTALS.pdf` | Historical: the 16-item backlog the Blueprint grew from |
| `docs/Rwanda Rentals App – Developer Framework.docx` | Historical: Flutter + Firebase spec, kept for UI direction and palette |

The backlog's viewing scheduler is **not** being built. The Blueprint rejects
it: viewings are arranged in chat.

## Status

| Phase | State |
|---|---|
| MVP (from the Brief) | Built: email OTP auth, feed, filters, detail, posting, editing, profile, three AI features |
| 0: Blueprint adopted | Done: `CLAUDE.md` lists the product rules every change is checked against |
| 1: Privacy | Done, live: the exact address and pin are owner-only; tenants see a 500 m area |
| 2: Marketplace | Done, live: rental terms, the full status model, favorites, comparison, map view |
| 3: Trust and communication | Next: roles, in-app chat (replaces WhatsApp), push, reports, verification, admin |
| Later | Booking, AI matching and alerts, payments, digital rental, agencies |

The app has no tests and no CI, and has not been through a beta.

## Stack

| Layer | Choice |
|---|---|
| App | Expo SDK 57 / React Native 0.86, expo-router |
| Backend | Supabase: Postgres, Auth, Storage, Edge Functions |
| Server state | TanStack Query |
| Validation | Zod |
| Maps | react-native-maps (Google provider) |
| AI | Gemini (free tier), only inside Edge Functions |
| Styling | `StyleSheet` over tokens in `src/theme` |

Postgres earns its place on the filters screen. Price, area, type, bedrooms,
bathrooms, amenities, lease length and move-in date run as one indexed query,
where Firestore would need a hand-built composite index per combination.

## Setup

### 1. Supabase

Already provisioned: project `rwanda_rentals` (`urfmftxepopqmhhmzpqh`,
eu-central-1). All migrations, demo data and RLS checks are applied. To
reproduce this on a fresh project:

```bash
npx supabase login          # needs a real terminal; the browser flow is not
                            # available in a non-TTY shell
npx supabase link --project-ref <your-project-ref>
npm run db:push      # applies everything in supabase/migrations, in order
npm run db:seed      # 15 demo Kigali listings with rental terms (NON-PRODUCTION ONLY)
npm run db:rls-check # proves the RLS policies and status rules hold
```

The free tier **pauses idle projects**. If a push fails with "Connection
terminated due to connection timeout", restore the project from the dashboard
first.

Every `db:*` script goes through `npx`, so no global Supabase CLI is needed.
`db:seed` and `db:rls-check` also run through `scripts/run-sql.mjs`, because
`supabase db query` exits 0 even when the SQL errors, and a check that cannot
fail is worse than no check.

`db:rls-check` is not optional. The anon key ships inside the app bundle and is
extractable, so RLS and the database triggers are the entire security boundary.
The script impersonates a second user and asserts that it cannot:

- read another landlord's drafts or exact location;
- modify another landlord's listings;
- approve or suspend its own listing, or create one that skips draft;
- backdate an availability confirmation;
- save someone else's favorites.

### 2. Environment

```bash
cp .env.example .env
```

Fill in the Supabase URL and anon key. Env vars are inlined at build time, so
**restart the dev server after editing `.env`**.

### 3. Google Maps

Create a Google Cloud project, enable **Maps SDK for Android** and **Maps SDK
for iOS**, and put the key in `GOOGLE_MAPS_API_KEY`. `app.config.ts` injects it
into native config.

### 4. Run

```bash
npm start              # Expo Go: everything except the maps
npx expo run:android   # dev build: adds the maps
```

The detail-page map and the feed's map view need a development build. Expo Go
cannot apply the native Maps API key, so the maps are blank there, and every
other screen works.

## Privacy model

The Blueprint's first rules are: no landlord phone or email on public listings,
and no exact address or pin before the booking stage.

- **The exact location is in `listing_locations`, which only the owner can
  read.** The public `listings` row carries only an approximate point: the real
  one offset by a random bearing and distance within 500 m. The offset is
  stored once, so it can't be averaged away. Tenants see a 500 m circle and no
  "Open in Maps". Phase 4 (booking) will reveal the exact location to the
  confirmed renter.
- **`profiles` holds no login phone.** It lives in `auth.users` only.
- **WhatsApp is a temporary exception to the phone rule.** The CTA goes away
  when in-app chat ships in Phase 3.

## Listing lifecycle

```
draft ──► published ◄──► paused / unavailable / rented
             ▲
pending_review (staff decide) ──► rejected ──► draft
                                  suspended (staff only)
```

A trigger (`listings_guard_status`) enforces the moves. The UI only offers
moves the database will accept. Until verification exists, a landlord's draft
publishes directly. Phase 3 sends it to `pending_review` instead; that switch
is `PUBLISH_TARGET` in `types.ts` plus one line in the trigger.

"Still available" re-confirms a live listing. The timestamp always comes from
the server's clock. Cards show "Availability confirmed N days ago", and the
feed can sort by it.

## Auth: read this before wiring phone login

The Blueprint specifies phone OTP, which is right for Rwanda. But **Supabase
does not send SMS itself**: it delegates to a provider. The candidate here is
Pindo, a Rwandan SMS provider, behind a Supabase Send SMS auth hook. That needs
pricing and a sender ID; the code side is small.

So the app ships on **email OTP** and switches to SMS with one env var:

```bash
EXPO_PUBLIC_AUTH_CHANNEL=phone
```

Both are one-time-code flows with the same two steps, so the sign-in screens
don't change. Configure the SMS provider first, or the code request fails. See
`src/lib/auth.ts`, and `CLAUDE.md` for the OTP length and `config push` traps.

## Layout

```
src/
  app/                      expo-router routes
    (auth)/                 sign-in, verify, profile-setup
    (tabs)/                 feed (list + map), chat (Ask), saved, post, profile
    listing/[id].tsx        detail: terms, amenities, approximate area, WhatsApp CTA
    listing/edit/[id].tsx   edit fields, terms and photos
    compare.tsx             2–4 saved rentals side by side
    filters.tsx             filter sheet (modal)
  components/               listing card, feed map, states, UI primitives
  features/
    auth/context.tsx        session + profile, auth gating
    listings/
      types.ts              row types, Database generic, Filters schema, statuses
      queries.ts            feed / detail / by-ids / my-listings / mutations
      create.ts             photo compression, upload, private location, publish
      terms-fields.tsx      rental terms fields shared by post and edit
      favorites.ts          saved ids, saved list, optimistic toggle
      smart-search.ts       natural-language query -> Filters
      chat.ts               conversation turn -> reply + Filters
      auto-describe.ts      photos -> draft description
      filters-context.tsx   filter state shared across routes
  lib/                      supabase, auth, contact, format, locations,
                            amenities, maps
  theme/                    colour, spacing, radius, shadow tokens
supabase/
  migrations/
    20260910120000_init.sql                   schema, indexes, RLS, storage
    20261024120000_private_location.sql       owner-only location, approx point
    20261024130000_listing_terms_and_status.sql  terms, status rules, history
    20261024140000_favorites.sql              favorites, saved visibility
  seed.sql                  demo data
  rls_check.sql             security assertions
  functions/
    _shared/gemini.ts       key handling, CORS, provider error mapping
    _shared/filters.ts      the filter contract both search paths target
    smart-search/           query -> Filters
    chat/                   conversation -> reply + Filters
    auto-describe/          photos -> description
```

## AI features

All three run as Edge Functions, so the model API key never ships in the app
bundle. Anything in a React Native build is extractable.

| Feature | Function | Where it appears |
|---|---|---|
| Assistant | `chat` | the Ask tab |
| Natural-language search | `smart-search` | search bar on the Explore tab |
| Photo-to-description | `auto-describe` | "Write it for me" beside Description in the post wizard |

One key, set as a **function secret**, not in `.env`:

```bash
npx supabase secrets set GEMINI_API_KEY=...
npx supabase functions deploy chat
npx supabase functions deploy smart-search
npx supabase functions deploy auto-describe
```

All three import `supabase/functions/_shared/`, so **a change there means
redeploying all three.** `chat` and `smart-search` also share
`_shared/filters.ts`, the one server-side description of the filter contract:
the response schema, the sentinel decoding, the Kigali place names and the
amenity vocabulary.

Until the secret is set, each function returns a clear 503 and the UI says the
feature isn't configured. Manual filters and a hand-typed description keep
working throughout, so no AI feature is on the critical path.

### Assistant and search

Both produce a `Filters` object and hand it to the ordinary feed query, the
same one the filter sheet uses. The assistant can therefore set anything the
sheet can, including bathrooms, amenities, lease length and move-in date, and a
bad parse shows up as an ordinary, inspectable filter.

**The model never sees a listing row**, and that is the point. It cannot name a
property that doesn't exist, quote a rent that has since changed, or promise
something is still available. Those are the three failures that would make an
AI assistant worse than the WhatsApp groups this app replaces. The criteria
chips under a reply are read back off the `Filters` the query actually ran
with, so if the wording and the filters ever disagree, the chips are the truth.

Follow-ups refine rather than restart. The filters in force are sent with each
turn, and the model returns the full set it wants applied. "Cheapest" is a
sort, not an invented `maxPrice`.

### Photo-to-description

The landlord's photos are compressed to 1024px / q0.6, smaller than the 1600px
upload size. Vision models tile their input anyway, so a bigger image buys no
extra detail and doubles the data spent posting one listing. The photos go to
`auto-describe`, and the result lands in the editable Description field.
Nothing is published from it.

What the prompt forbids matters more than what it asks for: no rent, deposit,
minimum stay or move-in date, no floor area, no distance to a landmark, no
utilities or security claims, and no describing people. The model may only
name what is visible plus the facts the landlord entered. Structured terms have
their own fields, and prose repeating them goes stale the first time one is
edited.

**Model names expire.** Google refuses retired names for newly issued keys:
`gemini-2.5-flash` was rejected with "no longer available to new users" on a
2026 key. The default is `gemini-3.6-flash`, and it can be changed without a
redeploy:

```bash
npx supabase secrets set GEMINI_MODEL=<model-name>
```

## Notes

- **`Filters` is the single description of what can be searched.** The sheet,
  the search bar and the assistant all produce one. Nothing builds its own
  listings query.
- **Unstated rental terms match filters.** A landlord who left the minimum stay
  or move-in date blank hasn't said no, so their listing isn't hidden.
- **Amenity keys exist in two copies**, in `src/lib/amenities.ts` and
  `_shared/filters.ts`. Keep them identical.
- **Listings are drafted before upload.** `create.ts` inserts a draft, uploads
  images against its id, then publishes. A failure partway through leaves a
  private draft, never a live listing with missing photos.
- **Deleting a `listing_images` row also needs its storage object removed.**
  They aren't FK-linked. The row goes first, because an orphaned object is
  invisible, while a row pointing at a deleted object renders as a broken image.
- **Seeded listings have no photos.** Post a listing through the app to
  exercise the image path.
- **Data residency is an open decision.** The Rwanda data-protection law
  requires authorization to store data outside Rwanda; Supabase is in
  eu-central-1 and Gemini runs abroad. Settle it before production.

`CLAUDE.md` holds the full set of traps and design decisions.

## Checks

```bash
npm run typecheck
npx eslint .
npm run db:rls-check
```
