@AGENTS.md

# Rwanda Rentals

Long-term rental marketplace for Rwanda, starting in Kigali. Tenants browse,
filter and ask an AI assistant for listings; landlords post rentals with photos.
The target product is a privacy-controlled marketplace with in-app chat,
specific verification badges, booking and an admin console. Contact is through
in-app chat only; there is no phone number or email anywhere a user can read.

Expo SDK 57 (RN 0.86, React 19.2) + expo-router · Supabase (Postgres/Auth/
Storage) · TanStack Query · react-native-maps.

**Built:** auth (email OTP), feed, filters, detail, posting, editing, profile,
and the three AI features (assistant, natural-language search,
photo-to-description). The exact location is private (Phase 1 below). There are
no unit tests. CI (`.github/workflows/ci.yml`) typechecks and lints every push;
it never touches the database.

## Source docs: the Blueprint wins

Authoritative, as of 2026-10-24:

- `docs/RWANDA RENTALS blue print.docx` covers architecture, product rules, the
  MVP definition and the 9 implementation phases.
- `docs/Rwanda_Rentals_Features.pdf` is the 69-feature catalogue. It is
  consistent with the Blueprint and is the newer of the two.
- `docs/Rwanda_Rentals_Third_Party_Services.pdf` lists vendor categories as
  examples only. Nothing in it is a final selection.

Historical, for context only:

- `docs/Rwanda_Rentals_Brief.docx` was the original MVP spec, and the build up
  to Phase 0 followed it.
