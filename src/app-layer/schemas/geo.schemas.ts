import { z } from 'zod';
import type { Polygon, MultiPolygon } from 'geojson';

/**
 * GeoJSON polygon validation for hand-drawn parcels (terra-draw output).
 * Strict enough to reject malformed input before it reaches PostGIS:
 *   - positions are [lon, lat(, …)] with ≥2 numbers,
 *   - linear rings have ≥4 positions (closed ring),
 *   - longitudes ∈ [-180, 180], latitudes ∈ [-90, 90].
 * `ST_GeomFromGeoJSON` is the final arbiter of validity; this catches the
 * common shapes early with a clean 400.
 */
const lon = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);
const position = z.tuple([lon, lat]).rest(z.number());
const linearRing = z.array(position).min(4);

const polygon = z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(linearRing).min(1),
});
const multiPolygon = z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(linearRing).min(1)).min(1),
});

export const PolygonGeometrySchema = z.discriminatedUnion('type', [polygon, multiPolygon]);

/** Narrow a validated schema value to the geojson library's types. */
export type PolygonGeometry = Polygon | MultiPolygon;

export const CreateParcelSchema = z
    .object({
        name: z.string().min(1).max(200),
        cropType: z.string().max(120).nullable().optional(),
        geometry: PolygonGeometrySchema,
    })
    .strip();

export const UpdateParcelSchema = z
    .object({
        name: z.string().min(1).max(200).optional(),
        cropType: z.string().max(120).nullable().optional(),
        geometry: PolygonGeometrySchema.optional(),
    })
    .strip()
    .refine((b) => b.name !== undefined || b.cropType !== undefined || b.geometry !== undefined, {
        message: 'No fields to update.',
    });
