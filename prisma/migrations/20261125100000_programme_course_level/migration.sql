-- Task B14: a programme's own level for a course, kept on the link between
-- the course and the programme (units and semester already are). Adds one
-- empty column; safe to run again.
ALTER TABLE "programme_courses" ADD COLUMN IF NOT EXISTS "levelOverride" INTEGER;
