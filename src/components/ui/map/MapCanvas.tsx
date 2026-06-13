'use client';

/**
 * MapCanvas — renders a location's parcels as a MapLibre GeoJSON layer
 * and (optionally) lets the user click parcels to multi-select. Used by
 * the Location detail Map tab, the PrescriptionPanel, and the operator's
 * read-only field-operation view.
 *
 * MapLibre GL (BSD-3) + react-map-gl (MIT) — no API key (public demo
 * basemap). Geometry is GeoJSON MultiPolygon in WGS84, produced by the
 * backend via ST_AsGeoJSON (in src/lib/db/geo.ts).
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useMemo } from 'react';
import Map, { Layer, Source, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

export interface MapParcel {
    id: string;
    name: string;
    areaHa?: number | null;
    geometry: Geometry | null;
}

export interface MapCanvasProps {
    parcels: MapParcel[];
    /** [west, south, east, north] for initial fit; world view when null. */
    bounds?: [number, number, number, number] | null;
    selectedIds?: string[];
    onSelectionChange?: (ids: string[]) => void;
    /** When false, the map is read-only (operator view). */
    interactive?: boolean;
    /** Parcels rendered as completed (green) — operator progress. */
    doneIds?: string[];
    className?: string;
}

const DEMO_STYLE = 'https://demotiles.maplibre.org/style.json';

export function MapCanvas({
    parcels,
    bounds,
    selectedIds = [],
    onSelectionChange,
    interactive = true,
    doneIds = [],
    className,
}: MapCanvasProps) {
    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
    const done = useMemo(() => new Set(doneIds), [doneIds]);

    const data = useMemo<FeatureCollection>(() => ({
        type: 'FeatureCollection',
        features: parcels
            .filter((p): p is MapParcel & { geometry: Geometry } => !!p.geometry)
            .map((p): Feature => ({
                type: 'Feature',
                id: p.id,
                properties: {
                    id: p.id,
                    name: p.name,
                    selected: selected.has(p.id),
                    done: done.has(p.id),
                },
                geometry: p.geometry,
            })),
    }), [parcels, selected, done]);

    const initialViewState = useMemo(() => {
        if (bounds) {
            const [w, s, e, n] = bounds;
            return { longitude: (w + e) / 2, latitude: (s + n) / 2, zoom: 12 };
        }
        return { longitude: 0, latitude: 20, zoom: 1 };
    }, [bounds]);

    const handleClick = useCallback((e: MapLayerMouseEvent) => {
        if (!interactive || !onSelectionChange) return;
        const feature = e.features?.[0];
        const id = feature?.properties?.id as string | undefined;
        if (!id) return;
        onSelectionChange(
            selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
        );
    }, [interactive, onSelectionChange, selected, selectedIds]);

    return (
        <div className={className ?? 'h-[480px] w-full overflow-hidden rounded-lg border border-border-subtle'}>
            <Map
                initialViewState={initialViewState}
                mapStyle={DEMO_STYLE}
                interactiveLayerIds={interactive ? ['parcel-fill'] : []}
                onClick={handleClick}
                style={{ width: '100%', height: '100%' }}
                cursor={interactive ? 'pointer' : 'grab'}
            >
                <Source id="parcels" type="geojson" data={data}>
                    <Layer
                        id="parcel-fill"
                        type="fill"
                        paint={{
                            'fill-color': [
                                'case',
                                ['boolean', ['get', 'done'], false], '#16a34a',
                                ['boolean', ['get', 'selected'], false], '#2563eb',
                                '#94a3b8',
                            ],
                            'fill-opacity': 0.4,
                        }}
                    />
                    <Layer
                        id="parcel-line"
                        type="line"
                        paint={{
                            'line-color': [
                                'case',
                                ['boolean', ['get', 'selected'], false], '#1d4ed8',
                                '#475569',
                            ],
                            'line-width': 1.5,
                        }}
                    />
                </Source>
            </Map>
        </div>
    );
}

export default MapCanvas;
