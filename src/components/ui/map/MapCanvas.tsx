'use client';

/**
 * MapCanvas — renders a location's parcels as a MapLibre GeoJSON layer
 * and (optionally) lets the user click parcels to multi-select. Used by
 * the Location detail Map tab, the PrescriptionPanel, and the operator's
 * read-only field-operation view.
 *
 * Drawing/editing (Phase-1 fast-follow): when `mode` is 'draw' or 'edit'
 * a terra-draw (MIT) layer is mounted on the underlying MapLibre map via
 * its official adapter — 'draw' adds a polygon (→ onCreateGeometry),
 * 'edit' makes existing polygons' vertices draggable (→ onUpdateGeometry,
 * debounced). 'select' (default) keeps the original click-to-select
 * behaviour and never loads terra-draw, so the read-only/operator and
 * spray-prescription paths are untouched.
 *
 * MapLibre GL (BSD-3) + react-map-gl (MIT) + terra-draw (MIT). No API key
 * (public demo basemap). Geometry is GeoJSON in WGS84.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import Map, { Layer, Source, type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre';
import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson';

export interface MapParcel {
    id: string;
    name: string;
    areaHa?: number | null;
    geometry: Geometry | null;
}

export type MapMode = 'select' | 'draw' | 'edit';

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
    /** Authoring mode (default 'select'). 'draw'/'edit' load terra-draw. */
    mode?: MapMode;
    /** Fired when a new polygon is drawn (draw mode). */
    onCreateGeometry?: (geometry: Polygon) => void;
    /** Fired (debounced) when an existing parcel's polygon is reshaped. */
    onUpdateGeometry?: (parcelId: string, geometry: Polygon) => void;
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
    mode = 'select',
    onCreateGeometry,
    onUpdateGeometry,
    className,
}: MapCanvasProps) {
    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
    const done = useMemo(() => new Set(doneIds), [doneIds]);
    const mapRef = useRef<MapRef | null>(null);
    // terra-draw instance kept off-render; typed loosely to avoid leaking
    // the adapter's map generic across the component boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drawRef = useRef<any>(null);
    const drawing = mode === 'draw' || mode === 'edit';

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
        if (!interactive || !onSelectionChange || drawing) return;
        const feature = e.features?.[0];
        const id = feature?.properties?.id as string | undefined;
        if (!id) return;
        onSelectionChange(
            selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
        );
    }, [interactive, onSelectionChange, selected, selectedIds, drawing]);

    // ── terra-draw lifecycle (draw / edit modes only) ──────────────────
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!map || !drawing) return;

        let cancelled = false;
        let debounce: ReturnType<typeof setTimeout> | null = null;

        // Dynamic import keeps terra-draw out of the bundle for the
        // read-only/select paths and off the SSR graph entirely.
        (async () => {
            const [{ TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode }, { TerraDrawMapLibreGLAdapter }] =
                await Promise.all([import('terra-draw'), import('terra-draw-maplibre-gl-adapter')]);
            if (cancelled) return;

            const draw = new TerraDraw({
                adapter: new TerraDrawMapLibreGLAdapter({ map }),
                modes: [
                    new TerraDrawPolygonMode(),
                    new TerraDrawSelectMode({
                        flags: {
                            polygon: {
                                feature: {
                                    draggable: false,
                                    coordinates: { midpoints: true, draggable: true, deletable: true },
                                },
                            },
                        },
                    }),
                ],
            });
            draw.start();
            drawRef.current = draw;

            if (mode === 'draw') {
                draw.setMode('polygon');
                draw.on('finish', (id: string | number, context: { action: string }) => {
                    if (context.action !== 'draw') return;
                    const f = draw.getSnapshotFeature(id);
                    if (f && f.geometry.type === 'Polygon') {
                        onCreateGeometry?.(f.geometry as Polygon);
                        draw.clear();
                    }
                });
            } else {
                // edit — seed existing single-Polygon parcels as editable
                // features (MultiPolygon imports aren't vertex-editable here).
                const seed = parcels
                    .filter((p) => p.geometry?.type === 'Polygon')
                    .map((p) => ({
                        type: 'Feature' as const,
                        properties: { mode: 'polygon', parcelId: p.id },
                        geometry: p.geometry as Polygon,
                    }));
                if (seed.length) {
                    try {
                        draw.addFeatures(seed);
                    } catch {
                        /* a malformed stored geometry shouldn't break edit mode */
                    }
                }
                draw.setMode('select');
                draw.on('change', (ids: Array<string | number>) => {
                    if (debounce) clearTimeout(debounce);
                    debounce = setTimeout(() => {
                        for (const id of ids) {
                            const f = draw.getSnapshotFeature(id);
                            const parcelId = f?.properties?.parcelId as string | undefined;
                            if (parcelId && f?.geometry?.type === 'Polygon') {
                                onUpdateGeometry?.(parcelId, f.geometry as Polygon);
                            }
                        }
                    }, 700);
                });
            }
        })();

        return () => {
            cancelled = true;
            if (debounce) clearTimeout(debounce);
            try {
                drawRef.current?.stop();
            } catch {
                /* adapter already torn down */
            }
            drawRef.current = null;
        };
        // Re-init when the mode flips. Parcels are seeded once on entry to
        // edit mode (intentionally not a dep — re-seeding on every refresh
        // would fight the user's in-progress edit).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, drawing]);

    return (
        <div className={className ?? 'h-[480px] w-full overflow-hidden rounded-lg border border-border-subtle'}>
            <Map
                ref={mapRef}
                initialViewState={initialViewState}
                mapStyle={DEMO_STYLE}
                interactiveLayerIds={interactive && !drawing ? ['parcel-fill'] : []}
                onClick={handleClick}
                style={{ width: '100%', height: '100%' }}
                cursor={interactive && !drawing ? 'pointer' : 'grab'}
            >
                {/* Hide the static layer while editing so terra-draw owns
                    the on-map render of the editable polygons. */}
                {mode !== 'edit' && (
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
                )}
            </Map>
        </div>
    );
}

export default MapCanvas;
