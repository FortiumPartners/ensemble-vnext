## Item 4 — Sign up and get in, Disney optional

**Type:** /plan · **Size:** M · **Wave:** 1 · **Status:** Done · **Findings owned:** 26 · **Scenarios delivered:** A, B

### Kickoff

```
/plan docs/plans/trip-management-correction-roadmap.md — Item 4: Sign up and get in, Disney optional
```

**This section is the source for the command.** Links out of it are context only.

### Problem

A new web user is dropped back on the sign-in page after registering, and the form promises an email code that never comes. Anyone without an active Disney connection is locked out of every web app page, including Settings, the page they would need to reconnect.
- On mobile, "Plan a new trip" forces the Disney consent screen.
- The Terms and Privacy links on Register lead to Sign in.
- Sign-in ignores where the user was going.
- iOS Safari zooms the page on the sign-in field.
- The connect-Disney page has no way out.
- On desktop, a mobile overlay covers the landing page, so its controls can't be clicked, and the account menu is dead.
- Creating a dining alert is refused without a linked Disney account, by a product gate (`packages/workers/src/http/handlers/diningWatches.ts:13-19, 251-260`).
- Experience alerts refuse dates more than 60 days out.

Owner priority 2: *"sign-up and create-a-trip must work cleanly, primarily via WEB."* Scenario A requires dining and experience alerts on a trip with no Disney link.

### Issues addressed

Full steps, evidence and DB checks: the QA report [`README.md`](../qa/2026-09-27-trip-management/README.md) and the findings files. Each finding shows ID · severity · surface, then actual against expected.

**Registration and sign-in**

