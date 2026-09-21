# Rwanda Rentals

A mobile rental marketplace for Kigali. Tenants browse and filter verified
listings and contact landlords over WhatsApp; landlords post a rental with
photos in a few minutes.

Built against `Rwanda_Rentals_Brief.docx` (React Native + Supabase). The older
`Rwanda Rentals App – Developer Framework.docx` specifies Flutter + Firebase —
superseded, but kept for its UI direction and colour palette.

**Status:** every feature the brief marks MVP is built — auth, feed, filters,
detail, posting, profile, and all three AI features (chatbot, natural-language
search, photo-to-description). Two caveats: sign-in is email OTP rather than
phone OTP (see below — it needs a paid SMS provider, not code), and Phase 4
(testing, performance tuning, beta) has not started.

## Stack

| Layer | Choice |
|---|---|
| App | Expo SDK 57 / React Native 0.86, expo-router |
| Backend | Supabase — Postgres, Auth, Storage |
| Server state | TanStack Query |
| Maps | react-native-maps (Google provider) |
| Styling | `StyleSheet` over tokens in `src/theme` |

Postgres over Firestore is the brief's call, and it earns itself on the filters
screen: price range + district + sector + type + bedrooms is one indexed query
here, versus a hand-built composite index per combination in Firestore.

## Setup

### 1. Supabase

Already provisioned: project `rwanda_rentals` (`urfmftxepopqmhhmzpqh`,
eu-central-1). Schema, seed data, and RLS checks have been applied. To
reproduce on a fresh project:

```bash
npx supabase login          # needs a real terminal — the browser flow is not
                            # available in a non-TTY shell
npx supabase link --project-ref <your-project-ref>
npm run db:push      # applies supabase/migrations/20260910120000_init.sql
npm run db:seed      # 15 demo Kigali listings — NON-PRODUCTION ONLY
npm run db:rls-check # proves the RLS policies hold
```

`db:seed` and `db:rls-check` run through `scripts/run-sql.mjs` rather than
calling the CLI directly, because `supabase db query` exits 0 even when the SQL
errors — a check that cannot fail is worse than no check.

`db:rls-check` is not optional. The anon key ships inside the app bundle and is
extractable, so RLS is the entire security boundary — the script impersonates a
second user and asserts it cannot read another landlord's drafts or modify
their listings.

### 2. Environment

```bash
cp .env.example .env
```

Fill in the Supabase URL and anon key. Env vars are inlined at build time, so
**restart the dev server after editing `.env`**.

### 3. Google Maps

Create a Google Cloud project, enable **Maps SDK for Android** and **Maps SDK
for iOS**, and put the key in `GOOGLE_MAPS_API_KEY`. It is injected into native
config by `app.config.ts`.

### 4. Run

```bash
npm start          # Expo Go: everything except the map
npx expo run:android   # dev build: adds the map
```

The map needs a development build. Expo Go cannot apply the native Maps API key
config, so the map is blank there — every other screen works fine.

## Auth: read this before wiring phone login

The brief specifies phone OTP, which is right for Rwanda. But **Supabase does
not send SMS itself** — it delegates to Twilio / Vonage / MessageBird, all paid,
with no free tier for Rwandan numbers.

So the app ships on **email OTP** and flips to SMS with one env var:

```bash
EXPO_PUBLIC_AUTH_CHANNEL=phone
```

Both are one-time-code flows with the same two-step shape, so the sign-in
screens do not change. Configure an SMS provider in the Supabase dashboard
first, or the code request fails. See `src/lib/auth.ts`.

## Layout