- `docs/RWANDA RENTALS.pdf` is the 16-item backlog the Blueprint was built
  from. Its "Viewing Requests & Scheduling" is **explicitly rejected** by the
  Blueprint (§29) and the Features doc (#30): viewings are arranged in chat, so
  don't build a scheduler.
- `docs/Rwanda Rentals App – Developer Framework.docx` is the original Flutter +
  Firebase spec. Use it only for UI direction and the palette. If a request
  assumes Flutter or Firestore, that is this doc talking, so say so rather than
  switching stacks.

The docs suggest OpenAI as an example AI provider. The build uses **Gemini**,
chosen for its free tier and isolated inside the Edge Functions. Nothing in the
app knows which model answers.

### Product rules (Blueprint §68): check every change against these

1. No landlord phone number on public listings. *The temporary WhatsApp
   exception ended with chat (2026-11-16): `profiles.whatsapp_phone` is
   dropped and nothing replaces it.*
2. No landlord email on public listings.
3. No exact address before the appropriate booking or payment stage.
4. No exact map pin before that stage.
5. Communication is primarily through Rwanda Rentals.
6. Both Instant Book and Request to Book are supported.
7. Landlords choose which booking mode they allow.
8. Verification is explicit about what was checked. Never show a bare
   "Verified".
9. Landlord verification is required before public publishing.
10. Sensitive information is not collected unless necessary.
11. AI cannot invent property information.
12. AI does not make consequential rental decisions on its own.
13. Reviews are tied to legitimate completed rentals.
14. Payments are designed into the architecture but introduced progressively.
15. Rwanda Rentals initially manages only rentals that originate on the
    platform.
16. The MVP proves the marketplace before expanding into property management.

Paid placement (`is_featured`) must never look like a verification badge.

### Roadmap status

The plan maps the Blueprint's phases onto what was already built:

- **Phase 0 (done):** docs and rules.
- **Phase 1 (done, live):** private location. Login phone dropped from
  `profiles`.
- **Phase 2 (done, live):** rental terms, the full status model with
  "availability confirmed", favorites, 2–4-way comparison, and a list/map
  toggle on the feed.
- **Phase 3a (done, live 2026-11-10):** staff roles,
  landlord ID verification with in-app document upload, listing review, specific
  badges, and staff review screens in the app (`/review`). Branch
  `feat/phase-3a-verification`.
- **Phase 3b (done, live 2026-11-15):** reports, and the moderation actions
  (suspend/restore a listing, restrict/restore an account) with a staff
  reports queue at `/staff/reports`.
- **Phase 3c (done, live 2026-11-16):** in-app chat with server-side contact
  masking, blocks, message and conversation reports, and a logged staff read
  path. WhatsApp and the contact number are gone.
- **Phase 3d (done, live 2026-11-17):** notifications. The in-app list fills
  from real events. Push is built end to end (`send-push` deployed, tokens,
  preferences, tap routing) but **cannot deliver until the owner adds the EAS
  project id and FCM credentials**. The steps are in `docs/WORKPLAN.md` under
  "Needs the owner".
- **Phase 3e (done, live 2026-11-18):** the staff console at `/staff`, inside
  the app: queues, user and listing lookup across every status, one audit
  timeline, role grants (admin only) and counts. **Phase 3 is complete.**
- **Phase 4 (done, live 2026-11-20):** booking. Instant Book and Request to
  Book, chosen per listing by the landlord. A confirmed booking releases the
  exact address to that renter and ends contact masking between the two.
- **Stopped here for the owner's review.** Do not start Phase 5.
- **Later:** AI matching and alerts, payments, digital rental, and agencies.

**What to work on next is in `docs/WORKPLAN.md`.** It has milestones M0–M7
covering the rest of Phase 3 and then Phase 4, each with a spec, a definition
of done, and the working agreement. It also records what the owner
authorized: live `db:push` and deploys, commits, pushes and merges to `main`
are allowed; seeding the live project, `config push`, payments and real ID
uploads are not. Stop after Phase 4 for review.

Decisions taken 2026-11-12 (details in the work plan):
- The admin console is a staff-only area **inside the app**, not a separate
  web app.
- Contact details in chat are **masked server-side** (`•••`) until a booking
  is confirmed. The original text is readable by staff only.

Decisions taken by the model under the work plan's authority. The owner can
overturn any of them:
- **2026-11-15, one staff role moderates.** `verifier` (and `admin`) handle
  reports and suspensions as well as verification. A separate moderator role
  would be a third thing to grant with no second person to hold it yet.
  Restricting a *staff* account is admin-only.
- **2026-11-15, the reporter is told the outcome, not the reason given to the
  landlord.** A report closed by an action shows fixed words ("We suspended
  the listing"). The note staff write for the landlord is never shown to the
  reporter, and the reverse.
- **2026-11-15, at most 10 reports per account per 24 hours**, on top of one
  live report per target.
- **2026-11-20, a new listing is Request to Book only.** Instant Book is
  opt-in from the edit screen, because it is the mode that can surprise a
  landlord.
- **2026-11-20, the renter confirms after the landlord accepts.** Accepting is
  not booking. The confirm step is where payment will sit in Phase 6, and it
  is the moment the address is released, so the renter must take it on purpose.
- **2026-11-20, 72 hours to answer a request, and 72 more to confirm an
  acceptance.** Then it expires and the listing returns to the feed.
- **2026-11-20, an accepted request takes the listing off the feed**
  (`booking_pending`), so two people are never led to the same place at once.
  A confirmation declines every other pending request on that listing.
- **2026-11-20, a booking carries no free text.** The renter's note is sent as
  an ordinary chat message. Declining and cancelling take no reason from
  either party. Only a staff cancellation has a note, shown to both.
- **2026-11-20, move-in dates are the 1st of the next three months** (chips,
  as on the landlord's own form), plus the listing's stated date if later.
- **2026-11-20, cancelling a confirmed booking hides the address again** and
  masking resumes for new messages. The renter has already seen the address;
  this only stops it being read from now on.
- **2026-11-19, re-review after edits (was an open decision).** Changing the
  **location or photos** of an approved listing sends it back to review.
  **Rent, terms and description** do not. A location change removes all three
  listing badges, because it is a different property. A photo change removes
  only "Details reviewed", the one check that looked at the photos.
- **2026-11-18, there is no support email in the app yet.** The help screens
  read `EXPO_PUBLIC_SUPPORT_EMAIL`. While it is unset they say support is
  being set up and point to Report, rather than print an address nobody reads
  to someone asking for their data to be deleted. **The owner needs to supply
  a monitored inbox before launch**: appeals and deletion requests depend on it.
- **2026-11-18, the privacy screen states where data is kept** (EU, Frankfurt)
  and that the AI features send text and photos to Google. Both are true today
  and both are what the open data-residency decision is about. Rewrite the
  screen when that is settled.
- **2026-11-17, preferences switch push only.** The in-app list always
  records everything, so turning a category off never loses information.
- **2026-11-17, account and safety notifications cannot be turned off**
  (§37): ID decisions, suspensions and restores, and the result of a report.
- **2026-11-17, push permission is asked after the first message is sent**,
  or from the settings screen, never at launch.
- **2026-11-17, a suspended saved listing is not announced.** It leaves the
  saved list silently, as moderation intends. Price drops and "rented or
  unavailable" are announced.
- **2026-11-16, `profiles.whatsapp_phone` was dropped, not hidden.** Profile
  setup now asks for a name only. Once a booking is confirmed the two people
  exchange numbers in chat, unmasked. A stored number would need its own
  release rule and nothing needs it (rule 10).
- **2026-11-16, Post left the tab bar.** Tabs are Explore, Ask, Saved,
  Messages, Profile. Five is the limit on a small phone, and messaging is
  daily while posting is occasional. `/post` is unchanged and is reached from
  the profile.
- **2026-11-16, flagged messages are never blocked or altered.** Links and
  payment wording raise one automated report per conversation and nothing
  else. A false positive costs a reviewer a minute; blocking would cost a
  renter a legitimate question about the deposit.
- **2026-11-16, a block is silent and mutual.** Neither side can send, the
  blocked person is not told and cannot see the block, and both get the same
  refusal wording.
- **2026-11-16, 30 messages per sender per minute**, enforced in the insert
  trigger.
- **2026-11-15, a public landlord page exists** (`/user/[id]`): name, join
  year, the ID badge and live listings. No contact details.

### Open non-code decisions

- **Data residency.** Blueprint §50 cites the Rwanda DPP law: storing data
  outside Rwanda needs authorization, and controllers must register. Supabase is
  in eu-central-1, and Gemini processes prompts outside Rwanda. Settle this
  before production. **Phase 3a now stores identity documents** in the
  `verification-evidence` bucket in eu-central-1: no real landlord should upload
  an ID until this is settled.
- **Evidence retention.** How long ID photos are kept after a decision is
  undecided. `decided_at` is recorded so a purge job can be added; it has to
  delete through the Storage API, because deleting `storage.objects` rows in SQL
  leaves the files behind.
- **Phone OTP: decided 2026-10-30, use Pindo.** The plan is a Supabase Send SMS
  auth hook (an Edge Function) that calls Pindo, with no screen changes. It is
  not built yet. It still needs a Pindo account, an API token, a sender ID and
  pricing.
- **Sentry and PostHog** wait for beta. Each goes behind a `src/lib/` wrapper,
  and only after its data location has been checked.

## Commands

```bash
npm start              # Expo Go — everything except the map
npx expo run:android   # dev build — adds the map
npm run typecheck      # tsc --noEmit
npx eslint .
npm run db:push        # apply supabase/migrations
npm run db:seed        # demo data — NON-PRODUCTION ONLY
npm run db:rls-check   # asserts the RLS policies hold (passes --yes; always rolls back)

npx supabase functions deploy chat           # the three AI functions;
npx supabase functions deploy smart-search   # no Docker needed to deploy
npx supabase functions deploy auto-describe
npx supabase functions deploy send-push --no-verify-jwt   # called by Postgres
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

**The AI features cannot be tested before the functions are deployed.** There is
no local path: `supabase functions serve` needs Docker, and the app calls the
deployed function by name. Deploying is independent of the app, so the order is
always deploy first, then run the client. Everything non-AI — auth, feed,
filters, detail, posting, profile — is testable in Expo Go with nothing deployed.

**Edge Functions verify the JWT by default.** There is no `[functions.*]` block in
`config.toml`, so all three require a session; supabase-js attaches it
automatically and every screen that calls them is behind the auth gate. A 401
from one of them means the caller is signed out, not that the function is broken.

**The map needs a development build.** Expo Go cannot apply the native Maps
key, so the map is blank there. Every other screen works in Expo Go — don't
"fix" a blank map that is just running in the wrong client.

**`supabase db query` exits 0 even when the SQL fails** — it reports the error
as JSON on stdout. Never call it directly from a check script; `db:seed` and
`db:rls-check` go through `scripts/run-sql.mjs`, which greps the output and
exits non-zero. A check that cannot fail is worse than no check.

**The CLI asks for consent before any SQL on this project**, which it labels
production, and cannot ask from a script. `run-sql.mjs` passes `--yes` only when
given it; `db:rls-check` does, because it always rolls back. `db:seed` does not,
because it writes, and re-running it duplicates every listing.

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
and no landlord name. If anonymous browsing is ever enabled, that policy needs
revisiting.

**The exact location is in `listing_locations`, never on `listings`.** The
`listings` row is readable by anon, so any column on it is public no matter
what the UI hides. `listing_locations` (address, lat/lng) is owner-only. A
trigger writes `approx_latitude/approx_longitude` back onto the listing, offset
from the real pin by a random bearing and distance drawn uniformly over a
500 m disc.

- The offset is random and stored once, never derived from the id. A
  deterministic offset could be reversed by anyone reading the migration, and
  a fresh offset per edit could be averaged away.
- The detail screen draws a 500 m circle (`APPROX_RADIUS_M`). It must match
  the disc, or the circle sometimes misses the property.
- Non-owners get no "Open in Maps", because navigating to the circle's centre
  sends them to the wrong street.
- The one other reader is the renter of a `confirmed` or `completed` booking
  on that listing (`listing_locations_confirmed_renter`, select only). A
  requested or accepted booking reveals nothing, and cancelling closes it
  again. Nothing else should ever be added to this policy.

**`profiles` has no phone column of any kind.** The login number lives in
`auth.users` and reaches its owner through `session.user.phone`.
`whatsapp_phone` was dropped when chat shipped. `profiles` is readable by
every signed-in user, so whatever is added there is public to them.

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
`status='draft'`, uploads images against its id, then moves it to
`PUBLISH_TARGET` (`pending_review`). A mid-flow failure leaves a private draft,
never a listing in review with missing photos.

**The status rules live in a trigger, not the UI.** `listings_guard_status`
decides which moves a landlord may make. Only `published` is public. Landlords
can never set `pending_review→published`, `rejected` or `suspended`, and every
insert must start as `draft`. The trigger only restricts `current_user =
'authenticated'` (PostgREST requests). The SQL editor, the service role and
security-definer functions are staff and pass through.
`LANDLORD_STATUS_ACTIONS` in `types.ts` offers only moves the trigger accepts.
Change the two together. A draft can only go to `pending_review`; republishing
a paused, unavailable or rented listing stays direct, because it was already
approved, or was live before verification existed.

**Roles are a table, never a column on `profiles`.** `user_roles` holds
`admin`/`verifier` rows, readable by their owner and by admins, because every
signed-in user can read `profiles`. Renter and landlord are not roles. There
are no write policies: an admin grants and revokes through `set_staff_role()`
from the account's page in the staff console. It will not remove the caller's
own admin role or the last admin, so the project cannot be stranded. **The
first admin still has to be inserted from the SQL editor.** `has_role()` is
security definer so policies can call it without recursing, and `admin`
satisfies every check.

**The staff console adds no new read power.** User search reads `profiles`
(readable by any signed-in user) and listing search uses the existing staff
select policy. Only three functions are new: `set_staff_role`,
`staff_audit_log` (verification and moderation events as one list; a
listing's review also appears on its owner's timeline) and `staff_stats`
(counts only, §62). `StaffOnly` in the screens is presentation.

**The staff listing search builds its own query on purpose.** "Nothing builds
its own listings query" protects the public search paths, which must all go
through `Filters`. The staff search shows drafts and suspended listings and
is not one of them.

**Staff sign in like everyone else** (one emailed code). Stronger staff
authentication (Features #63) is a known gap, not built.

**"Flagged messages" is the reports queue with `?flagged=1`**: the reports
the message trigger files itself, which have no reporter. One table, two
views, so a flag and a human report about the same conversation sit together
on the subject's account page.

**Every staff action is a checked security-definer function**
(`decide_verification`, `staff_listing_location`). Each one checks `has_role`
itself and raises `42501` otherwise. Because they run as their owner, the
status trigger lets their moves through. A new staff function that forgets the
role check is open to every signed-in user. `isStaff` in the auth context only
decides which screens are shown.

**A material edit is detected by triggers, not by the edit screen.**
`listing_material_edit()` is called from triggers on `listing_locations`,
`listing_images` and `listings.district/sector`, and only acts when
`auth.uid()` is the owner. A published listing moves to `pending_review` at
once. A paused, unavailable or rented one keeps its status and gets
`review_reason`, and `listings_guard_status` turns its next "republish" into
`pending_review`. Without that second half, pausing first would be a way
around the rule. The landlord cannot write `review_reason`; staff approval
clears it. The case carries `reopen_reason` so the reviewer sees why an
approved listing is back.

**Unchanged values are not an edit.** The edit screen upserts the location on
every save, so the location trigger compares old and new. Reordering photos
(`position`) is not a photo change.

**Entering `pending_review` opens the review case by trigger**
(`listings_open_review_case`), so submitting stays one update. Approving a
listing requires the owner's `identity_checked` badge (rule 9), at least one
named check, and a reviewer who is not the owner. Refusing or requesting
changes requires a note, because the landlord sees it.

**Badges are written only by `decide_verification`.** Every badge
(`profile_badges`, `listing_badges`) names what was checked and is readable by
anyone. Cases, evidence and `verification_events` (the audit log) never ride
along with a feed query. In the UI, badges are a green shield in the card body,
never gold on the photo like Featured.

**Staff reach the exact address only through `staff_listing_location`.** It
works only while the listing has an open case, and logs a `viewed_location`
event every time. The `listing_locations` policy itself stays owner-only.

**ID documents are in a private bucket** (`verification-evidence`,
`{uid}/{case_id}/{file}.jpg`, images only). Uploads are accepted only under one
of the uploader's own open cases. There is no update or delete policy, so a
document can't be swapped after a reviewer has seen it. Staff view documents
through 5-minute signed URLs, with `cachePolicy="memory"` so they never land
in the disk cache.

**`availability_confirmed_at` is always the server's clock.** Any change to
it, and every move to `published`, is overwritten with `now()` in the same
trigger, so a client can't backdate or pre-date a confirmation. "Still
available" therefore sends any value; it is the change that counts.

**`listing_status_history` is written only by trigger** and is readable only by
the owner. There are deliberately no write policies. `changed_by` is filled
only when the owner made the change. The owner reads this table and anyone
signed in reads `profiles`, so a staff id there was a name; staff actions are
attributed in the staff-only logs instead. (`verification_cases.decided_by`
still has this leak to the case's owner. Fixing it needs a column-level
revoke, which breaks `select *`.)

**A report never reaches the reported party.** `reports` has a select policy
for the reporter and for staff, and none for the target, so they learn neither
who reported them nor that anyone did. `reports.target_id` is polymorphic with
no foreign key, so one queue covers listings, users and messages, and a report
outlives its target. The insert trigger runs as the caller, so "does the
target exist" is answered through RLS: a listing you cannot see cannot be
reported, which stops reporting from being a probe for hidden listings.

**A report has two notes for two readers.** `resolution_note` goes to the
reporter. The note on a suspension or restriction goes to the affected user.
`action_taken` lets the reporter's screen say what happened without either
note crossing over.

**Restrictions and suspensions are their own tables** (`account_restrictions`,
`listing_suspensions`), one row per event, kept after lifting, so the history
is the table. Neither names the actor, because the affected user reads them.
The actor is in `moderation_events`, which is staff-only and written only by
the functions.

**A restricted account's listings keep their status.** They leave public reads
through `is_restricted(owner_id)` in the two listings select policies, so
lifting the restriction puts every listing back exactly as it was.
`is_restricted` is security definer and callable by anon, because the anon
feed evaluates the policy. `listing_images` and `favorites` decide visibility
by querying `listings`, so they inherit this without their own change.

**Restoring a listing returns it to the status before the suspension**, read
from `listing_status_history`, never straight to `published`. It also does
not re-stamp `availability_confirmed_at`: coming back from a suspension is not
the landlord confirming anything.

**Unstated rental terms match filters.** `maxMinRentalMonths` and
`availableBy` are built as `or=(col.is.null,col.lte.X)`, because a landlord who
left the field blank hasn't said no. Several `or=` params AND together in
PostgREST (verified), so the two filters combine correctly. `amenities` is
all-of (`cs`), not any-of.

**Favorited listings stay visible after they stop being published.**
`listings_select_favorited` lets a renter keep reading a saved listing once it
is paused, unavailable or rented. That is the point of favorites: knowing it
went. Moderation states (`rejected`, `suspended`) still hide it. To stop that
policy from becoming a back door, a favorite can only be *created* on a
`published` listing. `price_at_save` is captured by trigger, so the "price
dropped" badge can't be faked from the client.

**The feed map shows only loaded pages** and draws every listing at its
approximate point with a 500 m circle. The tap target is the price bubble,
because circles aren't tappable on iOS. Both maps import `APPROX_RADIUS_M`
from `src/lib/maps.ts`.

**Typed routes come from the dev server.** A new route file isn't a valid
`router.push` target for `tsc` until `.expo/types/router.d.ts` is regenerated
by `npx expo start`. Starting it is enough; nothing has to bundle:
`npx expo start --offline --max-workers 1 --port 8099`, wait a few seconds for
the file to change, then kill the process. CI has no such file, so there typed
routes are simply not enforced.

**Amenity keys exist in two copies:** `src/lib/amenities.ts` and
`supabase/functions/_shared/filters.ts`. The function's copy is a schema enum,
not sent by the app. Drift can only make the AI drop an amenity, because the
app re-validates with its own enum, but keep them identical.

**Storage object names are unique, never index-based.** Ordering lives in the
`position` column and the object name is opaque — never parsed. Index names
(`{listingId}/0.jpg`) broke as soon as editing existed: removing the first photo
and adding another would overwrite a surviving file.

**Image positions are append-only and may have gaps.** New photos go at
`max(position) + 1`. Renumbering would collide with the unique
`(listing_id, position)` constraint partway through, and nothing depends on them
being contiguous because ordering is `ORDER BY position`.

**Photo edits are staged until Save.** Nothing uploads or deletes while the user
is still on the edit screen, so backing out leaves the listing untouched. On
save, removals run before uploads — a failed upload then leaves the listing with
fewer photos rather than more than `MAX_IMAGES`.

**Photos are compressed before upload** (1600px longest edge, JPEG q0.7, in
`create.ts`). Raw phone photos are 3–8 MB; this is the main thing making the app
usable on Rwandan mobile data. Uploads are sequential, not parallel — concurrent
uploads on a weak connection stall each other.

## Chat

**Conversations are created only by `start_conversation()`.** There is no
insert policy. The rules need the listing's owner and the other side's blocks,
and the renter's own policies show neither. One conversation per
`(listing_id, renter_id)`. It survives the listing being paused, rented or
deleted (`listing_id` is `on delete set null`, and `listing_title` is a
snapshot so the inbox still reads).

**Masking is a `before insert` trigger, and it keys on `kind`, not on the
caller.** `messages_before_insert` is security definer, because it must see
blocks the sender cannot read and write originals the sender cannot. Inside a
definer function `current_user` is the owner, so the `current_user =
'authenticated'` test the listing trigger uses is useless there. Instead:
everything a person types is `kind = 'text'` (the insert policy allows nothing
else) and is checked and masked; `system` rows come only from functions and
pass through.

**The original text is in `message_originals`, which has RLS on and no policy
at all.** Not the recipient, and not the sender either. The foreign key is
`deferrable initially deferred` because the trigger writes the original a
moment before the message row exists.

**The app shows what was stored, not what was typed.** `useSendMessage` reads
the inserted row back and renders that, so the sender sees the `•••` the
other person sees, with the notice under the bubble.

**`mask_contact_details` and `message_is_suspicious` are pure SQL functions**
so the fixtures at the top of `rls_check.sql` can call them. The order inside
the mask matters: USSD codes first (they contain a phone number), then email,
then `+`-prefixed numbers, then local Rwandan forms. The Rwandan pattern is
exactly nine national digits starting 72/73/78/79 with no digit touching
either end. That is what lets "250,000 RWF", "780000" and "2026-11-15"
through. Add a fixture before touching either regex. Known gap: a bare
nine-digit run like "780000 800" is masked.

**Masking stops at a confirmed booking, for new messages only.**
`contact_masking_active(conversation)` is false while a `confirmed` or
`completed` booking exists between that renter and that listing, and true
again if it is cancelled. Old messages stay masked: unmasking history would need a
recipient read path into `message_originals`, and that is the back door the
table exists to close.

**Staff have no policy on any chat table.** Their only way in is
`staff_report_conversation(report_id)`. It needs an *open* report on the
conversation or on a message in it, returns the text as typed, refuses a
reviewer who is a participant, and logs `conversation_viewed` every call.
Closing the report closes the conversation to staff. The screen makes the
reviewer press a button first, because opening it is the logged act.

**`reports.subject_user_id` is resolved by the insert trigger**, as the
caller: the listing's owner, the account, the message's sender, or the other
participant. Staff cannot read conversations, so without it a message report
would name nobody they could act on. The client cannot set it.

**Realtime is a hint, never the source of truth.** Both subscriptions
(`useInboxRealtime`, `useConversationRealtime`) refetch on `SUBSCRIBED` and
when the app returns to the foreground, because on a flaky connection a dropped
event is the normal case. Realtime applies the `messages` select policy, so
the unfiltered inbox subscription only receives the caller's own
conversations. `rls-check` cannot exercise Realtime: a non-participant
subscribing and receiving nothing is a manual test.

## Booking

**No client writes `bookings`.** There is a select policy (the two parties and
staff) and nothing else. Every change is one of four functions:
`request_booking`, `respond_booking`, `confirm_booking`, `cancel_booking`.
Under them, `bookings_guard` enforces the state machine again, so a bug in a
function cannot make an impossible move. `payment_required` and
`payment_confirmed` are in the status list for Phase 6 and the guard refuses
every move into them (rule 14).

**The server decides instant or request.** `request_booking` books at once
when the listing allows Instant Book and the renter is eligible: a named
profile, a move-in date on or after `available_from`, a stay of at least
`min_rental_months`. That is the whole list, on purpose (rule 10).
`wouldBookInstantly` in `features/bookings/types.ts` mirrors it only so the
button says what will happen. Change the two together.

**A booking has no free-text column, and system messages never quote a user.**
System messages are not masked, so anything a person typed that ended up in
one would be a way around masking. The renter's note is inserted as their own
`text` message and masked like any other. The single exception is the note on
a staff cancellation, which staff write for both readers.

**Every booking event posts a system message** through `booking_announce`,
creating the conversation if the two have never spoken. That is how "ask for
more information" works: in the chat, with no application form (§23). The
conversation screen shows the live booking as a bar with its actions, so a
landlord can accept from where they were asked.

**Two listing statuses belong to booking alone.** `booking_pending` (accepted,
waiting for the renter) and `reserved` (confirmed). Neither is public. A
landlord's only move is `reserved -> rented` at move-in, which completes the
booking by trigger. `booking_release_listing` returns a listing to
`published` when its booking ends, or to `pending_review` if its location or
photos changed meanwhile. It has to check that itself, because it runs as the
function owner and the guard trigger lets it through.

**A renter keeps seeing a listing they are booking** after it leaves the feed
(`listings_select_booked`), but never a draft, rejected or suspended one.

**Expiry runs three ways.** `pg_cron` calls `expire_bookings()` every 15
minutes; every booking function calls it first; and `respond_booking` and
`confirm_booking` refuse a row past `expires_at` on their own. A late cron
therefore cannot let a stale request be accepted. The `cron.schedule` call is
wrapped so a project without `pg_cron` still migrates.

**Wrong-state refusals raise `object_not_in_prerequisite_state`**, and "not
yours to do" raises `insufficient_privilege`. `rls-check` tells them apart.

**Staff can read and cancel bookings, nothing else.** They cannot accept,
decline or confirm for anyone. A staff cancellation needs a note and is logged.

## Help content

**The help screens are bundled text, not fetched** (`src/features/help/
content.ts`, routes `/help` and `/help/[topic]`). Someone reads "paying
safely" when a deal feels wrong, which is when the connection is bad.

**Every sentence there describes real behaviour.** What is masked, what staff
can read, where data is stored. If a rule changes, change the words in the
same commit. The privacy topic is a statement to users about their data.

Linked from: the profile tab, the badge list on a listing ("What these checks
mean"), the masking notice under a chat bubble ("Why?"), the line at the top
of a conversation, and the suspension notice.

## Notifications

**`notify_user()` is the only writer of `notifications`, and it is internal.**
Execute is revoked from `anon` *and* `authenticated`. Supabase grants execute
on every new function to both by default, so "internal" has to be said in the
migration. It is reached only from security-definer triggers on the tables
where things happen (messages, verification cases, reports, suspensions,
restrictions, listings). The staff functions were not edited to call it, so a
new staff function gets its notification for free by writing its row.

**The words are composed in SQL, once** (`title`, `body`), so the in-app list
and the push banner cannot disagree, and an older app can render a kind it has
never heard of. `payload` carries ids for navigation only.

**Repeats collapse.** With a `collapse_key`, a repeat updates the one unread
row for that key instead of inserting (ten messages in a conversation are one
line). The update clears `pushed_at`, so the phone still buzzes each time.

**A message notification carries the stored body**, so a masked number is
masked on the lock screen too.

**`send-push` runs without JWT verification and is safe anyway.** Postgres
calls it through `pg_net` and has no user token. The request carries a
notification id and nothing else; recipient, words and tokens are read
server-side with the service role. A row is claimed by setting `pushed_at`
where it is null, so a second call sends nothing. When push is not wanted
(preference off, conversation muted, no device), `notify_user` sets
`pushed_at` itself, which is what makes the function refuse. It is the only
function with a `[functions.*]` block in `config.toml`; the three AI functions
still require a JWT. Deploy it with `--no-verify-jwt`.

**`pg_net` is asynchronous and transactional.** The request is queued in the
transaction and sent after commit, so a rolled-back action sends no push, and
`rls-check` (always rolled back) cannot send one. The queueing is wrapped in
an exception handler: a failed push must never undo the message or decision
that caused it.

**The send-push URL is a row in `push_config`**, not a literal in the
function. It names this project's ref. Another project needs one `update`.

**The push token is the primary key of `push_tokens`.** One device, one row,
whoever is signed in. `register_push_token()` moves the row when another
account signs in on the same phone, which is why it is a function and not an
insert policy. Sign-out unregisters first, while a session still exists.

**Everything in `src/lib/push.ts` returns quietly when push is impossible**:
Expo Go (no remote push on Android since SDK 53), a simulator, web, or a build
with no EAS project id. The notifications list does not depend on any of it.

**The Android channel id `default` exists in two places**: `src/lib/push.ts`
creates it and `send-push` addresses it. Android silently drops a notification
sent to a channel the device does not have.

**The CLI refuses hosted mutations from an agent without `--yes`**
("HostedMutationConsentRequiredError"). `functions deploy` and `db push` both
need it. The owner's standing authorization in the work plan is what makes
passing it legitimate; it does not extend to `config push` or `db:seed`.

**"Read" is the server's clock**, like availability: any change to
`last_read_at` is overwritten with `now()`. Only `last_read_at`, `archived`
and `muted` are updatable (column grants), so a participant row cannot be
re-pointed.

**Message queries name their columns, never `*`.** A column added to
`messages` later should not start arriving on phones by accident.

**`Alert.alert` shows at most three buttons on Android.** Menus with more
use `src/components/action-sheet.tsx`.

**The feature folder is `messaging`**, because `features/listings/chat.ts` and
the `chat` Edge Function are the AI assistant, and the Ask tab's file is
`(tabs)/chat.tsx`.

## AI features (all three built)

Three Edge Functions, one shared key: `smart-search`, `chat` and `auto-describe`
under `supabase/functions/`, all holding `GEMINI_API_KEY` (Google AI Studio free
tier). **The key must never enter the app bundle** — anything shipped in React
Native is extractable.

**`supabase/functions/_shared/` is imported by all three, so editing it means
redeploying all three.** `gemini.ts` holds the model default, CORS, the JSON
helper and the provider-error mapping; `filters.ts` holds the filter contract —
response schema, sentinel decoding, and the Kigali vocabulary rules — shared by
`smart-search` and `chat`. Both files exist because the duplication was already
drifting between copies, and the place-name rules are the last thing that should
disagree between two entry points.

The model's only job is to emit a `Filters` object; the existing listings query
does the searching. The chatbot, the search bar and the manual filter sheet are
therefore one code path, so a bad parse degrades to a normal inspectable filter
rather than a mystery result set. The app re-validates the response with its own
`filtersSchema` before applying it — the function shapes the output, the app
decides what is valid.

Kigali place names are sent *from* the app (`src/lib/locations.ts`) rather than
duplicated in the function, so there is one source of truth for the vocabulary
the model is allowed to use.

**Gemini model names expire for new API keys.** `gemini-2.5-flash` returned
404 "no longer available to new users" on a 2026 key; the default is now
`gemini-3.6-flash`. A 404 here means the model name, not the code. `GEMINI_MODEL`
overrides it without a redeploy.

**Never return raw provider errors to the client** — they are verbose and can
echo request internals. They go to the function logs; the client gets a short
message it can act on. (There is no `supabase functions logs` subcommand, so
diagnosing means temporarily returning the detail, then removing it.)

**Auto-describe writes a draft, never a published fact.** The result lands in
the same Description field the landlord would have typed into, on the post
wizard's details step, behind a "Write it for me" action on the field's label
row (`TextField`'s `accessory` slot). The prompt's prohibitions are the load-
bearing part: no rent, no floor area, no distance to a landmark, no utilities or
security claims, no describing people in the photos. A tenant who arrives to
find an invented detail is the problem the brief opens with.

**Price is deliberately withheld from the describe prompt.** It has its own
field on every card and the detail page, and prose that repeats it contradicts
the listing the first time the rent is edited.

**Describe photos are compressed smaller than upload photos** (1024px / q0.6 vs
1600px / q0.7, both in `create.ts`). Vision models tile their input, so a larger
image buys no extra detail — it just doubles the data spent posting one listing
on mobile data. Sequential, like the uploads: decoding several multi-megapixel
photos at once is what makes a cheap device drop frames mid-post.

**Auto-describe is wired into the post wizard only.** The edit screen's existing
photos are already in storage, so describing them needs a second input mode
(URLs fetched server-side) — and that URL has to be pinned to this project's own
storage host before it is safe to accept.

**`temperature` differs by function on purpose:** 0 for smart-search (filter
extraction has one right answer, and a retry returning different results looks
broken) and 0.6 for auto-describe (a landlord who dislikes the wording presses
the button again, and at 0 they get the same paragraph back).

**The chatbot never sees a listing row, on purpose.** The brief describes an
assistant that "reads the live database"; `chat` instead returns a reply plus a
complete `Filters` object, and the app runs `useListingsFeed` and renders the
real rows under the reply. A model that cannot see listings cannot invent a
property, quote a stale rent, or promise availability — the three failures that
would make the assistant worse than the WhatsApp groups the app replaces. The
prompt forbids stating counts or naming a property for the same reason.

**Chat criteria chips are read off `Filters`, not off the reply.** `filterSummary`
in `types.ts` renders what the query actually ran with, so a reply whose wording
drifts from the filters is visibly contradicted rather than believed.

**Chat filters are complete every turn, not deltas.** The filters in force are
described to the model in prose (`currentStateLine`), and it returns the whole
set it wants applied — that is what makes "under 200,000" keep the sector from
two turns ago, and "start over" clear everything.

**"Cheapest" is a sort, not a filter.** `chat` returns `sort` beside the filters
and the app maps it to the feed's existing `SortOrder`. Letting the model invent
a `maxPrice` for "cheapest" would silently hide the cheap listings above its
guess.

**`useListingsFeed` takes an `enabled` flag** so the Ask tab does not fetch the
unfiltered feed before the assistant has answered.

**Only the newest chat turn shows results.** One query per historical bubble
would spend requests on rows the renter has scrolled past, on connections where
a hanging request is the normal case.

Deploy with `npx supabase functions deploy smart-search` /
`npx supabase functions deploy chat` /
`npx supabase functions deploy auto-describe`; Docker is not needed.
`supabase/functions` is excluded from both `tsconfig.json` and
`eslint.config.js` — it is Deno, with `npm:` specifiers and a `Deno` global that
the app's toolchain cannot resolve.

## Search-path constraints (hold for every entry point)

**Sort is not part of `Filters`.** It lives beside it in `filters-context`,
because `Filters` is the shape the AI parsers target and it should describe what
to *match*, not how to order. Featured listings float to the top only under
the default "newest" ordering — letting paid placement override an explicit
"price: low to high" makes the sort look broken.

**`Filters` in `src/features/listings/types.ts` is the AI's target.** It is the
single description of what can be searched. All three paths — the chatbot, the
search bar and the manual filter sheet — produce a `Filters` object and hand it
to the same query. Nothing should ever build its own listings query; that is what
keeps a bad parse inspectable instead of mysterious.

Use `claude-opus-5` unless told otherwise, and check the `claude-api` skill
before writing SDK calls rather than working from memory.

## Layout

```
src/
  app/                      expo-router routes
    (auth)/                 sign-in, verify, profile-setup
    (tabs)/                 index (feed + map), chat (Ask), saved, messages,
                            profile; post is a hidden tab reached from profile
    (tabs)/messages.tsx     inbox, with archived filter and unread state
    conversation/[id].tsx   one conversation: bubbles, composer, block/report menu
    book/[listingId].tsx    request or instant-book form: date, length, note
    bookings.tsx            my bookings, as renter and as landlord
    staff/bookings.tsx      staff: every booking, cancel with a note
    help/                   safety and help: index + one screen per topic
    notifications.tsx       the in-app list; tap opens the screen it is about
    notification-settings.tsx  push state + per-category switches
    staff/conversation/[reportId].tsx  logged staff read of a reported conversation
    (tabs)/saved.tsx        favorites, with select-to-compare
    compare.tsx             2–4 listings side by side
    verify-identity.tsx     landlord ID upload (not (auth)/verify, the OTP step)
    review/                 staff queue + case decision
    staff/index.tsx         staff console: queues, lookups, counts
    staff/users/, listings/ search + detail with suspend/restore; roles on a user
    staff/audit.tsx         one timeline; ?subject= narrows to a user or listing
    staff/roles.tsx         admin only: who the staff are
    staff/reports/          staff reports queue + report detail and actions
    report.tsx              report form (modal): /report?type=listing|user&id=
    my-reports.tsx          the reporter's own reports and their outcome
    user/[id].tsx           a landlord as others see them; no contact details
    listing/[id].tsx        detail + map + "Message landlord"
    listing/edit/[id].tsx   edit fields + photos (flat form, not the wizard)
    filters.tsx             filter sheet (modal)
  features/
    auth/context.tsx        session + profile, routing gate
    listings/               types, queries, create, filters-context,
                            smart-search, chat, auto-describe
    verification/           badge labels, case queries, evidence upload
    moderation/             report reasons, report + moderation queries
    staff/                  console queries: stats, lookups, audit, roles
    help/                   the help text itself (content.ts)
    bookings/               booking queries, status labels, instant-book rule
    messaging/              inbox, messages, realtime, blocks (not the AI chat)
    notifications/          list, preferences, realtime, push tap routing
    profile/                public profile query
  lib/                      supabase, auth, format, locations, push,
                            edge-functions, images (pick + compress)
  theme/                    colour, spacing, radius, shadow tokens
supabase/
  functions/_shared/gemini.ts         key, CORS, provider errors (all three)
  functions/_shared/filters.ts        filter contract (smart-search + chat)
  functions/smart-search/             query -> Filters
  functions/chat/                     conversation -> reply + Filters
  functions/auto-describe/            photos -> description
  functions/send-push/                notification id -> Expo Push (no JWT; see
                                      its header for why that is safe)
  migrations/20260910120000_init.sql  schema, indexes, RLS, storage policies
  migrations/20261024120000_private_location.sql  listing_locations, approx point,
                                                  drops profiles.phone
  migrations/20261024130000_listing_terms_and_status.sql  terms, status model,
                                                  guard trigger, history
  migrations/20261024140000_favorites.sql        favorites + saved visibility
  migrations/20261110120000_roles_and_verification.sql  roles, cases, badges,
                                                  review gate, evidence bucket
  migrations/20261115120000_reports_and_moderation.sql  reports, restrictions,
                                                  suspensions, moderation log
  migrations/20261116120000_chat.sql  conversations, messages, masking, blocks,
                                      staff transcript, drops whatsapp_phone
  migrations/20261117120000_notifications.sql  notifications, push tokens,
                                      preferences, notify_user + its triggers
  migrations/20261118120000_staff_console.sql  set_staff_role, staff_audit_log,
                                      staff_stats, admin read of user_roles
  migrations/20261119120000_re_review_after_edits.sql  review_reason,
                                      material-edit triggers, guard update
  migrations/20261120120000_booking.sql  booking settings, bookings + guard,
                                      location release, masking end, expiry cron
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
