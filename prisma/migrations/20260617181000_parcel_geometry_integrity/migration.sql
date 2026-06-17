-- Data-integrity: parcel geometry validity + areaHa-never-NULL invariant.
--
-- Hand-drawn / imported parcels could land a self-intersecting geometry
-- (a meaningless ST_Area) or a NULL areaHa. The write path now repairs
-- with ST_MakeValid and COALESCEs the area, but EXISTING rows may carry
-- the old corruption. This migration:
--   1. repairs any stored invalid geometry (ST_MakeValid, keep polygons),
--   2. backfills areaHa for every parcel that has a geometry, and
--   3. enforces, going forward, that a parcel WITH a geometry carries a
--      non-NULL areaHa (the regulatory acreage figure).
--
-- Steps 1-2 run BEFORE the CHECK so no existing row violates it. PostGIS
-- (ST_*) is sanctioned in DDL/migrations; the application's ST_* stays
-- contained in src/lib/db/geo.ts.

-- 1 — repair stored invalid geometries in place.
UPDATE "Parcel"
    SET "geometry" = ST_Multi(ST_CollectionExtract(ST_MakeValid("geometry"), 3))
    WHERE "geometry" IS NOT NULL
      AND NOT ST_IsValid("geometry");

-- 2 — backfill areaHa for every geometried parcel (recompute from the
--     now-valid geometry; COALESCE so a degenerate repair lands 0, not NULL).
UPDATE "Parcel"
    SET "areaHa" = COALESCE(ROUND((ST_Area("geometry"::geography) / 10000.0)::numeric, 4), 0)
    WHERE "geometry" IS NOT NULL
      AND "areaHa" IS NULL;

-- 3 — invariant: geometry present ⇒ areaHa present.
ALTER TABLE "Parcel"
    ADD CONSTRAINT "parcel_area_ha_present"
    CHECK ("geometry" IS NULL OR "areaHa" IS NOT NULL);
