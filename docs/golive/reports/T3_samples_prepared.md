# T3: 20 reminder samples for DAP (prepared)

Friday, November 27, 2026, on the live site with the samples action of Reminder Agent (nothing stored or sent; sending is off). The pack with the messages is in the OneDrive project folder, `ABRS Reminder Agent - 20 samples for DAP (27 Nov 2026).xlsx` (it names the Heads, so it stays out of git).

## Fixes made while preparing them

- Every message had been falling back to the plain template: Claude Haiku 5.5 thinks by default, and the 600-token limit was used up before any text (4d4f5ef). The opening is now written with thinking off, effort low and a 2,000-token limit.
- The AI dropped the programme links when it rewrote the whole message. It now writes only the opening paragraph; each programme's figures and link, the final date, Ask DAP and the sign-off follow exactly as built (65a56ca). It still may not add a number or a link of its own.
- A link at the end of a sentence no longer fails the fact check because of its full stop, and the samples say why a message fell back to the template, if one does (00fcc2b).
- DAP can sample chosen desks (65f814a).

## Coverage

20 departments (the three test accounts left out), 20 of 20 written by the AI.

| # | Would go on | Department | Why it is written | Copied | Written by |
|---|---|---|---|---|---|
| 1 | 2026-11-30 | Nursing Science | Monday summary | 0 | AI |
| 2 | 2026-11-30 | Basic and Applied Sciences | Monday summary | 0 | AI |
| 3 | 2026-11-30 | Education | Monday summary | 0 | AI |
| 4 | 2026-12-03 | Music and Creative Arts | At risk (every second working day) | 0 | AI |
| 5 | 2026-12-03 | Microbiology | Keep an eye on it (Thursday) | 0 | AI |
| 6 | 2026-12-04 | Medical Laboratory Science | CP1 in 7 days; At risk (every second working day) | 0 | AI |
| 7 | 2026-12-04 | Civil Engineering | CP1 in 7 days; At risk (every second working day) | 0 | AI |
| 8 | 2026-12-09 | Political Science and Public Administration | CP1 in 2 days; At risk (every second working day) | 0 | AI |
| 9 | 2026-12-09 | Information Technology | CP1 in 2 days; At risk (every second working day) | 0 | AI |
| 10 | 2027-01-14 | Finance | final date in 21 days; At risk (every second working day) | 0 | AI |
| 11 | 2027-01-14 | Agriculture | final date in 21 days; At risk (every second working day) | 0 | AI |
| 12 | 2027-01-28 | History and International Studies | final date in 7 days; At risk (every second working day) | 0 | AI |
| 13 | 2027-01-28 | Mass Communication | final date in 7 days; At risk (every second working day) | 0 | AI |
| 14 | 2027-02-03 | Religious Studies | final date in 1 day; At risk (every second working day) | 0 | AI |
| 15 | 2027-02-03 | Law | final date in 1 day; At risk (every second working day) | 0 | AI |
| 16 | 2027-02-04 | Medicine and Surgery | final date today; At risk (every second working day) | 0 | AI |
| 17 | 2027-02-04 | Economics | final date today; At risk (every second working day) | 0 | AI |
| 18 | 2027-02-05 | Public Health | Overdue (working day 1) | 1 | AI |
| 19 | 2027-02-05 | Accounting | Overdue (working day 1) | 1 | AI |
| 20 | 2027-02-09 | Languages and Literary Studies | Overdue (working day 3) | 3 | AI |

## For DAP

- Mark each sample Specific, Kind and Accurate, with comments.
- The greeting uses the roster name without a title; say if it should be "Dr. Adejumo" style (the roster would need titles).
- After the check, a Super Administrator switches sending on in Reminder Agent.
