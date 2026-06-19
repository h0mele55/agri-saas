-- "Try it with sample data" mode: a reversible, tenant-scoped seed.
-- A plain boolean default-false flag on the four ag tables a new
-- farmer's sample dataset touches. The loader tags every seeded row
-- `isSampleData = true`; the one-tap clear soft-deletes exactly those
-- rows. Additive + RLS-safe (these tables already carry RLS + tenantId);
-- ADD COLUMN ... NOT NULL DEFAULT false is instant on PG11+. No index —
-- a low-selectivity boolean filter is always paired with the existing
-- tenantId-leading indexes.
ALTER TABLE "Location" ADD COLUMN "isSampleData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Parcel" ADD COLUMN "isSampleData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LogEntry" ADD COLUMN "isSampleData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InventoryLot" ADD COLUMN "isSampleData" BOOLEAN NOT NULL DEFAULT false;
