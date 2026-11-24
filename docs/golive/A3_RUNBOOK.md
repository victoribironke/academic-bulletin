# A3 runbook: opening the 2027-2031 cycle on the live site

Rehearsed on the test site on Monday, November 23, 2026 (reports in `docs/golive/reports/E1_*_test_site.md`).

## Before starting

1. DAP has confirmed the 3 department names (SBMS-MED, SSAT-AIT, SSAT-BAS), and A5 (codes and names standard) has run on live.
2. Registry uploads are done (B2, B13, B16, B17), so the BU- rows link to their Registry records at once. Rehearsed on the test site on November 24, 2026 (39 seconds from Lagos; reports `docs/golive/reports/B2_registry_upload_*_test_site.md`):

   ```
   P="../ABRS Import Package (November 20, 2026)"
   DATABASE_URL_FILE=<file> npm run registry:upload -- --by <admin email> \
     --file "$P/01A_Registry_Upload_Babcock-specific_courses_part1.xlsx" \
     --file "$P/01A_Registry_Upload_Babcock-specific_courses_part2.xlsx" \
     --file "$P/07_Retry_after_fixes_77_skipped_rows_v2_owners_filled.xlsx" \
     --held-back "$P/03_Exceptions_and_Conflicts.xlsx" \
     --report docs/golive/reports/B2_registry_upload_dry_run_live.md
   ```
   Read the dry-run report, then run it again with `--report docs/golive/reports/B2_registry_upload_applied_live.md --confirm`. It writes nothing unless every file is clean, and a second run changes nothing. Expect 813 + 36 + 107 new courses and 41 + 12 updates; 16 held-back courses wait for DAP (14 with no units, PATH 304 and PHAR 305 with no title). BU-GEG 403 and 404 get the work order's default owner, the School of Engineering (B6).
3. DAP has signed off the Registry (B9), and answered the E1 questions (units, the two General Education swap-ins, AGX 503). Anything still open is left out of the drafts and listed in the report.
4. A fresh manual backup of the live database (Railway, Postgres, Backups, New backup).
5. The test cycle is archived (A2, done November 23).

## Steps

Each script runs on this computer against the live database. The address goes in a 700-permission file through Railway's "Copy value" button and is deleted afterwards. Each step is a dry run until `--confirm`.

```
DATABASE_URL_FILE=<file> npm run cycles:open -- --by <admin email>
DATABASE_URL_FILE=<file> npm run cycles:open -- --by <admin email> --confirm
```
Creates "2027-2031 Bulletin Development Cycle", active, closes any other active cycle, and creates one empty draft per programme Heads see: 66 (48 existing, 18 new; hidden programmes get none).

```
DATABASE_URL_FILE=<file> npm run calendar:load -- --cycle "2027-2031 Bulletin Development Cycle"
DATABASE_URL_FILE=<file> npm run calendar:load -- --cycle "2027-2031 Bulletin Development Cycle" --confirm
```
Loads section 4.6: 10 phases, 17 checkpoints, 6 holidays, the Christmas quiet period, and "Submit to School" opening Monday, December 14, 2026 (F0).

```
DATABASE_URL_FILE=<file> npm run courses:prefill -- --file "../ABRS Import Package (November 20, 2026)/02_Programme_Course_Structures_48_programmes.xlsx" --cycle "2027-2031 Bulletin Development Cycle"
DATABASE_URL_FILE=<file> npm run courses:prefill -- --file "<same>" --cycle "2027-2031 Bulletin Development Cycle" --report docs/golive/reports/E1_course_structures_applied_live.md --confirm
```
Adds the section 6.1 General Education block (locked) and each programme's courses from file 02, starts course details from the Registry, and keeps Registry courses that aren't in file 02 out of the draft. About 10 minutes from Lagos. It only adds rows, so if it stops, run it again.

## Checks (done when)

- 66 drafts in the cycle, all Departmental Drafting; the cycle is the only active one.
- The 48 existing programmes have their full course structure (test site: 67 to 142 rows each), each with the block (28 rows for 4 years, 32 for 5, 34 for 6).
- The 18 new programmes have the block and the "New programme" label.
- The live dashboard shows 66 drafts; a Head of Department's home page shows the Departmental Drafting countdown; DAP sees the calendar.
- The report's "For DAP" list goes to DAP.

## If something goes wrong

The cycle and its drafts can be archived whole (`npm run cycles:archive -- --cycle "2027-2031 Bulletin Development Cycle" --by <email> --confirm ARCHIVE`) and the steps run again, or the backup restored (`docs/golive/ROLLBACK.md`).
