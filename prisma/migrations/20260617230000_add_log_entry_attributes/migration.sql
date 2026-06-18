-- AI photo pest/disease ID: a structured-attributes column on LogEntry.
-- Stores the async vision result under `attributesJson.pestId` (distinct
-- from `conditionsJson`, which holds spray-compliance fields). Nullable,
-- no default — ADD COLUMN is instant on PG11+.
ALTER TABLE "LogEntry" ADD COLUMN "attributesJson" JSONB;
