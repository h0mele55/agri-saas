-- ═══════════════════════════════════════════════════════════════════
--  JOURNAL — full field record (Equipment + Log link tables).
--  LogEntry/LogQuantity already exist (ag inventory-ledger migration);
--  this adds the Ekylibre cost fields + the 4 new tenant-scoped tables.
--  Unrelated `migrate dev` drift (FK churn on ControlException /
--  InventoryLot / ProcessMapSnapshot / ReadinessSnapshot /
--  StockTransaction, DropIndex incl. Parcel_geometry_gist, emailHash
--  NOT NULL changes) was hand-removed. Every new tenant-scoped table
--  gets the canonical RLS trio (tenant_isolation + _insert +
--  superuser_bypass + FORCE).
-- ═══════════════════════════════════════════════════════════════════

-- AlterTable — LogEntry: optional per-activity cost (Ekylibre concept).
ALTER TABLE "LogEntry" ADD COLUMN     "costAmount" DECIMAL(14,2),
ADD COLUMN     "costCurrency" TEXT;

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "make" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "year" INTEGER,
    "meterValue" DECIMAL(12,1),
    "attributesJson" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "retentionUntil" TIMESTAMP(3),
    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    CONSTRAINT "LogLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEquipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    CONSTRAINT "LogEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEntryFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "fileRecordId" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogEntryFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Equipment_tenantId_category_idx" ON "Equipment"("tenantId", "category");
CREATE INDEX "Equipment_tenantId_name_idx" ON "Equipment"("tenantId", "name");
CREATE UNIQUE INDEX "Equipment_id_tenantId_key" ON "Equipment"("id", "tenantId");
CREATE INDEX "LogLocation_tenantId_locationId_idx" ON "LogLocation"("tenantId", "locationId");
CREATE UNIQUE INDEX "LogLocation_logEntryId_locationId_key" ON "LogLocation"("logEntryId", "locationId");
CREATE INDEX "LogEquipment_tenantId_equipmentId_idx" ON "LogEquipment"("tenantId", "equipmentId");
CREATE UNIQUE INDEX "LogEquipment_logEntryId_equipmentId_key" ON "LogEquipment"("logEntryId", "equipmentId");
CREATE INDEX "LogEntryFile_tenantId_logEntryId_idx" ON "LogEntryFile"("tenantId", "logEntryId");
CREATE UNIQUE INDEX "LogEntryFile_logEntryId_fileRecordId_key" ON "LogEntryFile"("logEntryId", "fileRecordId");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LogLocation" ADD CONSTRAINT "LogLocation_logEntryId_tenantId_fkey" FOREIGN KEY ("logEntryId", "tenantId") REFERENCES "LogEntry"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogLocation" ADD CONSTRAINT "LogLocation_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "Location"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogLocation" ADD CONSTRAINT "LogLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogEquipment" ADD CONSTRAINT "LogEquipment_logEntryId_tenantId_fkey" FOREIGN KEY ("logEntryId", "tenantId") REFERENCES "LogEntry"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogEquipment" ADD CONSTRAINT "LogEquipment_equipmentId_tenantId_fkey" FOREIGN KEY ("equipmentId", "tenantId") REFERENCES "Equipment"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogEquipment" ADD CONSTRAINT "LogEquipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogEntryFile" ADD CONSTRAINT "LogEntryFile_logEntryId_tenantId_fkey" FOREIGN KEY ("logEntryId", "tenantId") REFERENCES "LogEntry"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogEntryFile" ADD CONSTRAINT "LogEntryFile_fileRecordId_fkey" FOREIGN KEY ("fileRecordId") REFERENCES "FileRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LogEntryFile" ADD CONSTRAINT "LogEntryFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── RLS trio (the 4 new tenant-scoped tables) ───

ALTER TABLE "Equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Equipment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Equipment";
CREATE POLICY tenant_isolation ON "Equipment"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "Equipment";
CREATE POLICY tenant_isolation_insert ON "Equipment"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "Equipment";
CREATE POLICY superuser_bypass ON "Equipment"
    USING (current_setting('role') != 'app_user');

ALTER TABLE "LogLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LogLocation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LogLocation";
CREATE POLICY tenant_isolation ON "LogLocation"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "LogLocation";
CREATE POLICY tenant_isolation_insert ON "LogLocation"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "LogLocation";
CREATE POLICY superuser_bypass ON "LogLocation"
    USING (current_setting('role') != 'app_user');

ALTER TABLE "LogEquipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LogEquipment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LogEquipment";
CREATE POLICY tenant_isolation ON "LogEquipment"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "LogEquipment";
CREATE POLICY tenant_isolation_insert ON "LogEquipment"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "LogEquipment";
CREATE POLICY superuser_bypass ON "LogEquipment"
    USING (current_setting('role') != 'app_user');

ALTER TABLE "LogEntryFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LogEntryFile" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "LogEntryFile";
CREATE POLICY tenant_isolation ON "LogEntryFile"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "LogEntryFile";
CREATE POLICY tenant_isolation_insert ON "LogEntryFile"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "LogEntryFile";
CREATE POLICY superuser_bypass ON "LogEntryFile"
    USING (current_setting('role') != 'app_user');
