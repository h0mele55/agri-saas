-- Phase-8 — auto-evidence provenance. A nullable scalar FK on Evidence
-- pointing back at the source farm journal LogEntry (e.g. an
-- INPUT_APPLICATION spray record auto-attached as scheme evidence). Drives
-- idempotency + the "farm records backing this scheme" query. The unrelated
-- FK / index / emailHash drift `prisma migrate dev` emitted against the live
-- schema was stripped (pre-existing schema-folder vs migration-history skew).

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN "sourceLogEntryId" TEXT;

-- CreateIndex
CREATE INDEX "Evidence_tenantId_sourceLogEntryId_idx" ON "Evidence"("tenantId", "sourceLogEntryId");
