-- B8 — VendorDocument folders + Audit ↔ Framework linkage.

-- ── 1. VendorDocument.folder ────────────────────────────────────
ALTER TABLE "VendorDocument" ADD COLUMN "folder" TEXT;

-- Index for filter + group-by reads on (tenantId, vendorId, folder).
CREATE INDEX "VendorDocument_tenantId_vendorId_folder_idx"
    ON "VendorDocument" ("tenantId", "vendorId", "folder");

-- ── 2. Audit.frameworkKey ───────────────────────────────────────
ALTER TABLE "Audit" ADD COLUMN "frameworkKey" TEXT;

-- Index for "show me every audit for framework X" lookups.
CREATE INDEX "Audit_tenantId_frameworkKey_idx"
    ON "Audit" ("tenantId", "frameworkKey");
