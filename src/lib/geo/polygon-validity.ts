/**
 * polygon-validity — a pure, dependency-free, CLIENT-SAFE topology check
 * for an OPTIMISTIC map-preview hint. It mirrors (a subset of) what the
 * server's PostGIS `ST_MakeValid` / `ST_IsValid` enforce, but it is NOT
 * the authority: the server still repairs/validates every persisted
 * geometry. This module exists purely so the drawing UI can give fast,
 * non-blocking feedback ("this shape looks invalid — it will be
 * auto-repaired on save") without a round-trip.
 *
 * NO database, NO PostGIS (`ST_*`), NO imports of server-side code — the
 * only type dependency is the structural `geojson` Polygon/MultiPolygon
 * shape, imported as a `type` so this stays tree-shakeable and bundleable
 * into the client. Geometry is GeoJSON in WGS84 ([lng, lat] positions),
 * the same convention as `MapCanvas`.
 *
 * Checks performed (intentionally a conservative subset — false-negatives
 * are fine because the server is the backstop):
 *   - at least one ring
 *   - every ring has ≥ 4 positions
 *   - every ring is closed (first position === last position)
 *   - no ring self-intersects (O(n²) segment-pair scan)
 */
import type { Polygon, MultiPolygon } from 'geojson';

/** Result of the optimistic client-side topology check. */
export type PolygonValidity = { valid: boolean; reason?: string };

/** A 2D position; GeoJSON allows extra ordinates but only x/y are used. */
type Pos = number[];

const valid: PolygonValidity = { valid: true };
const invalid = (reason: string): PolygonValidity => ({ valid: false, reason });

/**
 * Validate a GeoJSON Polygon or MultiPolygon for the client preview.
 * Returns `{ valid: true }` or `{ valid: false, reason }` describing the
 * FIRST problem found (rings checked outer→inner, polygon-by-polygon for
 * a MultiPolygon). The reason string is UX copy, not a machine contract.
 */
export function validatePolygonGeometry(geom: Polygon | MultiPolygon): PolygonValidity {
    if (!geom || typeof geom !== 'object') return invalid('No geometry');

    // Normalise to a list of polygons (each = an array of linear rings).
    const polygons: Pos[][][] =
        geom.type === 'MultiPolygon'
            ? (geom.coordinates as Pos[][][])
            : geom.type === 'Polygon'
              ? [geom.coordinates as Pos[][]]
              : [];

    if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') {
        return invalid('Geometry is not a polygon');
    }
    if (polygons.length === 0) return invalid('No polygon present');

    for (const rings of polygons) {
        if (!rings || rings.length === 0) return invalid('Polygon has no rings');

        for (const ring of rings) {
            // A linear ring needs ≥ 4 positions (3 distinct corners + the
            // closing repeat of the first). Fewer cannot bound an area.
            if (!ring || ring.length < 4) {
                return invalid('A ring needs at least 4 points');
            }

            const first = ring[0];
            const last = ring[ring.length - 1];
            if (!positionsEqual(first, last)) {
                return invalid('Ring is not closed (first and last point must match)');
            }

            if (isSelfIntersecting(ring)) {
                return invalid('Ring is self-intersecting');
            }
        }
    }

    return valid;
}

/**
 * Does a single linear ring self-intersect? O(n²) scan over every
 * non-adjacent edge pair using an orientation/cross-product segment-
 * intersection test.
 *
 * The ring is treated as closed: its edges are (p0,p1), (p1,p2), …,
 * (p[n-2], p[n-1]) where p[0] === p[n-1]. Edges that SHARE an endpoint are
 * legitimately touching, never an intersection — so:
 *   - adjacent edges (i, i+1) are skipped (shared vertex), and
 *   - the closing edge meeting the first edge at the shared start/end
 *     vertex is skipped (the wrap-around adjacency).
 * Any OTHER pair that touches or crosses is a self-intersection.
 */
export function isSelfIntersecting(ring: number[][]): boolean {
    // Build the unique edge list from the closed ring. If the ring is
    // closed (first === last), the last stored position duplicates the
    // first, so edges run over indices [0 .. n-2].
    const n = ring.length;
    if (n < 4) return false; // too small to self-intersect meaningfully

    const closed = positionsEqual(ring[0], ring[n - 1]);
    // Number of vertices forming the polygon (excluding the duplicate
    // closing vertex when present).
    const m = closed ? n - 1 : n;
    if (m < 3) return false;

    // Edges: e_k = (v_k, v_{(k+1) % m}) for k in [0, m). This yields m
    // edges forming the closed loop regardless of an explicit closing
    // vertex, so wrap-around adjacency is handled uniformly below.
    const edgeCount = m;

    for (let i = 0; i < edgeCount; i++) {
        const a1 = ring[i];
        const a2 = ring[(i + 1) % m];

        for (let j = i + 1; j < edgeCount; j++) {
            // Skip adjacent edges (they share a vertex by construction):
            // consecutive edges, and the wrap-around pair (first vs last).
            const adjacent =
                j === i + 1 || (i === 0 && j === edgeCount - 1);
            if (adjacent) continue;

            const b1 = ring[j];
            const b2 = ring[(j + 1) % m];

            if (segmentsIntersect(a1, a2, b1, b2)) return true;
        }
    }

    return false;
}

/** Two positions equal in x and y (extra ordinates ignored). */
function positionsEqual(a: Pos, b: Pos): boolean {
    return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}

/**
 * Orientation of the ordered triplet (p, q, r):
 *   > 0  counter-clockwise (left turn)
 *   < 0  clockwise (right turn)
 *   = 0  collinear
 * via the 2D cross product of (q-p) × (r-p).
 */
function cross(p: Pos, q: Pos, r: Pos): number {
    return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
}

/** Is point q on segment p–r, given p, q, r are known collinear? */
function onSegment(p: Pos, q: Pos, r: Pos): boolean {
    return (
        Math.min(p[0], r[0]) <= q[0] &&
        q[0] <= Math.max(p[0], r[0]) &&
        Math.min(p[1], r[1]) <= q[1] &&
        q[1] <= Math.max(p[1], r[1])
    );
}

/**
 * Standard 2D segment-intersection test (proper crossings + collinear
 * overlap + endpoint-touch). Used by `isSelfIntersecting`; the caller is
 * responsible for excluding legitimately-adjacent edges that share a
 * vertex. Treats a shared-point touch between non-adjacent edges as an
 * intersection (a ring that pinches back to touch a far edge is invalid).
 */
function segmentsIntersect(p1: Pos, p2: Pos, p3: Pos, p4: Pos): boolean {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);

    // Proper intersection: the endpoints of each segment straddle the
    // other segment's supporting line.
    if (
        ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    ) {
        return true;
    }

    // Collinear / touching cases: a zero orientation with the point lying
    // on the other segment is a touch/overlap.
    if (d1 === 0 && onSegment(p3, p1, p4)) return true;
    if (d2 === 0 && onSegment(p3, p2, p4)) return true;
    if (d3 === 0 && onSegment(p1, p3, p2)) return true;
    if (d4 === 0 && onSegment(p1, p4, p2)) return true;

    return false;
}
