# The way back (work order task O3)

Written Monday, November 23, 2026. Everything lives in the Railway project `academic-bulletin`: environment **production** is the live site (academicplanning.app); environment **staging** is the test site (academic-bulletin-staging.up.railway.app).

## Before every release

1. **Back up the live database.** Railway, environment production, service **Postgres**, tab **Backups**, **New backup**. Wait for the row with today's date and size (about 900 MB on November 23, 2026). A daily backup also runs on its own (kept 6 days), but take one immediately before any release that changes data, so nothing written in between is lost.
2. **Note the live release.** Railway, service **academic-bulletin**, tab **Deployments**: the top "Active" deployment names its commit. Write the commit (for example `09ecf91`) in the release notes.
3. **Database changes go first.** Run each migration's SQL in Postgres, **Database**, **Data**, one statement at a time, then its check query. Every migration in R0 only adds columns or tables and is safe to run twice, so the previous release still works on the changed database.
4. **Data scripts run on the test site first**, as a dry run, then for real, then on live with the owner's go-ahead (for example `npm run units:code-standard`).

## If a release goes wrong

### The code (minutes, nothing lost)

- Railway, service **academic-bulletin**, **Deployments**: on the last good deployment, the **⋮** menu, **Redeploy** (or **Rollback**). The site runs that build again within about two minutes.
- Then put `main` back in step: `git revert <bad commit>` and push, so the next push doesn't bring the problem back.
- Because R0's database changes are all additions, the older code runs on the newer database.

### The data (minutes, loses what was written after the backup)

- Railway, service **Postgres**, **Backups**: on the backup taken before the release, **Restore**. Railway restores the volume and restarts Postgres; the site is unavailable for a few minutes.
- Everything written after that backup is lost, which is why step 1 comes immediately before a data change.
- After a restore, check: the site's sign-in page loads; `SELECT count(*) FROM submissions` and `SELECT count(*) FROM users` match the numbers in the release notes.

### Data scripts in particular

- `scripts/apply-code-standard.ts` (A5) changes codes in place and keeps the old codes as aliases; record IDs never change. To undo it, restore the backup taken just before it ran.
- Scripts that delete need `--confirm DELETE` (Appendix D) and stop after a dry run without it.

## Practised on the test site

| Step | Status |
|---|---|
| Live backup taken and daily schedule set | Done November 23, 2026 (13:31 WAT, 902 MB; daily, kept 6 days) |
| Code rollback to the previous deployment, on the test site | To do |
| Backup, change, restore and check, on the test site | To do |

Point-in-time recovery (continuous backups, restore to any minute) is off. Switching it on restarts Postgres once; worth doing at a quiet hour.
