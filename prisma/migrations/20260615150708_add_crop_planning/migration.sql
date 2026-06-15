-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('PLANNING', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "CropPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlantingMethod" AS ENUM ('DIRECT_SOW', 'TRANSPLANT');

-- CreateEnum
CREATE TYPE "PlantingStatus" AS ENUM ('PLANNED', 'SOWN', 'TRANSPLANTED', 'HARVESTING', 'HARVESTED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PlantingStage" AS ENUM ('SOW', 'TRANSPLANT', 'HARVEST');

-- CreateTable
CREATE TABLE "CropType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "family" TEXT,
    "category" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "retentionUntil" TIMESTAMP(3),

    CONSTRAINT "CropType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CropVariety" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cropTypeId" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "defaultMethod" "PlantingMethod",
    "daysToGermination" INTEGER,
    "daysToTransplant" INTEGER,
    "daysToMaturity" INTEGER,
    "harvestWindowDays" INTEGER,
    "inRowSpacingCm" DECIMAL(8,2),
    "betweenRowSpacingCm" DECIMAL(8,2),
    "seedsPerGram" DECIMAL(10,2),
    "germinationRate" DECIMAL(4,3),
    "seedsPerCell" INTEGER,
    "sourceUrn" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "retentionUntil" TIMESTAMP(3),

    CONSTRAINT "CropVariety_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'PLANNING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "retentionUntil" TIMESTAMP(3),

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CropPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "cropTypeId" TEXT NOT NULL,
    "cropVarietyId" TEXT,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "method" "PlantingMethod" NOT NULL DEFAULT 'DIRECT_SOW',
    "firstSowDate" TIMESTAMP(3) NOT NULL,
    "successions" INTEGER NOT NULL DEFAULT 1,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "plantsPerSuccession" INTEGER,
    "bedLengthM" DECIMAL(10,2),
    "rowsPerBed" INTEGER,
    "targetAreaM2" DECIMAL(12,2),
    "status" "CropPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "retentionUntil" TIMESTAMP(3),

    CONSTRAINT "CropPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Planting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cropPlanId" TEXT NOT NULL,
    "cropVarietyId" TEXT,
    "locationId" TEXT,
    "parcelId" TEXT,
    "successionNumber" INTEGER NOT NULL,
    "method" "PlantingMethod" NOT NULL,
    "sowDate" TIMESTAMP(3),
    "transplantDate" TIMESTAMP(3),
    "harvestStartDate" TIMESTAMP(3),
    "harvestEndDate" TIMESTAMP(3),
    "seedQuantityGrams" DECIMAL(12,2),
    "plantCount" INTEGER,
    "areaM2" DECIMAL(12,2),
    "status" "PlantingStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "retentionUntil" TIMESTAMP(3),

    CONSTRAINT "Planting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogPlanting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "plantingId" TEXT NOT NULL,
    "stage" "PlantingStage" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogPlanting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CropType_tenantId_name_idx" ON "CropType"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CropType_id_tenantId_key" ON "CropType"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CropType_tenantId_key_key" ON "CropType"("tenantId", "key");

-- CreateIndex
CREATE INDEX "CropVariety_tenantId_cropTypeId_idx" ON "CropVariety"("tenantId", "cropTypeId");

-- CreateIndex
CREATE INDEX "CropVariety_tenantId_name_idx" ON "CropVariety"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CropVariety_id_tenantId_key" ON "CropVariety"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CropVariety_tenantId_cropTypeId_key_key" ON "CropVariety"("tenantId", "cropTypeId", "key");

-- CreateIndex
CREATE INDEX "Season_tenantId_status_idx" ON "Season"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Season_tenantId_startDate_idx" ON "Season"("tenantId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "Season_id_tenantId_key" ON "Season"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Season_tenantId_key_key" ON "Season"("tenantId", "key");

-- CreateIndex
CREATE INDEX "CropPlan_tenantId_seasonId_idx" ON "CropPlan"("tenantId", "seasonId");

-- CreateIndex
CREATE INDEX "CropPlan_tenantId_cropTypeId_idx" ON "CropPlan"("tenantId", "cropTypeId");

-- CreateIndex
CREATE INDEX "CropPlan_tenantId_cropVarietyId_idx" ON "CropPlan"("tenantId", "cropVarietyId");

-- CreateIndex
CREATE INDEX "CropPlan_tenantId_locationId_idx" ON "CropPlan"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "CropPlan_tenantId_status_idx" ON "CropPlan"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CropPlan_id_tenantId_key" ON "CropPlan"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Planting_tenantId_cropPlanId_idx" ON "Planting"("tenantId", "cropPlanId");

-- CreateIndex
CREATE INDEX "Planting_tenantId_cropVarietyId_idx" ON "Planting"("tenantId", "cropVarietyId");

-- CreateIndex
CREATE INDEX "Planting_tenantId_locationId_idx" ON "Planting"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "Planting_tenantId_parcelId_idx" ON "Planting"("tenantId", "parcelId");

-- CreateIndex
CREATE INDEX "Planting_tenantId_status_idx" ON "Planting"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Planting_tenantId_sowDate_idx" ON "Planting"("tenantId", "sowDate");

-- CreateIndex
CREATE UNIQUE INDEX "Planting_id_tenantId_key" ON "Planting"("id", "tenantId");

-- CreateIndex
CREATE INDEX "LogPlanting_tenantId_plantingId_idx" ON "LogPlanting"("tenantId", "plantingId");

-- CreateIndex
CREATE INDEX "LogPlanting_tenantId_logEntryId_idx" ON "LogPlanting"("tenantId", "logEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "LogPlanting_logEntryId_plantingId_stage_key" ON "LogPlanting"("logEntryId", "plantingId", "stage");

-- AddForeignKey
ALTER TABLE "CropType" ADD CONSTRAINT "CropType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropVariety" ADD CONSTRAINT "CropVariety_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropVariety" ADD CONSTRAINT "CropVariety_cropTypeId_tenantId_fkey" FOREIGN KEY ("cropTypeId", "tenantId") REFERENCES "CropType"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropPlan" ADD CONSTRAINT "CropPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropPlan" ADD CONSTRAINT "CropPlan_seasonId_tenantId_fkey" FOREIGN KEY ("seasonId", "tenantId") REFERENCES "Season"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropPlan" ADD CONSTRAINT "CropPlan_cropTypeId_tenantId_fkey" FOREIGN KEY ("cropTypeId", "tenantId") REFERENCES "CropType"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropPlan" ADD CONSTRAINT "CropPlan_cropVarietyId_tenantId_fkey" FOREIGN KEY ("cropVarietyId", "tenantId") REFERENCES "CropVariety"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropPlan" ADD CONSTRAINT "CropPlan_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "Location"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planting" ADD CONSTRAINT "Planting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planting" ADD CONSTRAINT "Planting_cropPlanId_tenantId_fkey" FOREIGN KEY ("cropPlanId", "tenantId") REFERENCES "CropPlan"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planting" ADD CONSTRAINT "Planting_cropVarietyId_tenantId_fkey" FOREIGN KEY ("cropVarietyId", "tenantId") REFERENCES "CropVariety"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planting" ADD CONSTRAINT "Planting_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "Location"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planting" ADD CONSTRAINT "Planting_parcelId_tenantId_fkey" FOREIGN KEY ("parcelId", "tenantId") REFERENCES "Parcel"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogPlanting" ADD CONSTRAINT "LogPlanting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogPlanting" ADD CONSTRAINT "LogPlanting_logEntryId_tenantId_fkey" FOREIGN KEY ("logEntryId", "tenantId") REFERENCES "LogEntry"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogPlanting" ADD CONSTRAINT "LogPlanting_plantingId_tenantId_fkey" FOREIGN KEY ("plantingId", "tenantId") REFERENCES "Planting"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
--  Row-Level Security — canonical trio for the six tenant-scoped
--  crop-planning tables (all have a NON-NULL tenantId → standard
--  split-policy form, mirroring agriculture.prisma / knowledge_base).
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['CropType', 'CropVariety', 'Season', 'CropPlan', 'Planting', 'LogPlanting']
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
