# ABRS go-live: implementation plan

Prepared Monday, November 23, 2026, against the HoD Go-Live Work Order version 2.1 (package file 06), the simulation review of November 19, 2026, and the import package of November 20, 2026 (re-coded November 23). The work order asks for this file (section 0, item 1).

**Where the code stands today:** commit 573475a on `main`, live on Railway at academicplanning.app. Next.js 16 (App Router), Prisma 7 on Railway Postgres, Auth.js with Google sign-in, Railway bucket for photos, Resend for email, Claude for GRACE checks, a Railway `daily-job` service at 06:00 UTC.

## How the work is phased

The work order's releases (R0 to R5, section 5) are the phases. R0 is due **Wednesday, November 25, 2026, 6:00 pm WAT**, so it is split into four short phases by what depends on what. Nothing reaches the live site untested, and every change to live data waits for the owner's go-ahead.

| Phase | Window | What it delivers | Depends on |
|---|---|---|---|
| **0. Foundations** | Mon Nov 23 | Working copy in OneDrive, this plan, test site (A1), backups and the way back (O3) | Railway staging environment (owner's approval) |
| **1. Platform changes that unblock the data** | Mon Nov 23 to Tue Nov 24 | B16, B17, B13, A5 tooling, B15 and B18 tooling, Q6, F0, W6 fix, D4 overrides, Q7 coverage, S1, G6 | Phase 0 |
| **2. Data, test site first, then live** | Tue Nov 24 to Wed Nov 25 noon | A5 re-coding, B15 and B18 records, uploads 01A, 07 and the held-back courses, B9 sign-off, A2 archive of the test cycle, C1 calendar, A3 the real cycle, E1 and W1 pre-filled drafts | Phase 1; DAP sign-off (B9) |
| **3. People and day one** | Tue Nov 24 to Wed Nov 25 6:00 pm | D1 roster, D2 import, D3 invitations for 8:00 am Thu Nov 26, D11 authenticator made easy, C2, C3 and T1 countdowns and "My desk", H1 quick start, H9 Academic Policy, launch checklist (section 14) | Roster from DAP by Tue Nov 24 noon |
| **4. R1 Head of Department support** | by Wed Dec 2 | HoD home, pre-filled narratives, reminder agent, Ask DAP, ticks, field help, search, course lists for the 18 new programmes, and anything from R0 "can follow" | Curriculum documents for the 18 new programmes by Fri Nov 27 |
| **5. R2 Quality checks** | by Fri Dec 11 | Rules engine and readiness panel, lecturers, autosave, comments, names under photos, true-to-print preview, programme-specific course settings, filters | |
| **6. R3 Oversight** | by Fri Jan 8, 2027 | Dean workspace, DAP control tower, escalations, AI consistency checks | |
| **7. R4 DAP Vetting** | by Fri Feb 19, 2027 | Vetting queues, revision requests, change-only view | |
| **8. R5 Publication** | by Fri Apr 9, 2027 | Bulletin generator, whole-bulletin phases 6 to 10, Senate record, Babcock Press desk | |

## Decisions and differences to settle

1. **Pull requests.** The work order asks for a branch and pull request per release. The project's standing rule is to push tested work straight to `main`. This plan keeps pushing to `main` and lists task numbers in each commit message; say if you want pull requests for releases instead.
2. **Test site (A1).** Railway environment "staging" (Nov 23): its own copy of the website, Postgres, bucket and daily job, at https://academic-bulletin-staging.up.railway.app. It runs with `APP_ENV=staging`, which shows the TEST SITE banner and sends email only to `TEST_EMAIL_INBOX` (none at all while that is unset). Each deploy runs `npm run db:prepare-staging` first, which builds or updates its tables and the live site's database rules. `scripts/copy-live-to-staging.mjs` copies the live records into it, reading the live database only. Data scripts run there, as a dry run, before anything touches the live site.
   - Still needed: the test site's Google sign-in address (`https://academic-bulletin-staging.up.railway.app/api/auth/callback/google`) added to the Google OAuth client; the DAP test inbox; the copy of test accounts and the test cycle.
3. **Authenticator (D11, DEC18).** Today an admin is asked again after 12 hours. The work order asks for "Remember this device for 30 days" and for everyone, not only admins. Both are planned for Phase 3.
4. **Overrides (D4, F4).** Today only a Super Administrator can approve past GRACE results (item 2, November 20), and a Super Administrator can act at any phase without a reason. D4 asks that Academic Planning admins and Super Administrators act outside their phase only through an override with a reason of at least 20 characters, flagged; F4 lets DAP record GRACE exemptions. Phase 1 brings both in line.
5. **CGPA.** The app accepts a minimum CGPA from 1.00; the Academic Policy and check V26 require 2.00 to 5.00. Fixed in Phase 1.
6. **Live data changes.** A5, B15, B18, the uploads, A2 and A3 change live data. Each runs on the test site first with a dry run and a before-and-after report, and on the live site only with the owner's go-ahead.

## Every task, with status and where it lands

Status: **Done** (live), **Partly** (some of it live), **To do**, **DAP** (needs data or a decision from DAP first).

### Phase 0 to 3: R0 (live by Wednesday, November 25, 2026)

| Task | What | Status | Files and database | Tests |
|---|---|---|---|---|
| A1 | Test site with its own database; test accounts moved there; "TEST SITE" banner; email only to a DAP inbox | Live at academic-bulletin-staging.up.railway.app (Nov 23): own Postgres and bucket, banner, email guard. Waiting on: Google sign-in address, DAP test inbox, copy of test accounts and cycle | Railway "staging" environment; `lib/environment.ts`, `app/layout.tsx` banner, `lib/email/resend.ts` redirect; `scripts/prepare-staging-database.mjs` (pre-deploy), `scripts/copy-live-to-staging.mjs` | Banner on the test site only; email redirect unit test; copy script tested locally |
| O3 | Backup and a tried way back | To do | Railway Postgres backups; `docs/golive/ROLLBACK.md` | Restore tried on the test site |
| B16 | Accept "BU-" codes; tidy variants ("BU- NSC 401", "BU-SEN-417", "BU-FRE310") | **Done** (Nov 23) | `lib/validation/name-format.ts` (`formatCourseCode`, `isValidCourseCode`, used by every course route and import) | `tests/unit/course-codes.test.ts`; all 2,092 package codes fit the format; 01A part 2 passes in full, part 1 except 2 rows with no owner (BU-GEG 403 and 404: B6 default School of Engineering) |
| B17 | Same title allowed under different codes (warning only when code also matches) | **Done** (Nov 23) | `lib/imports/courses.ts`, `lib/imports/spreadsheet.ts` (`warnings`, `skipped`), both bulk routes, upload dialog | `tests/unit/course-codes.test.ts`; all 77 rows of file 07 version 2 pass |
| B13 | 0-unit and up-to-12-unit courses; sessional courses with no semester | To do | Migration: `semester` nullable on `master_courses` and `courses`; units 0 to 12; import rules; course table grouping | Held-back rows of file 03 validate; MBBS groups by level |
| A5 | Codes and names standard; old codes kept as aliases until Feb 4, 2027 | To do (tooling), then data | `scripts/apply-code-standard.ts` (dry run, report, `--confirm`), alias table or column, import warning for old codes, activity log | Dry run on a copy reports every change in file 10; old-code upload accepted with a warning |
| B15 | Programme lengths (Architecture 4, Estate Management 5, Human Nutrition and Dietetics 5); CRS and ILD added hidden; French and Foreign Studies | To do | Programme `isHidden` (migration); data script | Levels match length (V21) |
| B18 | 18 new programmes and the Department of Dental Surgery, "New programme" label | To do | Programme `isNew` (migration); data script from file 10 | 66 visible programmes after the script |
| B2, B9 | Remaining course lists loaded; DAP signs off the registry | DAP + data | Uploads of 01A, 07 v2, file 03 "Not uploaded" through bulk upload | Counts match the package read-me |
| A2 | Archive the test cycle (tag TEST, keep restorable) | To do (data) | `lib/archive.ts`, cycle `isTest` (migration) | Dashboards and counts exclude it |
| C1 | Calendar data: phases, checkpoints, extensions, holidays, quiet periods, working week | To do | Migration: `cycle_phases`, `cycle_checkpoints`, `cycle_extensions`, `cycle_holidays`; loader for section 4.6 | Section 4.6 loads; extension beats cycle date |
| A3 | Open "2027-2031 Bulletin Development Cycle" with 66 drafts | To do (data) | `app/api/cycles`, draft creation | 66 drafts; 48 with full structure |
| E1, W1 | Course structures pre-filled from file 02; General Education block inserted and locked | To do | `scripts/prefill-course-structures.ts`; `courses.isGeneralEducation` locked rows (migration); course table read-only rows | Every draft shows the block; a Head cannot edit or delete it |
| G6 | Deleted GST 112 row came back | To do (find cause) | Likely `lib/courses/gst-pool.ts` preload | Deleted row stays deleted |
| F0 | "Submit to School" off until Mon Dec 14, 2026 | To do | Setting on the cycle; transition route refuses SUBMIT before it | Refused before the date, on screen and on the server |
| D4 | Phase locked to its owner; overrides need a 20-character reason, flagged | Partly (owners, separation of duties, refusals live) | `lib/submissions/workflow.ts`, transition route, ledger `override` fields | Every forbidden action refused for every role and phase |
| D5 | Recall until the Dean opens it | To do (can follow) | Transition action RECALL; "opened by Dean" timestamp | Recall after opening refused |
| W6 | Minimum CGPA 2.00 to 5.00 | To do (correction) | `lib/submissions/submit-readiness.ts` | 1.50 refused |
| Q6 | New phase names, "Revision requested", specific action labels | To do | `lib/submissions/phases.ts`, labels across pages, emails, exports | Text search finds none of the old names |
| Q7 | Typed DELETE on every delete, on screen and on the server | Partly (8 of 14 delete routes) | `lib/archive.ts`, every `DELETE` route, shared confirmation dialog | Test that lists every delete route and control |
| S1 | `/api/users/me` and `/api/cycles` under 150 ms | To do | Session-cached user, cached active cycle | Timed check |
| D1 | Roster spreadsheet | DAP (due Tue Nov 24 noon) | Template supplied with D2 | |
| D2 | Bulk import of users (dry run, babcock.edu.ng only, linked by code) | To do | `scripts/import-roster.ts` or admin screen | 34 Heads, 11 Deans, coordinators import cleanly |
| D3 | Invitations at 8:00 am WAT Thu Nov 26; first sign-in tracked; resend | To do | `lib/email/*`, user `invitedAt`, `firstSignInAt` (migration) | Invitation content test; list of people not signed in |
| D11 | Authenticator for everyone, "remember this device for 30 days", DAP reset | Partly (admins only; reset live) | `lib/mfa/*`, trusted-device cookie, `lib/auth-callbacks.ts` | Invitation to home page in under 5 minutes |
| C2, C3 | Countdown component and where it shows | To do | `components/shared/countdown.tsx`, WAT date maths in `lib/calendar/*` | 11:58 pm, 11:59 pm, 12:00 am WAT with the server in UTC; holidays |
| T1 | Basic "My desk" panel for Heads, Deans and DAP | To do | `app/(main)/dashboard`, desk queries | Each person sees only their desk |
| H1 | Quick start per role with the named DAP officer | To do | `components/layout/help-button.tsx`, settings for officers | Words match the screens |
| H2 | Launch pack | DAP | | |
| H9 | Academic Policy library from package file 04 | To do | `policy_sections` table (migration) and loader; policy page with contents and search | "Academic Load" found in under 10 seconds |
| A4, Q1, Q2, H3, K0, B3, B4, B5, B8 | R0 "can follow" items | To do (R1 if time runs out) | Activity log, date formatter, tables, help button, registry search, code clean-up, title casing, offered filter, completeness report | |

### Phase 4: R1 (by Wednesday, December 2, 2026)

B1, B6, B10, B14, B18 course lists, C4, C6, D9, E2, E3, G1, G2 (programme coordinators), G4, G5, H4, H6, H8, K1 to K4, K6, Q3, S2, T1 (other desks), T2 to T6, U1, U6, U7, U8 (sessions Nov 30 to Dec 1), W13, W14, W16, W18, and anything moved from R0.

### Phase 5: R2 (by Friday, December 11, 2026)

B11, E4, F1 to F4, F6, G2 (lecturers), G3, G7, G8, H5, H7, K5, Q4, Q5, S3, U2 to U5, U8 (sessions Dec 8 to 9), W2 to W10, W15, W17 check V21.

### Phase 6: R3 (by Friday, January 8, 2027)

B12, D6, D7, F5, K7, L1, L2.

### Phase 7: R4 (by Friday, February 19, 2027)

N1, N2, N3.

### Phase 8: R5 (by Friday, April 9, 2027)

C7, D8, D10, N4 to N9.

## Already live that the work order relies on

Server-side refusals for the wrong role, school and phase; separation of duties; Senate minute reference; append-only ledger with database guards; Submit validators (units, required fields, CGPA range, rank Other, wrong-programme philosophy); GRACE checks queued on save or Submit, never on opening; GRACE gate at Submit and at every approval, with a logged override; Archive instead of hard delete, typed confirmation on 8 delete routes; security headers; private photos with upload validation; babcock.edu.ng sign-in with time-boxed exceptions; authenticator codes for admins; cross-site write refusal; stored HTML cleaned before display; a daily job on Railway. The fresh-draft proof of these is in `tests/integration/authorization.test.ts` ("Priority 1 proof on a fresh draft").
