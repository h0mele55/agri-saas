/**
 * GPS nearest-field selection (feat/delight-smart-defaults). Pure ranking —
 * locks that "Locate me" auto-selects the closest field and degrades safely
 * when geometry is missing.
 */
import { nearestParcel } from '@/lib/spatial/nearest';
import type { Geometry } from 'geojson';

const square = (lon: number, lat: number, d = 0.001): Geometry => ({
    type: 'Polygon',
    coordinates: [[
        [lon - d, lat - d],
        [lon + d, lat - d],
        [lon + d, lat + d],
        [lon - d, lat + d],
        [lon - d, lat - d],
    ]],
});

describe('nearestParcel', () => {
    it('picks the parcel whose centre is closest to the device', () => {
        const parcels = [
            { id: 'far', name: 'Far', geometry: square(10, 10) },
            { id: 'near', name: 'Near', geometry: square(0.01, 0.01) },
        ];
        const r = nearestParcel(parcels, { lon: 0, lat: 0 });
        expect(r?.parcel.id).toBe('near');
        expect(r?.km).toBeGreaterThanOrEqual(0);
    });

    it('skips parcels without geometry', () => {
        const parcels = [
            { id: 'none', name: 'None', geometry: null },
            { id: 'has', name: 'Has', geometry: square(0, 0) },
        ];
        expect(nearestParcel(parcels, { lon: 0, lat: 0 })?.parcel.id).toBe('has');
    });

    it('returns null when no parcel has geometry', () => {
        expect(nearestParcel([{ id: 'a', name: 'A', geometry: null }], { lon: 0, lat: 0 })).toBeNull();
    });

    it('returns null for an empty parcel list', () => {
        expect(nearestParcel([], { lon: 1, lat: 1 })).toBeNull();
    });

    it('distance is geographically sane (~111 km per degree of latitude)', () => {
        const r = nearestParcel([{ id: 'a', name: 'A', geometry: square(0, 1) }], { lon: 0, lat: 0 });
        expect(r!.km).toBeGreaterThan(100);
        expect(r!.km).toBeLessThan(125);
    });
});