```
src/
  app/                      expo-router routes
    (auth)/                 sign-in, verify, profile-setup
    (tabs)/                 feed, chat (Ask), post, profile
    listing/[id].tsx        detail + map + WhatsApp CTA
    filters.tsx             filter sheet (modal)
  features/
    auth/context.tsx        session + profile, auth gating
    listings/
      types.ts              row types, Database generic, Filters schema
      queries.ts            feed / detail / my-listings / mutations
      create.ts             photo compression, upload, publish
      smart-search.ts       natural-language query -> Filters
      chat.ts               conversation turn -> reply + Filters
      auto-describe.ts      photos -> draft description
      filters-context.tsx   filter state shared across routes
  lib/                      supabase, auth, contact, format, locations
  theme/                    colour, spacing, radius, shadow tokens
supabase/
  migrations/20260910120000_init.sql  schema, indexes, RLS, storage policies
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

Two of the brief's three are built, both as Edge Functions so the model API key
never ships in the app bundle — anything in a React Native build is extractable.

| Feature | Function | Where it appears |
|---|---|---|
| Chatbot | `chat` | the Ask tab |
| Natural-language search | `smart-search` | search bar on the Explore tab |
| Photo-to-description | `auto-describe` | "Write it for me" beside Description in the post wizard |

One key, set as a **function secret** — not in `.env`:

```bash
npx supabase secrets set GEMINI_API_KEY=...
npx supabase functions deploy chat
npx supabase functions deploy smart-search
npx supabase functions deploy auto-describe
```

All three import `supabase/functions/_shared/`, so **a change there means
redeploying all three.** `chat` and `smart-search` additionally share
`_shared/filters.ts`, which is the one server-side description of the filter
contract — the response schema, the sentinel decoding, and the Kigali
vocabulary rules.

Until the secret is set each function returns a clear 503 and the UI says it is
not configured. Manual filters and a hand-typed description keep working
throughout — no AI feature is on the critical path.

### Chatbot

The Ask tab is a conversational front end to the same feed query. Each turn
returns a reply plus a complete `Filters` object; the app runs
`useListingsFeed` with it and renders the real matching rows under the reply,
with "Show all N in Explore" handing the filters to the feed through
`filters-context`.

**The model never sees a listing row**, which is the point. It cannot name a
property that does not exist, quote a rent that has since changed, or promise
something is still available — the three failures that would make an AI
assistant worse than the WhatsApp groups this app replaces. Its reply only
proves the question was understood; the cards are the answer. The criteria
chips under a reply are read back off the `Filters` the query actually ran
with, so if the wording and the filters ever disagree, the chips are the truth.

Follow-ups refine rather than restart: the filters in force are sent with each
turn, and the model returns the full set it wants applied. "Cheapest" is
handled as a sort, not an invented `maxPrice` — sort lives beside `Filters`,
not inside it.

### Photo-to-description

The landlord's photos are compressed to 1024px / q0.6 (smaller than the 1600px
upload budget: vision models tile their input anyway, so a bigger image buys no
extra detail and doubles the data spent posting one listing), sent to
`auto-describe`, and the result lands in the same editable field they would have
typed into. Nothing is published from it.

What the prompt forbids matters more than what it asks for: no rent, no floor
area, no distance to a landmark, no utilities or security claims, and no
describing people in the photos. A tenant arriving to find an invented detail is
the exact problem the brief opens with, so the model may only name what is
visible plus the fields the landlord already filled in. Price is withheld from it
on purpose — the price has its own field everywhere, and prose repeating it goes
stale the first time the rent is edited.

**Model names expire.** Google refuses retired names for newly issued keys —
`gemini-2.5-flash` was already rejected with "no longer available to new users"
on a key created in 2026. If search starts failing, check the model first: the
function returns "pointed at a model that no longer exists" for that case, and
`GEMINI_MODEL` changes it without a redeploy.

Each search is one Gemini call on the free Google AI Studio tier. The model
defaults to `gemini-3.6-flash` and can be changed without a redeploy:

```bash
npx supabase secrets set GEMINI_MODEL=<model-name>
```

## Notes for the next phase

- **Filters are the AI's target.** `Filters` in `src/features/listings/types.ts`
  is the single description of what can be searched. Phase 3's natural-language
  parser should produce a `Filters` object rather than build its own query, so
  the AI path and the manual path stay one code path.
- **The model API key must never enter the bundle.** Anything shipped in a
  React Native app is extractable. Both AI features call Gemini from Supabase
  Edge Functions holding `GEMINI_API_KEY` as a secret.
- **Auto-describe is wired into the post wizard only.** The edit screen's photos
  already live in storage, so describing them means the function fetching URLs
  rather than reading an upload — a second input mode that needs the URL pinned
  to this project's own storage host before it is safe to add.
- **Listings are drafted before upload.** `create.ts` inserts the row as
  `status='draft'`, uploads images against its id, then flips to `active`. A
  failure part way leaves a private draft, never a live listing with missing
  photos — and gives auto-describe a row to attach to.
- **Deleting a listing_images row also needs its storage object removed.**
  They are not FK-linked; `removeListingImages` deletes the row first, because
  an orphaned object is invisible while a row pointing at a deleted object
  renders as a broken image on every card.
- **Seeded listings have no photos.** Image rows point at objects in the
  storage bucket and there is nothing to point at until a real upload happens.
  Post a listing through the app to exercise that path.

## Checks

```bash
npm run typecheck
npx eslint .
```