- **W-006** · major · Web desktop: Registering creates the account but drops the user on a 'WELCOME BACK / Sign in' page, signed out and with no confirmation. The promised email code step never appears.
  - *Actual:* POST /api/auth/register returns 201. The browser then goes to / and middleware bounces to /login, which says 'WELCOME BACK · Sign in to keep planning.' No success message, no code entry. The user has to retype the credentials.
  - *Expected:* Either signed in and taken to onboarding (/setup/trips), or shown a 'check your email for a code' step as the form promises ('We'll send a code to confirm.')
- **WM-002** · major · Web phone width: confirms W-006 at phone width: registering creates the account but drops the user on 'WELCOME BACK / Sign in', signed out, no confirmation, no email-code step
  - *Actual:* Lands on /login with empty fields and no message; the account exists (sign-in with it works, see WM-003)
  - *Expected:* Signed in and routed into onboarding, or the promised 'We'll send a code to confirm' step
- **WM-001** · major · Web phone width: Register's 'Terms' and 'Privacy Policy' links send a signed-out visitor to the Sign in page — the pages don't exist, so the user must agree to terms they cannot read…
  - *Actual:* Both links (href /terms, /privacy, same tab) land on 'WELCOME BACK / Sign in' at /login?callbackUrl=%2Fterms. No /terms or /privacy route exists in apps/web/app (middleware treats them as protected and redirects).
  - *Expected:* Terms and Privacy Policy open readable pages (ideally in a new tab or sheet so the form keeps its input); required-consent checkbox links to documents a signed-out user can read
- **WM-028** · minor · Web phone width: Sign-in ignores callbackUrl: signing in from /login?callbackUrl=%2Ftrips-home lands on /connect-disney (via / → /chat → /disclosure) instead of the page the user was…
  - *Actual:* Navigation chain / → /chat → /disclosure → /connect-disney; callbackUrl dropped
  - *Expected:* Return to /trips-home (outside the Disney gate, so reachable)
- **WM-029** · minor · Web phone width: iOS Safari zooms the whole page in when the Sign-in email field is focused (visualViewport scale 1.00 → 1.07, width 402 → 377) and stays zoomed after the field loses…
  - *Actual:* HUD before focus: 'iw=402 ih=714 vv=402x714 ot=0 s=1.00'. After focus: 'iw=377 ih=669 vv=377x669 ot=36 s=1.07 ae=input#login-email'. After typing and moving focus the page stays at s=1.07 (ios-005, ios-007).
  - *Expected:* No zoom on focus (inputs ≥16px); page stays at scale 1
- **W-038** · polish · Web desktop: Register discloses whether an email has an account ('An account with this email already exists'), while forgot-password deliberately hides it
  - *Actual:* 409 from POST /api/auth/register, shown inline as 'An account with this email already exists'
  - *Expected:* Consistent account-enumeration stance; forgot-password already uses 'If an account exists…'
  - *Note:* Same stance as M2-001.
- **WM-003** · polish · Web phone width: confirms W-038 at phone width: Register says 'An account with this email already exists' (account enumeration)
  - *Actual:* 409 from POST /api/auth/register and inline 'An account with this email already exists' under Email
  - *Expected:* Neutral response (forgot-password is deliberately neutral)
- **M2-001** · minor · Mobile app: Mobile Register reveals whether an email already has an account ('An account with that email already exists.') — same account-enumeration leak as web W-038
  - *Actual:* Inline red error 'An account with that email already exists.'
  - *Expected:* Registration should not confirm existence of an account (forgot-password deliberately hides it); e.g. 'Check your email to continue' or a generic error
  - *Note:* Same stance as W-038. The two platforms use different register routes.
- **M2-002** · polish · Mobile app: Register form keeps a stale validation error after the field is fixed ('Please enter your name.' stays visible after a name is typed) and shows only one error at a time
  - *Actual:* 'Please enter your name.' remains under the password field while the name field is filled; errors surface one per submit (name, then email, then password) in a single slot under the password field, not next to the field at fault
  - *Expected:* Error clears (or updates) once the offending field is edited; ideally per-field errors next to each field

**Users without Disney are locked out**

- **W-007** · major · Web desktop: Users without an ACTIVE Disney connection are locked out of every app page (/trips, /party, /settings, /chat, /pre-trip);
  - *Actual:* (app)/layout.tsx redirects to /disclosure → /connect-disney whenever there is no disney_connections row with status='active'. /trips-home is outside (app) and is the only page that loads.
  - *Expected:* A user can plan without Disney and link later (setup-state trips with 'Link Disney account' to-do; matrix TRP-113; trips-home PRD 'setup' lifecycle).
  - *Note:* Decision D4, now settled by scenario A.
- **WM-008** · major · Web phone width: confirms W-007 + W-016 at phone width: for a user without Disney, the Trips-home tab bar's Chat and Settings, 'Plan a new trip' and 'Finish setup' all dead-end …
  - *Actual:* Finish setup → /setup/trips?tripId=… 'Hey QA, Ready to plan your first Disney trip? No trips yet'. Chat, Settings and Plan a new trip → /disclosure ('STEP 1 OF 3 · CONNECT'). The disclosure page has no back link or sign out.
  - *Expected:* Settings (incl. sign out) reachable; Finish setup resumes that trip's setup; plan-without-Disney possible
- **WM-012** · major · Web phone width: confirms W-007 at phone width for an in-progress trip: 'Go to today' and 'Trip overview' both land on the Disney email screen, so a user without Disney can never open…
  - *Actual:* Both → /connect-disney ('What's your Disney account email?'). Also: sign-in itself lands on /connect-disney for this user, not on Trips home.
  - *Expected:* Today's view / overview of QA W1 Today Trip
- **M-013** · major · Mobile app: 'Plan a new trip' on Trips home sends a Disney-unlinked user to the Connect Disney consent screen, not to trip creation — no way to create a second trip without linking…
  - *Actual:* Lands on 'Connect Disney.' consent (I Agree — Connect Disney). No 'skip' / 'plan without Disney' option on that screen; Back returns to Trips home. NativeTripsHome pushes the bare '/(onboarding)' group, whose index gate routes unlinked users to consent.
  - *Expected:* Opens the create-trip form (NAVIGATION-REQUIREMENTS §3: 'Plan a new trip' → create); Disney linking is optional per the user's earlier choice
  - *Note:* Decision D4, now settled by scenario A.
- **W-036** · major · Web desktop: Settings Disney links go to a 404: 'Link someone new →', 'Connect →'/'Reconnect →' and the post-Disconnect redirect all point at /onboarding/consent (real route…
  - *Actual:* Navigates to https://app.heydart.com/onboarding/consent → Next.js '404 · This page could not be found.' Per DisneyConnectionSection.tsx:116/229/299 the same dead path is used after a successful Disconnect, so a user who disconnects lands on a 404, and with…
  - *Expected:* Opens the Disney consent / link flow

**Connecting Disney**

- **M2-007** · minor · Mobile app: After starting Connect Disney, My account and the user menu still say 'Not connected' — the pending invite is invisible and cannot be cancelled
  - *Actual:* Pill reads 'Not connected' and the button 'Link Disney account' restarts consent from scratch. DB: disney_connections row status=pending, then waiting_timeout ~10 min later — nothing in the UI shows either state
  - *Expected:* Status pill reflects the pending link ('Invite sent — waiting' / 'Still waiting' per PRD onboarding-and-disney-connection.md:258-293) with a way to resume or cancel it
- **M2-008** · minor · Mobile app: Connect Disney consent pre-fills the MY DISNEY EXPERIENCE EMAIL with the Dart login email, so a single tap on 'I Agree — Connect Disney' sends the Disney friend request…
  - *Actual:* The pre-filled Dart email was submitted immediately: disney_connections row created (status pending, service account agent2) and the app moved to 'Waiting on Disney.'. For users whose MDE email differs, the invite goes nowhere and the screen waits indefinitely
  - *Expected:* Field empty (or clearly marked as a guess needing confirmation) because the helper text itself says 'This must be the email you use to sign in to My Disney Experience'; empty field must be rejected
- **WM-009** · minor · Web phone width: confirms M2-008 on web at phone width: 'Disney account email' is pre-filled with the Dart login email, so one tap on Continue sends Disney's friend request to an address…
  - *Actual:* input[type=email] value='qa.trips.wm1@heydart.com'. Continue not pressed (would send a real Disney friend request).
  - *Expected:* Empty field (the page itself says 'This is your My Disney Experience email — not a sign-in to Dart')
- **WM-010** · minor · Web phone width: Connect-Disney at phone width is a dead end and repeats itself: heading 'What's your Disney account email?' appears twice (hero and card), stepper still says step 1…
  - *Actual:* Only interactive elements on the page: the email input and 'Continue →'. The email field sits at y≈687–727 of an 844px viewport (Continue below the fold, page scrolls to 1012px) — on a phone the keyboard will cover it (iOS keyboard check: see iOS section).
  - *Expected:* One heading; stepper reflects progress; a way back / 'Start planning, link later' / sign out
- **M2-009** · polish · Mobile app: 'Waiting on Disney.' status line always reads 'Checking status… last checked just now' (7+ minutes later), and the screen's continuous animation never settles
  - *Actual:* Text unchanged at 'last checked just now'; no 'Still waiting' state appeared by 7 min even though the DB row flipped to waiting_timeout by ~10 min (not observed on screen because I navigated away)
  - *Expected:* Timestamp advances ('last checked 30s ago') and after ~9 min shows 'Still waiting' + 'Send a new invite' (TRD onboarding-and-disney-connection.md:186-190)
- **M-001** · minor · Mobile app: 'Start planning, link later' card subtitle is nearly invisible (cream text on white card)
  - *Actual:* Subtitle rendered in near-white/cream on a white card; practically unreadable
  - *Expected:* Subtitle 'Build a trip now and connect Disney anytime from My Account.' readable (ink-3 on white/paper)
- **M2-003** · minor · Mobile app: Link-or-plan: the 'Start planning, link later' card's description is invisible (near-white text on white card)
  - *Actual:* Subtitle 'Build a trip now and connect Disney anytime from My Account.' renders in cream (#FBF1E0-ish) on a white card — effectively unreadable; it is also not exposed in the accessibility tree (button label is only 'Start planning, link later')
  - *Expected:* Card subtitle legible (WCAG AA 4.5:1), like the recommended card's subtitle
- **M-002** · minor · Mobile app: Create-trip CTA says 'Continue — link Disney next' after the user chose 'Start planning, link later', and it does NOT go to Disney linking
  - *Actual:* Button reads 'Continue — link Disney next'; tapping it lands directly on the pre-trip Trip screen (no Disney step). Label contradicts both the user's choice and the actual destination.
  - *Expected:* CTA copy matches the chosen path (e.g. 'Create trip') and the destination matches the label

**The desktop landing page**

- **W-001** · blocker · Web desktop: Desktop /pre-trip is covered by the MOBILE pre-trip overlay; visible controls are not clickable (clicks land on the hidden desktop view underneath)
  - *Actual:* The mobile pre-trip screen (giant single calendar cell, Trip/Chat bottom tabs) paints full-screen over the desktop view. Its wrapper has class md:hidden but ALSO inline style display:flex, and the inline style wins (computed display:flex at 1440px).
  - *Expected:* At >=768px only the desktop pre-trip canvas (Assistant pane + calendar/day rail) is visible and interactive; the mobile canvas is hidden (pre-trip/page.tsx comment: 'Hidden at >=md widths where…
  - *Note:* Pure layout fix with no foundation needed, so it ships in wave 1.
- **W-002** · major · Web desktop: Desktop /pre-trip (the default landing) has no working account menu and no way back to Your trips: the avatar shows '??' and does nothing, the Dart logo is not a link
  - *Actual:* PreTripDesktopView is position:fixed, z-index 10, full-viewport (0,0,1440,900), and draws its own header on top of the layout header. Its avatar is a plain DIV showing '??' (not the user's initials, 'JA' elsewhere) and has no handler.
  - *Expected:* Avatar opens the account menu (Your trips / switch trip, Settings, Sign out); the logo goes to the trips list, as on /trips-home and /chat
- **W-017** · polish · Web desktop: Pre-trip header shows 'Sep 30–30' for single-day trips, '??' instead of the user's initials, and a '· N days' countdown that reads like trip length
  - *Actual:* 'Pre-trip · Sep 30–30 · 2 days' for a 1-day trip. 'Oct 8–9 · 10 days' for a 2-day trip reads as a 10-day trip; it is actually days until the trip. The avatar shows '??'.
  - *Expected:* 'Sep 30' for one-day trips; the user's initials (JA) as elsewhere; countdown worded unambiguously (e.g. 'in 2 days')
  - *Note:* Same desktop header as W-002.
- **W-004** · major · Web desktop: A raw developer error banner ('[error] Uncaught Error: Minified React error #418 …' plus chunk URL) is painted across the top of production pages
  - *Actual:* A pink monospace strip over the page header reads '[error] Uncaught Error: Minified React error #418; visit https://react.dev/errors/418… @ https://app.heydart.com/_next/static/chunks/d416fa07-….js'. It hides the page title ('Your Party').
  - *Expected:* No debug output visible to end users in production

**Acceptance scenarios this item delivers** (§3): **A**; **B**. Their full text is under Acceptance criteria.

### Goal and shippable outcome

A new user can register on either platform, arrive signed in, and use Dart without linking Disney, including dining and experience alerts. They can link Disney later.

**Shippable outcome:**
- On web: register, arrive signed in, create a trip about 60 days out, and set up dining and experience alerts on it (scenario A, together with Item 1).
- On mobile: "Plan a new trip" goes straight to the create form.
- Connect and Reconnect Disney work from Settings.
- The desktop landing page is clickable and has an account menu.

### Scope

**In scope**

- **Registration and sign-in:**
  - registering signs you in, and the form stops promising a code (email verification was removed in commit `2c002745a`)
  - public Terms and Privacy pages
  - sign-in honours `callbackUrl`
  - auth inputs of at least 16px
  - a consistent stance on revealing whether an email has an account
  - per-field register errors
- **Access without Disney:**
  - remove the app-wide Disney gate (`apps/web/app/(app)/layout.tsx:106-125`)
  - mobile "Plan a new trip" goes to create (`apps/mobile/app/(onboarding)/index.tsx:42-65`; `apps/mobile/components/trips/NativeTripsHome.tsx:269`)
  - Settings' Disney links go to the real `/consent` route (`apps/web/app/(app)/settings/_components/DisneyConnectionSection.tsx:116, 229, 299`)
- **Alerts without Disney (scenario A):**
  - remove the create-only dining gate
  - experience alerts accept dates beyond today+60 and wait dormant until their dates enter the window, reusing dining's rule (`packages/data/src/repositories/diningWatch.ts:392-404`)
  - Lightning Lane alerts keep requiring Disney, and say so before the user builds one
- **Connecting Disney:**
  - an empty email field
  - one heading, and the right step
  - Back, "link later" and Sign out
  - a pending link visible in My account
  - a waiting screen that updates
  - a readable link-or-plan card
  - create-button copy that matches the user's choice
- **The desktop landing page:**
  - no mobile overlay at 768px and wider
  - a working avatar menu with initials
  - correct header dates and countdown
  - no developer error banner in production

**Out of scope / non-goals**

| Excluded | Owned by |
|---|---|
| The phone-width navigation shell, web trip switching, and Finish setup | Item 5 |
| Account settings (password, email, delete account) | Item 8 |
| A web form for experience alerts (chat covers scenario A on web) | Item 9 decides; §4.2 U7 |

### Surfaces

The surface matrix is §4.1. Where this item's UX differs by surface: §4.2 U6 (reaching account and sign-out), U7 (alerts per surface), U8 (iOS Safari).

| Surface | Delivers here | Acceptance check | Verified by |
|---|---|---|---|
| Mobile app (iOS) | "Plan a new trip" without Disney; readable link-or-plan card; register errors; connect-Disney states | Register → "link later" → create a trip → Trips home → "Plan a new trip" opens the create form. A dining alert and an experience alert are created on that trip (DB rows). | iOS Simulator + Maestro |
| Web desktop | Register signs you in; Terms and Privacy; `callbackUrl`; no Disney lock; working consent links; a usable desktop landing page with an avatar menu | Scenario A: a new account creates a trip about 60 days out and sets dining and experience alerts by chat (DB rows). | Real browser, 1280px |
| Web phone width | The same auth and connect-Disney pages at 390px; 16px inputs; a way out of connect-Disney; no tab bar dead-ending in the Disney screens | Scenario A at 390px. Focusing the sign-in email field leaves the page scale at 1.00. | Chromium, 390px; iOS Simulator Safari HUD for WM-029 |

### Decisions this item relies on

- **D4: users without a Disney connection.** Decided by scenario A: plan without Disney on both platforms, and gate only what books through Disney.
- **Terms and Privacy text is missing information.** The owner must supply it. The /plan should ask for it and must not ship placeholder legal text.
- **Intent is settled.**

### Dependencies and interfaces

**Needs:** nothing. It can start immediately.

**Provides to later items.** This is a contract: later items build on it, so it must not change shape:
- **To Item 5:** Every app page is reachable without a Disney connection, and the desktop pre-trip page works. Item 5 builds the phone-width shell and the web trip UI on top.
- **To Item 8:** `/settings` is reachable by every user, and its Disney links work. Item 8 adds the account controls.

### Data and schema changes

- None.

### UI approach

Functional UI on existing screens (§5.7).
- **Auth and onboarding screens are designed:** `docs/design/dart-ui-redesign/screen-index.md` §1–3, and the `dart-mobile-v3` package's "Onboarding" section. Follow them.
- **Additions:**
  - Back, "link later" and Sign out on web connect-Disney, following mobile's link-or-plan pattern (`apps/mobile/app/(onboarding)/link-or-plan.tsx`)
  - 16px inputs on the auth fields
  - the "needs Disney" notice on Lightning Lane alerts, using the create-alert sheet's blocked-state pattern (`docs/design/create-alert-handoff/screens/08-no-guests.html`)
- **Terms and Privacy** are two plain text pages, and the only new pages.
- **Expected rebuild exceptions:** none.

### Acceptance criteria

Each criterion is testable, and traced to the findings and scenarios it closes.

- **AC-4.1** · Web desktop + Web phone width: Registering signs the user in and takes them into onboarding. The form no longer promises an email code. *(Traces: W-006, WM-002)*
- **AC-4.2** · Web: The Terms and Privacy links on Register open readable public pages without losing the half-filled form. *(Traces: WM-001)*
- **AC-4.3** · Web: Signing in from `/login?callbackUrl=X` lands on X when X is an allowed page. *(Traces: WM-028)*
- **AC-4.4** · Web phone width (iOS Safari): Focusing any sign-in, register, forgot-password or connect-Disney input leaves the page scale at 1.00 in the Simulator HUD. *(Traces: WM-029)*
- **AC-4.5** · Web + Mobile app: Register never states that an email already has an account, matching forgot-password. *(Traces: W-038, WM-003, M2-001)*
- **AC-4.6** · Mobile app: Register errors appear next to the field at fault, and clear once it is fixed. *(Traces: M2-002)*
- **AC-4.7** · Web desktop + Web phone width: A user with no active Disney connection can open Trips home, `/trips`, `/party`, `/settings`, `/chat` and pre-trip, and nothing redirects them to the Disney screens. That includes "Go to today", "Trip overview" and every tab-bar destination. *(Traces: W-007, WM-008, WM-012)*
- **AC-4.8** · Mobile app: For a user without Disney, "Plan a new trip" opens the create form, and the create button's text matches the user's choice ("Create trip" after "link later"). *(Traces: M-013, M-002)*
- **AC-4.9** · Web: Settings' Connect, Reconnect and post-disconnect links open the real consent route. *(Traces: W-036)*
- **AC-4.10** · Web + Mobile app: The connect-Disney email field starts empty. The page has one heading, shows the right step, and offers Back, "link later" and Sign out. *(Traces: M2-008, WM-009, WM-010)*
- **AC-4.11** · Mobile app: My account shows a pending Disney link ("Invite sent — waiting") with a way to resume or cancel it. The waiting screen's "last checked" time updates, and it moves to "Still waiting / Send a new invite" as `docs/PRD/onboarding-and-disney-connection.md:258-293` specifies. *(Traces: M2-007, M2-009)*
- **AC-4.12** · Mobile app: The subtitle on the "Start planning, link later" card meets WCAG AA contrast and is exposed to accessibility. *(Traces: M-001, M2-003)*
- **AC-4.13** · Web desktop: At 768px and wider, only the desktop pre-trip is visible and every visible control is clickable. The avatar shows initials and opens the account menu. The logo goes to Trips home. *(Traces: W-001, W-002)*
- **AC-4.14** · Web desktop: The pre-trip header shows a one-day trip as "Sep 30", not "Sep 30–30", and phrases the countdown as "in N days". *(Traces: W-017)*
- **AC-4.15** · Web: No developer error banner is shown to users in production. *(Traces: W-004)*
- **AC-4.16** · Server: A user with no Disney connection can create a dining alert (201) and an experience alert on a Dart-created trip, including for dates beyond today+60, which are stored and stay dormant until they enter the window. Lightning Lane alerts still require Disney, and the sheet says so before the user builds one. *(Traces: A)*
- **AC-4.17** · Web desktop + Web phone width: Scenario A end to end: a new web account creates a trip about 60 days out, then creates dining and experience alerts on it by chat. The alerts' DB rows exist. *(Traces: A)*
- **AC-4.18** · Web + Mobile app: Scenario B, linking half: a user who started without Disney links it later from Settings (web) or My account (mobile). The import then runs, and merges into their existing trip under Item 1's rules (AC-1.6). *(Traces: B, W-036)*

**Acceptance scenarios, in full** (owner, 2026-09-28):

- **A.** No Disney trip booked: join via WEB, create a new trip ~60 days out, and set up DINING and EXPERIENCE alerts for it. *(Proven by: AC-4.16, AC-4.17)*
- **B.** If the user THEN makes Disney bookings for the same dates (full or partial overlap), the Dart trip and the Disney import must be MERGED intelligently — not a duplicate trip, not an overwrite of the user's dates/days/alerts. *(Proven by: AC-4.18)*

**Regression guards:**

- **RG-4.1:** Onboarding for Disney-linked users is unchanged.
- **RG-4.2:** Lightning Lane booking and availability still refuse without Disney, visibly (`packages/workers/src/http/handlers/availability.ts:443`).

### Verification

- **Web:** real browser at 1280px for AC-4.1 to AC-4.3, AC-4.5, AC-4.7 and AC-4.9 to AC-4.17. Chromium at 390px for the phone-width halves.
- **iOS Safari:** a Simulator HUD screenshot for AC-4.4.
- **Mobile:** iOS Simulator + Maestro for AC-4.6, AC-4.8 and AC-4.10 to AC-4.12.
- **Server:** API tests for AC-4.16, against captured experience-availability responses (CLAUDE.md, "develop against captured data").

### Risks

- **Pages that assume a Disney connection** must explain themselves rather than error. Examples: the assistant's booking tools, and Lightning Lane availability.
- **Dormant experience alerts:** confirm against captured responses that an alert waiting beyond the window is harmless.
- **Better Auth configuration** decides whether sign-in after register works.
- **Terms and Privacy content** comes from the owner.

### Done when

A new web account passes scenario A, and a mobile user without Disney plans a trip without ever seeing the consent screen.
