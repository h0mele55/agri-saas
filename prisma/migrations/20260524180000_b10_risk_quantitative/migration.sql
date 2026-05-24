-- B10 — Quantitative risk assessment fields.
--
-- SLE × ARO = ALE. ALE is derived at read time (the analytics
-- usecase computes it per-row), not stored — both inputs are
-- nullable so the derived column would need to track null/non-null
-- transitions in every write path. Storing only the inputs keeps
-- the invariant set small.

ALTER TABLE "Risk" ADD COLUMN "sleAmount" DOUBLE PRECISION;
ALTER TABLE "Risk" ADD COLUMN "aroAmount" DOUBLE PRECISION;
