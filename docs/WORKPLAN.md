# Work plan: rest of Phase 3, then Phase 4

Written 2026-11-12 as a handoff. Read `CLAUDE.md` first: it is the decision log
and lists the traps. This file says **what to build next, in what order, and
what "done" means**. When a milestone ships, update the Roadmap section of
`CLAUDE.md`, record new decisions and traps there, and tick the milestone off
here.

The target is the Blueprint's MVP (§60–§62, §71). The flows are: renter signs
up → search → view → favorite → compare → **chat → book**; landlord verifies →
lists → **chats → accepts or instant-books**; staff **verify → moderate →
handle reports → support → monitor**. Everything in bold is still to build.

**Stop after Phase 4 (M7) and wait for the owner's review.** Don't start
Phase 5 (AI matching, alerts) or anything involving payments.

---

## Working agreement (what the owner authorized on 2026-11-12)

The owner wants the next model to do most of the work on its own. It is
authorized to:

- Write and apply migrations to the live project (`npm run db:push`), and deploy
  Edge Functions.
- Commit, push to GitHub, and merge into `main`.
- Make implementation decisions on its own. Product decisions that are already
  recorded here or in `CLAUDE.md` are settled. Anything else that changes what
  a user sees or what data is collected: pick the option most consistent
  with the 16 product rules, record it in `CLAUDE.md` with the reasoning, and
  list it in the end-of-milestone summary so the owner can overturn it.

Still off-limits without asking:

- `npm run db:seed` against the live project. It duplicates every listing.
- `supabase config push`. Run `supabase config diff` first; see `CLAUDE.md`.
- Uploading real identity documents, or anything else that would put a real
  person's data in eu-central-1 before data residency is settled.
- Payments of any kind, and any new paid vendor account.
- Deleting data in the live project beyond what a migration needs.

### Per-milestone routine

1. Branch from up-to-date `main`: `feat/<milestone-slug>`.
2. Read the Expo v57 docs for any Expo API you touch (`AGENTS.md`). The SDK
   changed, so don't work from memory.
3. Migration first, then `npm run db:push`, then extend
   `supabase/rls_check.sql` with assertions for **every** new table and
   security-definer function: a stranger can't read it, a participant can't
   forge it, a non-staff caller gets `42501`. Then run `npm run db:rls-check`.
   A failure blocks shipping.
4. Build the client. Every list screen needs loading, empty and error states.
5. `npm run typecheck` and `npx eslint .` must be clean.
6. Update `CLAUDE.md`: the roadmap, the layout tree, the migrations list, and
   architecture notes for every non-obvious decision. Write them in the same
   "why, not what" register the file already uses.
7. Commit using the repo's style (one imperative sentence summary, body
   explaining why), push, and merge to `main` with `--no-ff`.
8. Write a short summary for the owner: what shipped, the decisions you made,
   and what needs a device test.

Metro runs out of memory on this 8 GB machine. Start it with `--max-workers 1`.

---

## M0: Housekeeping (do first, small) — DONE 2026-11-15

- **Get `main` current.** `main` holds only "Docs 1". The real history is on
  `feat/mvp-phases-1-2` (on origin) and `feat/phase-3a-verification` (local,
  ahead of it). Push `feat/phase-3a-verification`, then fast-forward or merge
  it into `main` and push. Leave the old branches in place.
- **Add CI.** Add a GitHub Actions workflow that runs `npm ci`,
  `npm run typecheck` and `npx eslint .` on push and on pull requests. It must
  not touch the database: `rls-check` needs credentials and stays local.
- Done when `main` on GitHub matches the 3a work and CI passes on it.

---

## M1: Reports and moderation (Phase 3b) — DONE 2026-11-15

Blueprint §27, §40. Features #23, #24, #58.

**Reports.** Any signed-in user can report a **listing**, a **user** or (once
M3 exists) a **message**. The reasons are the Blueprint §27 list: fake property,
fake landlord, incorrect price, property unavailable, misleading photos,
misleading description, duplicate listing, scam, harassment, inappropriate
content, suspicious payment request, and other. Other requires a note.

- A `reports` table holding the reporter, the target type and id, the reason,
  a note, the status (`open → in_review → resolved | dismissed`), a severity
  set by staff, the resolution note and the resolver.
