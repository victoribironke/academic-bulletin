# Launch checks (database side)

- Database: roundhouse.proxy.rlwy.net
- When: 2026-11-24T12:17:49.136Z
- 16 passed, 1 failed, 2 not yet due (a later release)

| Result | Test | Check | Detail |
|---|---|---|---|
| PASS | 1 | Thursday, November 26, 2026: "70 days left" and "CP1 in 15 days" (2027-2031 Bulletin Development Cycle (rehearsal 2)) | 70 days left; Next: CP1 on Friday, December 11, 2026 (15 days) |
| PASS | 7 | 11:58 pm on Thursday, February 4, 2027: due today | Due today at 11:59 pm |
| PASS | 7 | 12:00 am on Friday, February 5, 2027: overdue by 1 day | Overdue by 1 day |
| PASS | 7 | During the Christmas break the countdown runs and the break is loaded (no working days) | 38 days left; 24 working days left; break loaded |
| NOT YET | 7 | Nothing is sent during the break | The reminder agent (T3) comes in R1; today the daily job sends only invitations. |
| PASS | 7 | A department extension to February 11, 2027 takes precedence | 6 days left; Extended to Thursday, February 11, 2027 |
| FAIL | 10 | No duplicate codes | 8 codes exist in two forms (CHM107 / CHM 107; IDF 305 / IDF305; PHY 316 / PHY316; PHY 325 / PHY325; AGE 401 / AGE401; ...); 8 codes not in the standard format. These are the groups in the B3 merge report, waiting for DAP's decision. |
| PASS | 10 | "GST 112" and "BU-GST 112" both exist | GST 112 Nigerian Peoples and Culture; BU-GST 112 Health Principles |
| PASS | 10 | 0-unit and sessional courses are in the Registry | 10 with 0 units; 106 sessional |
| PASS | 10 | Every programme's course list covers every level of its length (66 drafts in 2027-2031 Bulletin Development Cycle (rehearsal 2)) | All levels covered. |
| PASS | 10 | Every draft has the General Education block (locked by code, W1) | Complete in all 66 drafts. |
| PASS | 17 | Every school, department and programme has its section 1.1 code and name | Nothing left to change. |
| PASS | 17 | No department code ends in HND or PHY | None. |
| PASS | 17 | The old school codes "SEH", "VASS" and "SST" still find the renamed school | SEH: found; VASS: found; SST: found |
| PASS | 17 | An upload using an old code is accepted with a warning naming the new code (planned only) | SAHS-HND is the old department code; it is now SAHS-NUT. Use SAHS-NUT in future uploads. |
| PASS | 17 | 01A_Registry_Upload_Babcock-specific_courses_part1.xlsx uploads with no code errors (planned only) | 500 rows clean |
| PASS | 17 | 01A_Registry_Upload_Babcock-specific_courses_part2.xlsx uploads with no code errors (planned only) | 313 rows clean |
| PASS | 17 | 07_Retry_after_fixes_77_skipped_rows_v2_owners_filled.xlsx uploads with no code errors (planned only) | 77 rows clean |
| NOT YET | 17 | Package file 09 uploads with no code errors | File 09 holds programme-specific values, loaded with B14 in R1. |
