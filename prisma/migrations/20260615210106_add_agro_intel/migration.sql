-- CreateEnum
CREATE TYPE "DataStreamKind" AS ENUM ('TEMPERATURE', 'SOIL_MOISTURE', 'HUMIDITY', 'RAINFALL', 'WIND', 'LEAF_WETNESS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DataStreamStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AgroSignalKind" AS ENUM ('SPRAY_WINDOW', 'DISEASE_RISK');

-- CreateTable
CREATE TABLE "WeatherObservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "obsDate" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'open-meteo',
    "tempMaxC" DECIMAL(6,2),
    "tempMinC" DECIMAL(6,2),
    "tempMeanC" DECIMAL(6,2),
    "precipMm" DECIMAL(8,2),
    "windMaxKmh" DECIMAL(7,2),
    "humidityMean" DECIMAL(5,2),
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeatherObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataStream" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DataStreamKind" NOT NULL,
    "unit" TEXT,
    "ingestTokenHash" TEXT,
    "status" "DataStreamStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "retentionUntil" TIMESTAMP(3),

    CONSTRAINT "DataStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataStreamReading" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dataStreamId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "unit" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataStreamReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroSignal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "plantingId" TEXT,
    "kind" "AgroSignalKind" NOT NULL,
    "level" TEXT,
    "signalDate" DATE NOT NULL,
    "riskId" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgroSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeatherObservation_tenantId_obsDate_idx" ON "WeatherObservation"("tenantId", "obsDate");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherObservation_id_tenantId_key" ON "WeatherObservation"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherObservation_tenantId_locationId_obsDate_key" ON "WeatherObservation"("tenantId", "locationId", "obsDate");

-- CreateIndex
CREATE INDEX "DataStream_tenantId_locationId_idx" ON "DataStream"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "DataStream_tenantId_status_idx" ON "DataStream"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DataStream_ingestTokenHash_idx" ON "DataStream"("ingestTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "DataStream_id_tenantId_key" ON "DataStream"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DataStream_tenantId_key_key" ON "DataStream"("tenantId", "key");

-- CreateIndex
CREATE INDEX "DataStreamReading_tenantId_dataStreamId_recordedAt_idx" ON "DataStreamReading"("tenantId", "dataStreamId", "recordedAt");

-- CreateIndex
CREATE INDEX "AgroSignal_tenantId_signalDate_idx" ON "AgroSignal"("tenantId", "signalDate");

-- CreateIndex
CREATE INDEX "AgroSignal_tenantId_plantingId_idx" ON "AgroSignal"("tenantId", "plantingId");

-- CreateIndex
CREATE INDEX "AgroSignal_tenantId_riskId_idx" ON "AgroSignal"("tenantId", "riskId");

-- CreateIndex
CREATE UNIQUE INDEX "AgroSignal_tenantId_locationId_kind_signalDate_key" ON "AgroSignal"("tenantId", "locationId", "kind", "signalDate");

-- AddForeignKey
ALTER TABLE "WeatherObservation" ADD CONSTRAINT "WeatherObservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeatherObservation" ADD CONSTRAINT "WeatherObservation_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "Location"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataStream" ADD CONSTRAINT "DataStream_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataStream" ADD CONSTRAINT "DataStream_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "Location"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataStreamReading" ADD CONSTRAINT "DataStreamReading_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataStreamReading" ADD CONSTRAINT "DataStreamReading_dataStreamId_tenantId_fkey" FOREIGN KEY ("dataStreamId", "tenantId") REFERENCES "DataStream"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroSignal" ADD CONSTRAINT "AgroSignal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroSignal" ADD CONSTRAINT "AgroSignal_locationId_tenantId_fkey" FOREIGN KEY ("locationId", "tenantId") REFERENCES "Location"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroSignal" ADD CONSTRAINT "AgroSignal_plantingId_tenantId_fkey" FOREIGN KEY ("plantingId", "tenantId") REFERENCES "Planting"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroSignal" ADD CONSTRAINT "AgroSignal_riskId_tenantId_fkey" FOREIGN KEY ("riskId", "tenantId") REFERENCES "Risk"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
--  Row-Level Security — canonical trio for the four tenant-scoped
--  agro-intel tables (all NON-NULL tenantId → standard split-policy).
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['WeatherObservation', 'DataStream', 'DataStreamReading', 'AgroSignal']
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
