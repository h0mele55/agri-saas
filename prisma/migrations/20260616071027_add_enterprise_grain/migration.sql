-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('FIELD', 'BIN', 'STORAGE');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('SALE', 'PURCHASE');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DELIVERED', 'SETTLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "capacityTonnes" DECIMAL(14,2),
ADD COLUMN     "kind" "LocationKind" NOT NULL DEFAULT 'FIELD';

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seasonId" TEXT,
    "key" TEXT,
    "counterparty" TEXT NOT NULL,
    "commodity" TEXT,
    "type" "ContractType" NOT NULL DEFAULT 'SALE',
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "volumeTonnes" DECIMAL(14,3),
    "pricePerTonne" DECIMAL(14,2),
    "priceCurrency" TEXT,
    "deliveryStart" TIMESTAMP(3),
    "deliveryEnd" TIMESTAMP(3),
    "terms" TEXT,
    "pricingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "retentionUntil" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YieldRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plantingId" TEXT,
    "locationId" TEXT,
    "seasonId" TEXT,
    "commodity" TEXT,
    "harvestedAt" TIMESTAMP(3),
    "grossTonnes" DECIMAL(14,3),
    "moisturePct" DECIMAL(5,2),
    "areaHa" DECIMAL(12,4),
    "valuationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "retentionUntil" TIMESTAMP(3),

    CONSTRAINT "YieldRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_tenantId_status_idx" ON "Contract"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Contract_tenantId_type_idx" ON "Contract"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Contract_tenantId_seasonId_idx" ON "Contract"("tenantId", "seasonId");

-- CreateIndex
CREATE INDEX "Contract_tenantId_deliveryStart_idx" ON "Contract"("tenantId", "deliveryStart");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_id_tenantId_key" ON "Contract"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_tenantId_key_key" ON "Contract"("tenantId", "key");

-- CreateIndex
CREATE INDEX "YieldRecord_tenantId_plantingId_idx" ON "YieldRecord"("tenantId", "plantingId");

-- CreateIndex
CREATE INDEX "YieldRecord_tenantId_locationId_idx" ON "YieldRecord"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "YieldRecord_tenantId_seasonId_idx" ON "YieldRecord"("tenantId", "seasonId");

-- CreateIndex
CREATE INDEX "YieldRecord_tenantId_harvestedAt_idx" ON "YieldRecord"("tenantId", "harvestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "YieldRecord_id_tenantId_key" ON "YieldRecord"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Location_tenantId_kind_idx" ON "Location"("tenantId", "kind");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_seasonId_tenantId_fkey" FOREIGN KEY ("seasonId", "tenantId") REFERENCES "Season"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YieldRecord" ADD CONSTRAINT "YieldRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YieldRecord" ADD CONSTRAINT "YieldRecord_plantingId_tenantId_fkey" FOREIGN KEY ("plantingId", "tenantId") REFERENCES "Planting"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YieldRecord" ADD CONSTRAINT "YieldRecord_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "Location"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YieldRecord" ADD CONSTRAINT "YieldRecord_seasonId_tenantId_fkey" FOREIGN KEY ("seasonId", "tenantId") REFERENCES "Season"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
--  Row-Level Security — canonical trio for the two tenant-scoped
--  enterprise-grain tables (both NON-NULL tenantId → standard
--  split-policy). Contract holds commercially-sensitive marketing
--  data; YieldRecord holds per-field production totals — isolation is
--  load-bearing.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Contract', 'YieldRecord']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)::text)', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true)::text)', t);
    EXECUTE format('DROP POLICY IF EXISTS superuser_bypass ON %I', t);
    EXECUTE format('CREATE POLICY superuser_bypass ON %I USING (current_setting(''role'') != ''app_user'')', t);
  END LOOP;
END
$$;
