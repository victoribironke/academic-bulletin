-- Task B13 (work order v2.1): courses with no semester (all MBBS courses and
-- some practicums, rule W17), 0-unit courses (Citizenship Orientation) and
-- courses above 6 units (BU-PHS 416 Internship, 12 units).
--
-- Safe to run more than once. Nothing is deleted or rewritten: semester
-- stops being required, and the database refuses units outside 0 to 12 and
-- a semester other than 1, 2 or empty.

ALTER TABLE "master_courses" ALTER COLUMN "semester" DROP NOT NULL;
ALTER TABLE "courses" ALTER COLUMN "semester" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_courses_units_range') THEN
    ALTER TABLE "master_courses" ADD CONSTRAINT "master_courses_units_range"
      CHECK ("units" BETWEEN 0 AND 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_courses_semester_value') THEN
    ALTER TABLE "master_courses" ADD CONSTRAINT "master_courses_semester_value"
      CHECK ("semester" IS NULL OR "semester" IN (1, 2));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_units_range') THEN
    ALTER TABLE "courses" ADD CONSTRAINT "courses_units_range"
      CHECK ("units" BETWEEN 0 AND 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_semester_value') THEN
    ALTER TABLE "courses" ADD CONSTRAINT "courses_semester_value"
      CHECK ("semester" IS NULL OR "semester" IN (1, 2));
  END IF;
END $$;

-- Check: both columns allow empty, and the four rules exist.
SELECT table_name, is_nullable FROM information_schema.columns
 WHERE column_name = 'semester' AND table_name IN ('master_courses', 'courses');
SELECT conname FROM pg_constraint
 WHERE conname IN ('master_courses_units_range', 'master_courses_semester_value',
                   'courses_units_range', 'courses_semester_value');
