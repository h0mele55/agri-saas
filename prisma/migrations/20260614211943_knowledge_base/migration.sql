-- ═══════════════════════════════════════════════════════════════════
--  Knowledge Base — versioned SOPs + growing guides (repurposes Policy)
-- ═══════════════════════════════════════════════════════════════════
--  KnowledgeArticle / KnowledgeArticleVersion / KnowledgeAcknowledgement
--  mirror Policy / PolicyVersion / PolicyAcknowledgement. All three carry
--  tenantId → the canonical direct-RLS trio (the only structural change vs
--  the migrate-dev diff, which is otherwise hand-stripped of unrelated
--  pre-existing drift: FK churn, the Parcel_geometry_gist GiST drop,
--  emailHash NOT NULL changes).
-- ═══════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "KnowledgeContentType" AS ENUM ('HTML', 'MARKDOWN');

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "category" TEXT,
    "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "ownerUserId" TEXT,
    "language" TEXT DEFAULT 'en',
    "source" TEXT,
    "lifecycleVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "retentionUntil" TIMESTAMP(3),

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "contentType" "KnowledgeContentType" NOT NULL DEFAULT 'HTML',
    "contentText" TEXT,
    "changeSummary" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeAcknowledgement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "articleVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_currentVersionId_key" ON "KnowledgeArticle"("currentVersionId");
CREATE INDEX "KnowledgeArticle_tenantId_status_idx" ON "KnowledgeArticle"("tenantId", "status");
CREATE INDEX "KnowledgeArticle_tenantId_category_idx" ON "KnowledgeArticle"("tenantId", "category");
CREATE INDEX "KnowledgeArticle_tenantId_deletedAt_idx" ON "KnowledgeArticle"("tenantId", "deletedAt");
CREATE INDEX "KnowledgeArticle_tenantId_updatedAt_idx" ON "KnowledgeArticle"("tenantId", "updatedAt");
CREATE UNIQUE INDEX "KnowledgeArticle_id_tenantId_key" ON "KnowledgeArticle"("id", "tenantId");
CREATE UNIQUE INDEX "KnowledgeArticle_tenantId_slug_key" ON "KnowledgeArticle"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "KnowledgeArticleVersion_tenantId_idx" ON "KnowledgeArticleVersion"("tenantId");
CREATE INDEX "KnowledgeArticleVersion_tenantId_articleId_idx" ON "KnowledgeArticleVersion"("tenantId", "articleId");
CREATE UNIQUE INDEX "KnowledgeArticleVersion_id_tenantId_key" ON "KnowledgeArticleVersion"("id", "tenantId");
CREATE UNIQUE INDEX "KnowledgeArticleVersion_articleId_versionNumber_key" ON "KnowledgeArticleVersion"("articleId", "versionNumber");

-- CreateIndex
CREATE INDEX "KnowledgeAcknowledgement_tenantId_articleVersionId_idx" ON "KnowledgeAcknowledgement"("tenantId", "articleVersionId");
CREATE INDEX "KnowledgeAcknowledgement_tenantId_userId_idx" ON "KnowledgeAcknowledgement"("tenantId", "userId");
CREATE UNIQUE INDEX "KnowledgeAcknowledgement_articleVersionId_userId_key" ON "KnowledgeAcknowledgement"("articleVersionId", "userId");

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "KnowledgeArticleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeArticleVersion" ADD CONSTRAINT "KnowledgeArticleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAcknowledgement" ADD CONSTRAINT "KnowledgeAcknowledgement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeAcknowledgement" ADD CONSTRAINT "KnowledgeAcknowledgement_articleVersionId_tenantId_fkey" FOREIGN KEY ("articleVersionId", "tenantId") REFERENCES "KnowledgeArticleVersion"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeAcknowledgement" ADD CONSTRAINT "KnowledgeAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
--  Row-Level Security — canonical trio for the three tenant-scoped tables.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['KnowledgeArticle', 'KnowledgeArticleVersion', 'KnowledgeAcknowledgement']
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

SELECT 'Knowledge Base installed' AS result;
