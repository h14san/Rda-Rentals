@AGENTS.md

# Rwanda Rentals

Mobile rental marketplace for Kigali. Tenants browse/filter listings and contact
landlords over WhatsApp; landlords post rentals with photos.

Expo SDK 57 (RN 0.86, React 19.2) + expo-router · Supabase (Postgres/Auth/
Storage) · TanStack Query · react-native-maps.

**Phases 1 & 2 are done** (auth, feed, filters, detail, posting, profile).
Phase 3 — the AI chatbot, natural-language search, and photo-to-description —
is not built.

## Two source docs, one wins

`docs/Rwanda_Rentals_Brief.docx` is authoritative: React Native + Supabase +
Claude API. `docs/Rwanda Rentals App – Developer Framework.docx` is the older
spec (Flutter + Firebase, no AI) and is **superseded** — consult it only for UI
direction and the colour palette. If a request seems to assume Flutter or
Firestore, that is the stale doc talking; say so rather than switching stacks.

## Commands

```bash
npm start              # Expo Go — everything except the map
npx expo run:android   # dev build — adds the map
npm run typecheck      # tsc --noEmit
npx eslint .
npm run db:push        # apply supabase/migrations
npm run db:seed        # demo data — NON-PRODUCTION ONLY
npm run db:rls-check   # asserts the RLS policies hold
```

Install native deps with `npx expo install <pkg>`, never plain `npm install` —
it pins the SDK 57–compatible version (that is why react-native-maps is 1.27.2,
not the latest 1.29.0).

## Traps that cost real time

**Supabase row types must be `type`, not `interface`.** postgrest-js requires
`Record<string, unknown>`, and interfaces have no implicit index signature.
Declaring `ProfileRow`/`ListingRow`/`ListingImageRow` as interfaces silently
collapses the whole schema to `never`, and every insert/update fails with
"not assignable to parameter of type 'never'" — the error points at the call
site, not the cause.

**The `Database` type needs `__InternalSupabase: { PostgrestVersion: '12' }`
and `Relationships: []` on every table.** Same failure mode as above.

**`useSegments()` returns a tuple type.** Indexing `segments[1]` errors under
`typedRoutes`; widen with `as string[]` (see `src/app/_layout.tsx`).

**Env vars are inlined at build time.** Editing `.env` requires a dev-server
restart. Only `EXPO_PUBLIC_*` reaches the client; `GOOGLE_MAPS_API_KEY` is
deliberately unprefixed because `app.config.ts` bakes it into native config.

**The map needs a development build.** Expo Go cannot apply the native Maps
key, so the map is blank there. Every other screen works in Expo Go — don't
"fix" a blank map that is just running in the wrong client.

**`supabase db query` exits 0 even when the SQL fails** — it reports the error
as JSON on stdout. Never call it directly from a check script; `db:seed` and
`db:rls-check` go through `scripts/run-sql.mjs`, which greps the output and
exits non-zero. A check that cannot fail is worse than no check.

**Spawning npx from Node on Windows needs `shell: true` with a single command
string.** `npx.cmd` cannot be spawned without a shell (Node raises EINVAL since
the CVE-2024-27980 fix), and Git Bash only has the extensionless shell script.
Passing an args array *with* `shell: true` is separately deprecated. See the
comment in `scripts/run-sql.mjs`.

**No NativeWind.** 4.2.6 predates RN 0.86 and v5 is preview. Style with
`StyleSheet` over the tokens in `src/theme/index.ts`; that file is the single
home for the palette. Don't reintroduce Tailwind without checking RN support.

## Live project

Linked to Supabase project `rwanda_rentals` (ref `urfmftxepopqmhhmzpqh`,
eu-central-1, Postgres 17). Schema, seed, and RLS checks have all been applied
and verified against it. `.env` holds the URL and publishable key.

The direct DB host is **IPv6-only** (no A record) — fine on an IPv6 network,
but use the pooler connection string on IPv4-only networks.

## Architecture decisions worth keeping

**RLS is the entire security boundary.** The anon key ships inside the app
bundle and is extractable. Every table has RLS enabled and no table is reachable
without a policy naming `auth.uid()`. After touching any policy or table, run
`npm run db:rls-check` — it impersonates a second landlord via
`request.jwt.claims` and asserts it cannot read another's drafts or modify their
listings. Treat a failure as ship-blocking.

Verified end to end against the live project: an anonymous caller sees 15 of 17
listings (drafts and rented hidden), gets `[]` for a draft query, and is
rejected with `42501` when inserting. Note that `profiles` is readable only by
authenticated users, so an anonymous client gets `profiles: null` on a listing
and the WhatsApp CTA has no number — if anonymous browsing is ever enabled, that
policy needs revisiting.

**Email OTP needs two things the defaults get wrong.** Supabase's stock
templates send `{{ .ConfirmationURL }}` — a magic link to Site URL
(`localhost:3000`), which is meaningless on a phone. The templates in
`supabase/templates/` render `{{ .Token }}` instead. Both `magic_link` *and*
`confirmation` are needed: with confirmations enabled, `signInWithOtp` sends the
confirmation template to users who don't exist yet and magic_link to those who
do, so fixing one leaves first-time sign-up broken.

