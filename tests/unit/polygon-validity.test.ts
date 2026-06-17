/**
 * Unit tests for the client-side optimistic polygon-validity check
 * (`src/lib/geo/polygon-validity.ts`). Pure module — no DB, no PostGIS,
 * no mocks. The server's `ST_MakeValid`/`ST_IsValid` remain the
 * authority; these tests pin the fast UX-preview heuristic.
 */
import type { Polygon, MultiPolygon } from 'geojson';
import {
    validatePolygonGeometry,
    isSelfIntersecting,
    type PolygonValidity,
} from '@/lib/geo/polygon-validity';

// ── Fixtures (GeoJSON [lng, lat], rings closed: first === last) ──────────

/** A simple, valid, closed unit square. */
const SQUARE: Polygon = {
    type: 'Polygon',
    coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
};

/**
 * A "bowtie": the classic self-intersecting quad. Listing corners in the
 * order BL → TR → TL → BR → BL makes the two diagonals cross.
 */
const BOWTIE: Polygon = {
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]],
};

/** Fewer than 4 positions — cannot bound an area. */
const TOO_FEW: Polygon = {
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [0, 0]]],
};

/** 4+ positions but the ring is NOT closed (last !== first). */
const UNCLOSED: Polygon = {
    type: 'Polygon',
    coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0]]],
};

/** Two disjoint valid squares as a MultiPolygon. */
const MULTI: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
        [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
        [[[2, 2], [2, 3], [3, 3], [3, 2], [2, 2]]],
    ],
};

describe('validatePolygonGeometry', () => {
    it('accepts a valid square', () => {
        const result: PolygonValidity = validatePolygonGeometry(SQUARE);
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it('rejects a self-intersecting bowtie with a reason', () => {
        const result = validatePolygonGeometry(BOWTIE);
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
        expect(result.reason).toMatch(/self-intersect/i);
    });

    it('rejects a ring with fewer than 4 points', () => {
        const result = validatePolygonGeometry(TOO_FEW);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/4 points/i);
    });

    it('rejects an unclosed ring', () => {
        const result = validatePolygonGeometry(UNCLOSED);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/not closed/i);
    });

    it('accepts a valid MultiPolygon', () => {
        const result = validatePolygonGeometry(MULTI);
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it('rejects a MultiPolygon when any member polygon is invalid', () => {
        const mixed: MultiPolygon = {
            type: 'MultiPolygon',
            coordinates: [
                MULTI.coordinates[0],
                BOWTIE.coordinates, // a self-intersecting member
            ],
        };
        const result = validatePolygonGeometry(mixed);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/self-intersect/i);
    });

    it('rejects a polygon with no rings', () => {
        const empty: Polygon = { type: 'Polygon', coordinates: [] };
        const result = validatePolygonGeometry(empty);
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
    });

    it('rejects a non-polygon geometry shape', () => {
        // Deliberately pass a non-polygon to exercise the guard.
        const notAPolygon = { type: 'Point', coordinates: [0, 0] } as unknown as Polygon;
        const result = validatePolygonGeometry(notAPolygon);
        expect(result.valid).toBe(false);
    });
});

describe('isSelfIntersecting', () => {
    it('returns false for a simple square ring', () => {
        expect(isSelfIntersecting(SQUARE.coordinates[0])).toBe(false);
    });

    it('returns true for a bowtie ring (crossing diagonals)', () => {
        expect(isSelfIntersecting(BOWTIE.coordinates[0])).toBe(true);
    });

    it('returns false for a convex pentagon', () => {
        const pentagon = [
            [0, 0],
            [2, 0],
            [3, 2],
            [1, 3],
            [-1, 2],
            [0, 0],
        ];
        expect(isSelfIntersecting(pentagon)).toBe(false);
    });

    it('returns true for a non-adjacent edge crossing in a larger ring', () => {
        // A 5-vertex ring where edge (v1→v2) crosses edge (v3→v4).
        const crossed = [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 2],
            [2, -2],
            [0, 0],
        ];
        expect(isSelfIntersecting(crossed)).toBe(true);
    });

    it('returns false for a degenerate (too-small) ring', () => {
        expect(isSelfIntersecting([[0, 0], [1, 1], [0, 0]])).toBe(false);
    });

    it('does not count adjacent edges sharing a vertex as intersecting', () => {
        // An L-shape (concave but simple) — adjacent edges touch at shared
        // corners, which must NOT register as self-intersection.
        const lShape = [
            [0, 0],
            [2, 0],
            [2, 1],
            [1, 1],
            [1, 2],
            [0, 2],
            [0, 0],
        ];
        expect(isSelfIntersecting(lShape)).toBe(false);
    });
});
