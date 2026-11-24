-- Task B3: one code, one course, however it is spaced: "BIO102", "bio 102"
-- and "BIO-102" can't all exist. The key matches courseCodeKey() in
-- lib/courses/code-key.ts.
--
-- Run it only after scripts/clean-course-codes.ts has merged the duplicates
-- and DAP has settled the groups in the merge report. While two courses still
-- share a code, Postgres refuses it ("could not create unique index"), and
-- nothing changes. Safe to run again.
CREATE UNIQUE INDEX IF NOT EXISTS "master_courses_code_compact_key" ON "master_courses" (upper(regexp_replace("code", '[[:space:]-]+', '', 'g')));
