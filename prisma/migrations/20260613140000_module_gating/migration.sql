-- ═══════════════════════════════════════════════════════════════════
--  WP-2 — per-tenant module gating (TenantModuleSettings + ModuleKey)
--  Tenant-scoped table → the canonical RLS trio (tenant_isolation +
--  tenant_isolation_insert + superuser_bypass + FORCE), matching the
--  Feature-1 migration. Absence of a row = all modules enabled
--  (resolved in src/lib/modules.ts), so existing tenants are unaffected.
-- ═══════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('JOURNAL', 'INVENTORY', 'PLANNING', 'CERTIFICATION', 'RISK', 'VENDORS', 'AUTOMATION', 'PROCESSES', 'AI');

-- CreateTable
CREATE TABLE "TenantModuleSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabledModules" "ModuleKey"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantModuleSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantModuleSettings_tenantId_key" ON "TenantModuleSettings"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantModuleSettings" ADD CONSTRAINT "TenantModuleSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── RLS trio ───
ALTER TABLE "TenantModuleSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantModuleSettings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantModuleSettings";
CREATE POLICY tenant_isolation ON "TenantModuleSettings"
    USING ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS tenant_isolation_insert ON "TenantModuleSettings";
CREATE POLICY tenant_isolation_insert ON "TenantModuleSettings"
    FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::text);
DROP POLICY IF EXISTS superuser_bypass ON "TenantModuleSettings";
CREATE POLICY superuser_bypass ON "TenantModuleSettings"
    USING (current_setting('role') != 'app_user');
