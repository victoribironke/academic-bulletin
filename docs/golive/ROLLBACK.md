# The way back (work order task O3)

Written Monday, November 23, 2026. Everything lives in the Railway project `academic-bulletin`: environment **production** is the live site (academicplanning.app); environment **staging** is the test site (academic-bulletin-staging.up.railway.app).

## Before every release

1. **Back up the live database.** Railway, environment production, service **Postgres**, tab **Backups**, **New backup**. Wait for the row with today's date and size (about 900 MB on November 23, 2026). A daily backup also runs on its own (kept 6 days), but take one immediately before any release that changes data, so nothing written in between is lost.
2. **Note the live release.** Railway, service **academic-bulletin**, tab **Deployments**: the top "Active" deployment names its commit. Write the commit (for example `09ecf91`) in the release notes.
3. **Database changes go first.** Run each migration's SQL in Postgres, **Database**, **Data**, one statement at a time, then its check query. Every migration in R0 only adds columns or tables and is safe to run twice, so the previous release still works on the changed database.
4. **Data scripts run on the test site first**, as a dry run, then for real, then on live with the owner's go-ahead (for example `npm run units:code-standard`).

## If a release goes wrong

### The code (minutes, nothing lost)

- Railway, service **academic-bulletin**, **Deployments**: on the last good deployment, the **⋮** menu, **Rollback**, then **Rollback** again to confirm. It reuses that build, so it is fast: on the test site the old build was serving 26 seconds after confirming, with no gap. (**Redeploy** builds it again and takes several minutes.)
- **Rollback restores that deployment's variables too**, not just its code. If a setting was added or changed since (a secret, an email address), check it on **Variables** afterwards and set it again if needed.
- Then put `main` back in step: `git revert <bad commit>` and push, so the next push doesn't bring the problem back.
- Because R0's database changes are all additions, the older code runs on the newer database.

### The data (minutes, loses what was written after the backup)

- Railway, service **Postgres**, **Backups**: on the backup taken before the release, **Restore**, then **Restore** in the box. This only *stages* the change: a new volume is made from the backup.
- A bar appears at the top of the canvas: "Apply 3 changes", **Details**, **Deploy**. Check that only Postgres shows changes, then **Deploy**. Postgres restarts on the restored volume. On the test site it was back 30 seconds after Deploy, about 1.5 minutes from the first click.
- The old volume is kept, detached, beside Postgres on the canvas (named "postgres-volume"; the restored one is named after the backup). Leave it until the restore is confirmed good; deleting it later frees its storage and needs the owner's yes.
- Everything written after that backup is lost, which is why step 1 comes immediately before a data change.
- After a restore, check: the site's sign-in page loads; `SELECT count(*) FROM submissions` and `SELECT count(*) FROM users` match the numbers in the release notes.
- The site keeps running during the restart. Its idle database connections are closed by the restart; since November 23, 2026 the app drops them and opens new ones (before that, Node could stop the site on the closed connection and Railway would restart it).

### Data scripts in particular

- `scripts/apply-code-standard.ts` (A5) changes codes in place and keeps the old codes as aliases; record IDs never change. To undo it, restore the backup taken just before it ran.
- Scripts that delete need `--confirm DELETE` (Appendix D) and stop after a dry run without it.

## Practised on the test site

| Step | Status |
|---|---|
| Live backup taken and daily schedule set | Done November 23, 2026 (13:31 WAT, 902 MB; daily, kept 6 days) |
| Backup before the first live data changes of November 24 (B10 tables, B4 titles) | Done November 24, 2026, 13:34 WAT, 908 MB. Restore that backup to undo B4's 352 title changes; the B10 tables are only additions |
| Backup before switching on Ask DAP (H6 table) | Done November 24, 2026, 14:26 WAT, 910 MB. The H6 table is only an addition |
| Backup before switching on search (K1: pg_trgm, unaccent, search table) | Done November 24, 2026, 16:18 WAT, 910 MB. The extensions and the table are only additions |
| Backup before adding the reminder agent's tables (T3) | Done November 24, 2026, 16:59 WAT, 971 MB. The two tables are only additions; sending stays off |
| Backup before B14 (programme-specific values: one empty column, then 12 link values from file 09) | Done November 25, 2026, 13:35 WAT, 986 MB. The column is only an addition. Restoring this backup undoes the 12 values; re-running file 09 also puts them back |
| Backup before the clinics table (H8) | Done November 25, 2026, 17:45 WAT, 987 MB. The table is only an addition and starts empty |
| Backup before the launch runs (A5, registry uploads, file 09, owners, A3) | The 17:45 backup of November 25 (987 MB). A new one was refused at 18:20 (Railway's limit of 10 backups per volume); a check showed nothing had changed on live since 17:45 except the empty clinics table and one account's last-active time, so 17:45 is the restore point. Restoring it undoes every launch run of that evening; then add the clinics table again (migration 20261125170000) |
| Code rollback to the previous deployment, on the test site | Done November 23, 2026, 21:14 WAT: **Rollback** to the H1 build served it 26 seconds after confirming, then **Rollback** to the T1 build 45 seconds after; the sign-in page answered throughout |
| Backup, change, restore and check, on the test site | Done November 23, 2026, 21:08 to 21:12 WAT: backup (921 MB); a marker log entry written after it; **Restore** and **Deploy**; Postgres back about 30 seconds after Deploy. Afterwards every count matched the backup (114 drafts, 6,858 course rows, 12 users, 55 log entries, 2 cycles, same last entry) and the marker was gone |

Railway keeps at most 10 backups per volume (it accepted an eleventh at 17:45 on November 25 and refused a twelfth at 18:20 with "Plan limit of 10 backups per volume exceeded"). Before the next backup, delete an old manual one (it asks for the account's authenticator code); keep the 13:31 baseline of November 23, the 13:34 backup of November 24 (the only undo for B4's titles) and the 17:45 backup of November 25 (before the launch runs). To make room on November 25 the manual backups of November 23 at 14:04, 14:33 and 16:00 were deleted (later backups cover them; each deletion asks for the account's authenticator code). Keep the 13:31 baseline and the 13:34 backup of November 24 (the only undo for B4's titles).

Point-in-time recovery (continuous backups, restore to any minute) is off. Switching it on restarts Postgres once; worth doing at a quiet hour.
