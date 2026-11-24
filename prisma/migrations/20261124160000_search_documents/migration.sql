-- Tasks K1 to K4: one search table, with full-text search, typing-mistake
-- matching (pg_trgm) and accent folding (unaccent), all indexed (section
-- 9.2). The app fills it and keeps it up to date (lib/search/sync.ts); it is
-- not a Prisma model because of its tsvector column. Safe to run again.
-- In Railway's query box run one statement at a time (seven in all).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS "search_documents" (
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "code_key" TEXT,
    "secondary" TEXT,
    "url" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "visibility" TEXT NOT NULL DEFAULT 'ALL_SIGNED_IN',
    "source_updated_at" TIMESTAMP(3),
    "search_text" TEXT NOT NULL,
    "tsv" TSVECTOR NOT NULL,
    CONSTRAINT "search_documents_pkey" PRIMARY KEY ("entity_type", "entity_id")
);

CREATE INDEX IF NOT EXISTS "search_documents_tsv_idx" ON "search_documents" USING GIN ("tsv");

CREATE INDEX IF NOT EXISTS "search_documents_trgm_idx" ON "search_documents" USING GIN ("search_text" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "search_documents_code_key_idx" ON "search_documents" ("code_key" text_pattern_ops);

CREATE INDEX IF NOT EXISTS "search_documents_type_updated_idx" ON "search_documents" ("entity_type", "source_updated_at");