**The built-in SMTP is test-only and hard rate-limited** (a couple of emails per
hour, project-wide — separate from `auth.email.max_frequency`). "Email rate
limit exceeded" during testing is this, not a bug. Real use needs custom SMTP
configured in the dashboard.

**`OTP_LENGTH` in `src/lib/auth.ts` is channel-dependent and the two differ.**
`auth.email.otp_length` is 8; `auth.sms.otp_length` is 6. A mismatch caps the
input below the real code length so Verify never enables — with no error shown.
Re-check both before switching `EXPO_PUBLIC_AUTH_CHANNEL`.

**Switching to phone needs more than the env var:** `[auth.sms].enable_signup`
is `false` on this project, and Twilio credentials must be present. Remote has
`auth.sms.twilio.enabled = true` with no visible account_sid — verify before
assuming SMS is wired.

**Do not run `supabase config push` blind.** A push right now would flip
`auth.sms.twilio.enabled` from true to false on the remote project. Always run
`supabase config diff` first and reconcile.

**Auth is channel-agnostic on purpose.** The brief wants phone OTP, but Supabase
delegates SMS to paid providers (Twilio/Vonage/MessageBird) with no free tier
for Rwandan numbers. `src/lib/auth.ts` abstracts the channel: email OTP today,
`EXPO_PUBLIC_AUTH_CHANNEL=phone` flips to SMS with no screen changes, because
both are the same two-step code flow. Don't replace this with email+password —
that is a different screen that would be thrown away.

**Listings are drafted before upload.** `create.ts` inserts the row as
`status='draft'`, uploads images against its id, then flips to `active`. A
mid-flow failure leaves a private draft, never a live listing with missing
photos. `status` also carries `rented`, which answers the brief's complaint that
there is no way to tell whether a listing is still available.

**Photos are compressed before upload** (1600px longest edge, JPEG q0.7, in
`create.ts`). Raw phone photos are 3–8 MB; this is the main thing making the app
usable on Rwandan mobile data. Uploads are sequential, not parallel — concurrent
uploads on a weak connection stall each other.

**WhatsApp uses the `https://wa.me` link, not the `whatsapp://` scheme.**
`canOpenURL` on a custom scheme needs an Android `<queries>` manifest entry and
returns false without one, so the scheme route fails on exactly the devices that
do have WhatsApp. Call is a separate button, not a fallback.

## Phase 3 constraints (read before adding AI)

**The Claude API key must never enter the app bundle** — anything shipped in a
React Native app is extractable. Call Claude from a Supabase Edge Function
holding `ANTHROPIC_API_KEY` as a secret.

**Sort is not part of `Filters`.** It lives beside it in `filters-context`,
because `Filters` is the shape Phase 3's parser targets and it should describe
what to *match*, not how to order. Featured listings float to the top only under
the default "newest" ordering — letting paid placement override an explicit
"price: low to high" makes the sort look broken.

**`Filters` in `src/features/listings/types.ts` is the AI's target.** It is the
single description of what can be searched. Natural-language search should
produce a `Filters` object and hand it to the existing query, not build its own
— that keeps the AI path and the manual path one code path.

Use `claude-opus-5` unless told otherwise, and check the `claude-api` skill
before writing SDK calls rather than working from memory.

## Layout

```
src/
  app/                      expo-router routes
    (auth)/                 sign-in, verify, profile-setup
    (tabs)/                 index (feed), post, profile
    listing/[id].tsx        detail + map + WhatsApp CTA
    listing/edit/[id].tsx   edit fields (flat form, not the post wizard)
    filters.tsx             filter sheet (modal)
  features/
    auth/context.tsx        session + profile, routing gate
    listings/               types, queries, create, filters-context
  lib/                      supabase, auth, contact, format, locations
  theme/                    colour, spacing, radius, shadow tokens
supabase/
  migrations/20260910120000_init.sql  schema, indexes, RLS, storage policies
  seed.sql                  15 demo Kigali listings (no photos — nothing in
                            the storage bucket to point at until a real upload)
  rls_check.sql             security assertions
```

`@/*` maps to `src/*`. Routes live in `src/app`, not a root-level `app/`.

## Conventions

- Comments explain *why*, not what. Most existing comments record a decision or
  a trap; match that bar rather than narrating the code.
- Prices are `integer` RWF — no subunit. Format with `formatPrice`.
- Rwandan phone numbers are normalised to E.164 in `src/lib/auth.ts`; accept
  `07…`, `+250 7…`, `2507…`. Never store what the user typed.
- Kigali districts/sectors are a bundled constant (`src/lib/locations.ts`), not
  a table — short, static, and needed offline.
- Every list screen needs loading, empty, and error states. On low-bandwidth
  connections a hanging spinner is the normal case, not the edge case.
