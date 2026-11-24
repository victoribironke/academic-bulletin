# Launch tests (work order section 13)

How each launch test for R0 is covered: by the automatic tests, by the database
checks, or by a person on the test site. Tests 1, 2, 6, 7, 10, 16 and 17 belong
to R0. The others come with later releases.

## The pretend clock

The test site has a pretend clock, so countdowns and the Submit window can be
checked on any date.

- On the test site, the yellow banner has a button: **Pretend it is another date**.
  Choose a date and time in West Africa Time and press **Set**. The page reloads
  as if it were that moment.
- **Use the real time** turns it off. It also switches itself off after 30 days.
- It applies only to the browser that set it. Other testers keep their own time.
- It changes only the countdowns, the checkpoint dates, the "waiting for you"
  list, the help panel and the Submit window. Sign-in, the authenticator,
  invitations and the daily job always use the real time.
- The live site ignores it completely (it only works where `APP_ENV=staging`).

## The database checks

`npm run launch:check` runs the database side of tests 1, 7, 10 and 17. It is
read-only and never writes. Each check prints PASS, FAIL or NOT YET (a part
that belongs to a later release).

```
DATABASE_URL_FILE=<file holding the database URL> npm run launch:check -- --report docs/golive/reports/LAUNCH_checks_test_site.md
```

Run it on the test site now, and on the live site after A3. The latest result
on the test site (November 24, 2026) is in
[reports/LAUNCH_checks_test_site.md](reports/LAUNCH_checks_test_site.md):
16 pass, 1 fails (test 10, duplicate codes, fixed by B3), 2 not yet.

## Test by test

### 1. Head of Department, smooth path

| Part | How it is checked | State |
|---|---|---|
| On Thursday, November 26, 2026 the home page shows "70 days left" and "CP1 in 15 days" | Database check, and by a person with the pretend clock | Passes on the test site |
| Sign in from the invitation, with the authenticator, in under 5 minutes | A person on the test site | Waiting for the test site's Google sign-in address |
| Confirm the course list | B10, automatic tests | Built; switched on once its database update runs on the site |
| Assign courses to two lecturers | G2 | R2 |
| Turn the readiness panel green | F2 | R2 |
| Submit on Monday, December 14, 2026 | Automatic tests (F0); by a person with the pretend clock | Submit is refused before December 14 |

By hand: set the pretend clock to Thursday, November 26, 2026, 8:00 am. Sign
in as a test Head of Department. The home page shows "70 days left" and
"Next: CP1 on Friday, December 11, 2026 (15 days)". Set the clock to Monday,
December 14, 2026, 9:00 am: Submit is offered. Set it to Friday, December 11:
Submit is refused with the opening date.

### 2. Head of Department, blocked path

| Part | How it is checked | State |
|---|---|---|
| Removing all 300-level courses blocks Submit with rule V2 and a "Fix this" link | F1 | R2 |
| A direct call to the server is refused too | F1 | R2 |
| Submit before Monday, December 14, 2026 is refused, on screen and on the server | Automatic tests (F0) | Passes |

### 6. DAP admin and Super Administrator

| Part | How it is checked | State |
|---|---|---|
| Phase 2 cannot be approved without an Override and a reason | Automatic tests (`phase-override.test.ts`, `authorization.test.ts`) | Passes |
| The override is flagged | Automatic tests (`phase-override.test.ts`) | Passes |
| Control tower figures match the database | Control tower | R3 |

### 7. Countdown edges

| Part | How it is checked | State |
|---|---|---|
| 11:58 pm on Thursday, February 4, 2027: "Due today" | Database check, and by a person with the pretend clock | Passes |
| 12:00 am on Friday, February 5, 2027: "Overdue by 1 day" | Database check, and by a person with the pretend clock | Passes |
| During the Christmas break the countdown runs | Database check, and by a person with the pretend clock | Passes |
| Nothing is sent during the break | The reminder agent (T3) | R1; today the daily job sends only invitations |
| A department extension takes precedence | Database check (in memory, nothing saved) | Passes |

By hand: set the pretend clock to February 4, 2027, 11:58 pm, then to
February 5, 2027, 12:00 am, then to December 28, 2026. For the extension,
grant a department an extension to Thursday, February 11, 2027 on the test
site: its Head sees "Extended to Thursday, February 11, 2027".

### 10. Course registry

| Part | How it is checked | State |
|---|---|---|
| No duplicate codes | Database check | **Fails** until B3 runs: 17 codes exist in two forms (such as BIO102 and BIO 102) and 176 codes are not in the standard format. The B3 script is built; its dry run on the test site tidies 159 codes, merges 9 true duplicates and leaves 8 groups for DAP ([reports/B3_code_cleanup_dry_run_test_site.md](reports/B3_code_cleanup_dry_run_test_site.md)). |
| "GST 112" and "BU-GST 112" both exist | Database check | Passes |
| 0-unit and sessional courses load | Database check | Passes (10 with 0 units, 106 sessional) |
| Every programme's course list covers every level of its length | Database check | Passes in all 66 drafts |
| The General Education block is locked in every draft | Database check, and automatic tests (W1) | Passes in all 66 drafts |

### 16. Typed DELETE

| Part | How it is checked | State |
|---|---|---|
| Every delete control runs only after DELETE is typed | Automatic tests (`typed-delete.test.ts` finds every bin icon and delete route) | Passes |
| "delet" or "DELETED" keeps the button switched off | Automatic tests | Passes |
| A direct server call without the confirmation is refused | Automatic tests | Passes |
| Deleting 12 course rows needs one confirmation listing all 12 | Automatic tests (`delete-many.test.tsx`, and "deleting several rows" in the integration tests) | Passes: tick the rows (or all of a level), then "Delete 12 rows"; the box lists the first 10 and "and 2 more" |
| Deleted rows appear in the Archive and can be restored | Automatic tests | Passes: course rows (with their descriptions) and staff go to the Archive; Restore puts them back |
| Permanent removal from the Archive needs DELETE again and a Super Administrator | Automatic tests | Passes: "Remove for good" shows only to Super Administrators, needs DELETE, and is logged |
| Deleting another unit's row asks for a reason | Automatic tests (`delete-reason.test.ts`, integration tests) | Passes: anyone but the department's Head and coordinators gives a reason of at least 10 characters, kept in the activity log |

### 17. New codes

| Part | How it is checked | State |
|---|---|---|
| Every school, department and programme shows its section 1.1 code and name | Database check | Passes on the test site; run again on live after A5 |
| Searching "SEH", "VASS" or "SST" finds the renamed school | Database check | Passes |
| An upload using an old code is accepted with a warning naming the new code | Database check (planned only, nothing saved) | Passes |
| Package files 01A and 07 upload with no code errors | Database check (planned only) | Passes |
| Package file 09 uploads with no code errors | B14 | R1 |
| No screen shows HND or PHY as a department code | Database check | Passes |
