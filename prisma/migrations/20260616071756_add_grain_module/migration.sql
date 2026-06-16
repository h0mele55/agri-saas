-- Enterprise-grain — the large grain-producer module (storage bins, marketing
-- contracts, yield records, per-activity cost accounting, lot blending). Gated
-- at ENTERPRISE tier in MODULE_MIN_PLAN. Enum-value-only change; the unrelated
-- FK / index / column drift that `prisma migrate dev` emitted against the live
-- schema was stripped (pre-existing schema-folder vs migration-history skew,
-- not part of this change).

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'GRAIN';
