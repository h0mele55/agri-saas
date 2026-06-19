/**
 * Nearest-field selection for the GPS-aware operator map
 * (feat/delight-smart-defaults).
 *
 * Given the device's location and the parcels on screen, pick the closest
 * one so a "Locate me" tap can auto-select the field the operator is most
 * likely standing in. This is a SUGGESTION — the host page sets it as the
 * selection, and the operator can tap a different parcel to override.
 *
 * No `@turf/centroid` / `@turf/distance` dependency: only `@turf/bbox` is in
 * the tree, so we take each parcel's bbox centre as its "field centre" (more
 * than precise enough to rank a handful of parcels) and a plain haversine for
 * the distance. Pure + deterministic → unit-tested without a DOM or map.
 */
import bbox from '@turf/bbox';
import type { Geometry } from 'geojson';

export interface NearestCandidate {
    id: string;
    geometry: Geometry | null;
}

export interface NearestResult<T> {
    parcel: T;
    /** Great-circle distance from the device to the field centre, in km. */
    km: number;
}

/** Bounding-box centre `[lon, lat]` of a GeoJSON geometry. */
function bboxCentre(geometry: Geometry): [number, number] {
    const [west, south, east, north] = bbox(geometry);
    return [(west + east) / 2, (south + north) / 2];
}

/** Great-circle distance between two `[lon, lat]` points, in kilometres. */
function haversineKm(a: [number, number], b: [number, number]): number {
    const R = 6371;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const [lon1, lat1] = a;
    const [lon2, lat2] = b;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The parcel whose centre is closest to `loc`, or null when no parcel has a
 * geometry. Parcels without geometry are skipped (they can't be located).
 */
export function nearestParcel<T extends NearestCandidate>(
    parcels: readonly T[],
    loc: { lon: number; lat: number },
): NearestResult<T> | null {
    let best: T | null = null;
    let bestKm = Infinity;
    for (const parcel of parcels) {
        if (!parcel.geometry) continue;
        let centre: [number, number];
        try {
            centre = bboxCentre(parcel.geometry);
        } catch {
            // A malformed geometry can't be located — skip it rather than
            // throw and break the whole locate-me flow.
            continue;
        }
        const km = haversineKm([loc.lon, loc.lat], centre);
        if (km < bestKm) {
            bestKm = km;
            best = parcel;
        }
    }
    return best ? { parcel: best, km: bestKm } : null;
}
