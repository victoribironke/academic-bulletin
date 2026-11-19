import { afterAll } from "vitest";

const localTestDatabaseUrl =
  "postgresql://postgres@127.0.0.1:55432/academic_bulletin_test?sslmode=disable";

process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? localTestDatabaseUrl;
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

afterAll(() => {
  // Individual integration files close resources they create. This shared hook
  // intentionally remains lightweight for pure unit tests.
});