- The reporter can insert a report and read their own reports with their status
  (Features #24 and the "report result" notification). They can't read
  anyone else's. The reported party never sees who reported them.
- Rate-limit by trigger, for example one open report per reporter and target,
  so one person can't flood the queue.
- Entry points: a "Report" action on the listing detail screen and on a
  landlord's profile. Keep the form short: pick a reason and add an optional
  note.

**Moderation actions** are security-definer functions that check `has_role`
and raise `42501`, following the `decide_verification` pattern. Each one
writes an audit row.

- `moderate_listing(listing, action, note)` with the actions `suspend` and
  `restore`. Restore returns the listing to the status it had **before** the
  suspension, read from `listing_status_history`. Never restore straight to
  `published`: a listing that was paused stays paused. `hide` is the same as
  suspend, so don't add a separate state.
- `restrict_account(user, action, note)` with the actions `suspend` and
  `restore`. Put the restriction in its own table, never a column on
  `profiles`, by the same reasoning as `user_roles`. A suspended account has
  these effects: its listings drop out of public reads (add the check to the
  listings select policy through a security-definer `is_restricted()`), it
  can't insert listings or messages, and it can still sign in and see a
  "your account is suspended" notice with the note.
- `resolve_report(report, outcome, note)`. A report can be resolved with an
  action, and the action functions accept an optional `report_id` that they
  link and resolve.
- Audit: either generalize `verification_events` into a moderation log or add
  a sibling `moderation_events` table. Both must be staff-read only, with no
  write policies, written only by the functions.

**Staff UI.** Add a Reports queue next to the existing `/review` queue,
grouped by status and sorted by severity and then age, plus a report detail
screen with the target summary and the action buttons. A note is required for
any action the affected user will see, as with verification.

Done when: a user can report a listing; staff see it, suspend the listing, and
the listing disappears from the feed and comes back on restore with its old
status. `rls-check` proves a non-staff caller can't call any of the functions
or read others' reports.

---

## M2: In-app chat (Phase 3c), the biggest milestone — DONE 2026-11-16

Blueprint §18, §19. Features #26, #28, #29, #30. Product rules 1, 2, 5.

**MVP scope:** text messages, a conversation tied to a listing, history, an
inbox, block, report, system messages and contact masking. **Not in scope:**
attachments, read receipts, typing indicators, voice and search. Leave room in
the schema, for example a `kind` column, but don't build them.

**Data model (suggested):**

- `conversations` holds the listing, the renter and the landlord. It is unique
  per `(listing_id, renter_id)`. The renter starts it from the listing detail
  screen. A landlord can't message their own listing, and nobody can start a
  conversation on a listing that isn't `published`. Once it exists, the
  conversation survives the listing being paused or rented.
- `messages` holds the conversation, the sender, `kind` (`text` | `system`),
  the body and the time. Only the two participants can read it. Only a
  participant can insert, and only `kind = 'text'` with `sender = auth.uid()`.
  System messages come from security-definer functions only.
- Per-participant state goes in its own table: `last_read_at`, `archived` and
  `muted`. It drives the unread badge and archive/mute (Features #28).
- `user_blocks`: a block stops message inserts in both directions across all
  conversations. Enforce it in the insert policy or trigger, not in the UI.

**Realtime.** Use Supabase Realtime `postgres_changes` on `messages`. It
respects RLS. Verify that a non-participant subscribing receives nothing, and
make that a manual test step in the summary, because `rls-check` can't
exercise Realtime. Assume flaky connections: when the app returns to the
foreground or the connection comes back, refetch the latest messages rather
than trusting the socket.

**Contact masking (owner decision, 2026-11-12: mask, don't warn or block).**

- Masking happens **server-side, in a `before insert` trigger**. Masking in
  the client can be bypassed with the anon key.
- Mask the following: Rwandan phone numbers in all their written forms (`07x`,
  `+250`, `250`, with spaces, dots or dashes, and digit runs that normalize to
  a Rwandan mobile), email addresses, and MoMo/USSD payment codes (`*182*…`).
  Replace each with `•••`.
- Flag the message for staff, without masking it, when it contains links or
  external-payment and scam phrasing ("send money", "pay first", "MoMo
  number" and so on, in English, Kinyarwanda and French). Use the M1 reports
  queue as an automated report with a `system` reporter, or a `flagged`
  column that staff can query.
- Store the original text in a separate table readable by **staff only**, for
  moderation. Not by the recipient, and not by the sender either: the sender
  already knows what they typed. The sender's bubble shows the masked text plus
  a one-line notice: "Contact details are hidden until a booking is
  confirmed."
- Masking applies until a booking between the two parties for that listing is
  **confirmed** (M7). Until M7 exists, mask always. After confirmation, new
  messages go through unmasked. Older messages stay masked: unmasking history
  would need a recipient read path into the originals, and that is a back
  door.
- Unit-test the regex with a SQL fixture block in `rls_check.sql` or a small
  dedicated check script. The traps to cover: a price like "250,000 RWF" must
  not be masked as a phone number, and neither should years and dates.

**Remove WhatsApp.** When chat ships, the WhatsApp and Call CTAs on
`listing/[id].tsx`, along with `src/lib/contact.ts`, go. The listing CTA
becomes "Message landlord". This lifts the temporary exception to rule 1 in
`CLAUDE.md`, so update the rules section. Grep for `whatsapp` and `wa.me`:
references exist in about ten files, including sign-in and profile-setup copy.

**UI.** Add a Messages tab (the inbox, newest first, with an unread badge and
the listing thumbnail and title), a conversation screen with the listing
header card linking to the listing, and block/report in the conversation
menu. Any staff view of a conversation must go through a checked function that
logs the access, the same pattern as `staff_listing_location`, and only while
a report on that conversation is open.

Done when two accounts can chat about a listing in real time, a phone number
typed by either side arrives masked, a blocked user can't send, a stranger
reads nothing, and WhatsApp is gone from the app.

---

## M3: Notifications (Phase 3d) — DONE 2026-11-17, push delivery waits on credentials

Blueprint §37. Features #47, #48.

- A `notifications` table (the user, `kind`, a small JSON payload, `read_at`)
  that the user reads and marks read. Only triggers and security-definer
  functions write it. Use it to build an in-app notifications list (a bell on
  the profile tab or the feed header). This part needs no push setup and works
  in Expo Go, so build it first.
- Kinds for now: new message, verification decided, listing approved or
  rejected or changes requested, report resolved, account or listing
  suspended or restored, and a favorited listing changed (price drop, became
  unavailable or rented). Booking kinds arrive in M7.
- **Push:** use `expo-notifications` with the Expo Push Service. Store tokens
  in a `push_tokens` table (owner-only). Add an Edge Function `send-push`,
  triggered from the database through a database webhook or `pg_net`, that
  sends to Expo's push API. Respect mute on conversations.
- Preferences: a `notification_preferences` table with toggles per category.
  **Security and account notifications can't be turned off** (§37). There is
  no marketing category yet.
- **Needs the owner:** Android push requires an FCM project with
  `google-services.json` and EAS credentials, and iOS needs an APNs key. Build
  and deploy everything else, check that tokens register in a dev build, and
  list the exact credential steps for the owner. Don't create vendor accounts.

Done when the in-app list fills from real events, and push works end to end on
a dev build once credentials exist, or is documented as blocked on them.

---

## M4: Admin console, in the app (Phase 3e) — DONE 2026-11-18

Blueprint §40, §62. Features #56, #57, #58. **Owner decision: this is a
staff-only area inside the app, not a separate web app.** Grow `/review` into
a staff hub (`/staff` or similar) that only `isStaff` users see. RLS and the
checked functions remain the real boundary.

- **Users:** search by name, view a user's listings, badges, reports and
  restriction history, and suspend or restore them (M1 functions).
- **Listings:** search across every status, view one, suspend or restore it,
  and open its verification case.
- **Queues:** verification (exists), reports (M1), and flagged messages (M2).
- **Audit:** a read-only timeline of `verification_events` and the moderation
  log, filterable by actor and by subject.
- **Roles:** admins can grant and revoke `verifier` (and `admin`) through a
  checked function. A user can't remove their own last admin role. This
  replaces "grant roles from the SQL editor".
- **Basic analytics (§62):** counts only, from one security-definer function:
  listings by status, open cases, open reports, new users and new
  conversations per week. No third-party analytics (PostHog waits for beta,
  per `CLAUDE.md`).
- **Stronger staff authentication** (Features #63) is out of scope for now.
  Note it as a gap.

---

## M5: Safety and help content (small) — DONE 2026-11-18

Features #25, #49, Blueprint §39. Add static in-app screens: what each badge
means and what it doesn't guarantee, payment safety ("never pay before
viewing", MoMo scams), how reporting and appeals work, and privacy (what is
collected, why, and how to request deletion: a "contact support" email for
now). Link them from the profile tab, the badge explainer, and the masking
notice. Keep the copy short and plain.

---

## M6: Re-review after edits (open decision; decide it here) — DONE 2026-11-19

`CLAUDE.md` lists this as undecided. Recommended default, to implement unless
it turns out to be wrong: changes to **location or photos** on an approved
listing send it back to `pending_review` (a trigger opens a case), while
**rent, terms and description** edits don't. Rent changes are already visible
to favoriters through `price_at_save`. Record the decision.

---

## M7: Booking (Phase 4)

Blueprint §20–§23, §21 states, §22 settings. Features #31–#36. Rules 3, 4, 6,
7, 10, 14. No payments: rule 14 says design for them, so the state machine
includes the payment states, but nothing enters them yet.

**Landlord booking settings** live per listing: `instant_book_enabled` and
`request_to_book_enabled`, and at least one of them must be on. Instant Book
eligibility rules stay minimal (rule 10). A starting set: the renter has a
completed profile, the move-in date is on or after `available_from`, and the
duration is at least `min_rental_months`. Explain in the UI what each setting
means (§22: "clearly explain the consequences").

**Bookings table** holds the listing, the renter, the landlord, the mode, the
requested move-in date and duration, a short message, the status and
timestamps. The states are a subset of §21 and Features #33: `requested →
accepted | declined | expired | cancelled`, then `accepted → confirmed`, then
`confirmed → completed | cancelled`. Instant Book goes straight to `confirmed`.
Include `payment_required`/`payment_confirmed` in the enum but leave them
unreachable until Phase 6. Put the rules in a guard trigger, like
`listings_guard_status`: who may make which move, one active request per
renter and listing, an expiry (for example 72 h, enforced on read or by
`pg_cron`), and a requirement that the listing be `published`.

**Listing status:** add `booking_pending` and `reserved` (§28). A confirmed
booking moves the listing to `reserved` so it stops being bookable. The
landlord marks it `rented` at move-in. Update `LANDLORD_STATUS_ACTIONS` and
the trigger together.

**Location release (rules 3 and 4):** widen the `listing_locations` select
policy to the renter of a **confirmed** booking on that listing, and to
nothing else. `CLAUDE.md` already anticipates exactly this. The detail screen
then shows the exact pin and "Open in Maps" to that renter. Add `rls-check`
assertions: a requested or accepted booking doesn't reveal the address, and a
confirmed one does.

**Chat integration:** every booking event posts a `system` message into the
listing's conversation, creating the conversation if needed. This is how
"request more information" works: the landlord asks in chat, with no
application form (§23). Confirmation also stops contact masking for new
messages (see M2).

**Notifications:** request received, accepted, declined, confirmed, cancelled
and expired (M3).

**UI:** "Book now" or "Request to book" on the listing detail screen
depending on the settings, a renter's "My bookings" list, a landlord's
incoming requests with Accept/Decline, booking settings in the edit screen,
and booking status in the staff console (§40: view, and cancel where
permitted).

Done when a renter can request, the landlord accepts, the renter sees the
exact address only after confirmation, and Instant Book confirms immediately
when the rules are met. `rls-check` covers every transition a party mustn't
make.

**Then stop** and hand the owner a summary of Phases 3 and 4.

---

## Needs the owner (don't block on these; build around them)

| Item | Blocks | Status |
|---|---|---|
| FCM `google-services.json` + EAS project, APNs key | Push delivery (M3) | `eas.json` and the client are in place. Steps below |
| Pindo account, API token, sender ID | Phone OTP | Decided, not started |
| A monitored support inbox | Appeals and deletion requests (M5) | Set `EXPO_PUBLIC_SUPPORT_EMAIL`; until then the help screens say support is being set up |
| Data residency (Rwanda DPP law, §50) | Any real user data, especially IDs | Legal question |
| Evidence retention period | Purge job for ID photos | Undecided |
| Device testing on a dev build | Map, push, realtime on real networks | Manual |

### Turning push on (owner steps, about 20 minutes)

Everything else is built and deployed. These need your accounts.

1. **Create the EAS project.** In the repo: `npx eas-cli@latest init`. Accept
   the project name. It writes `extra.eas.projectId` into `app.json`. Commit
   that change.
2. **Create a Firebase project** at <https://console.firebase.google.com>
   (free; Analytics is not needed).
3. **Add an Android app** to it with package name `rw.rwandarentals.app`.
   Download `google-services.json` and put it in the repo root, next to
   `app.json`. Commit it (it is a client config, not a secret).
   `app.config.ts` picks it up by itself.
4. **Create the FCM V1 key.** Firebase Console → Project settings → Service
   accounts → Generate new private key. This JSON **is** a secret: do not put
   it in the repo.
5. **Upload it to EAS.** `npx eas-cli@latest credentials` → Android →
   development (repeat for production later) → Google Service Account →
   "Manage your Google Service Account Key for Push Notifications (FCM V1)" →
   upload the JSON from step 4. Delete your local copy afterwards.
6. **Build a development client:**
   `npx eas-cli@latest build --profile development --platform android`,
   install the APK, then `npx expo start --dev-client --max-workers 1`.
7. **Test.** Sign in on the phone, open a listing from a second account and
   send a message, and accept the permission prompt. Then
   `select * from push_tokens;` in the SQL editor should show one row. Close
   the app and send it a message from the other account: the phone should
   show it, and tapping it should open the conversation.

iOS additionally needs a paid Apple Developer account. `eas build` offers to
create the APNs key on the first iOS build; say yes.

If nothing arrives: `select id, kind, pushed_at from notifications order by
created_at desc limit 5;`. A null `pushed_at` means `send-push` was never
reached (check that the `pg_net` extension is enabled). A set one with no
banner means Expo or FCM refused it: look at the `send-push` logs in the
Supabase dashboard.
