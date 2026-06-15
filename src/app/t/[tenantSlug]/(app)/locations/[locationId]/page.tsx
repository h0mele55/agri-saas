'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Geometry, Polygon } from 'geojson';
import { EntityDetailLayout } from '@/components/layout/EntityDetailLayout';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/typography';
import { Modal } from '@/components/ui/modal';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { apiPost, apiPatch } from '@/lib/api-client';
import { SpatialImportModal } from '@/components/ui/map/SpatialImportModal';
import { PrescriptionPanel } from '@/components/ui/map/PrescriptionPanel';
import { FieldOperationPanel } from '@/components/ui/map/FieldOperationPanel';
import type { MapParcel, MapMode } from '@/components/ui/map/MapCanvas';

const MapCanvas = dynamic(() => import('@/components/ui/map/MapCanvas').then((m) => m.MapCanvas), { ssr: false });

type Tab = 'overview' | 'map' | 'parcels' | 'operations';

interface LocationDetail {
    id: string;
    name: string;
    description?: string | null;
    status: string;
    spatialFormat?: string | null;
    _count?: { parcels?: number };
}
interface ParcelsResp {
    locationId: string;
    bounds: [number, number, number, number] | null;
    parcels: Array<{ id: string; name: string; areaHa?: number | null; cropType?: string | null; geometry: unknown }>;
}
interface OperationItem {
    id: string;
    key?: string | null;
    title: string;
    status: string;
    assignee?: { id: string; name?: string | null } | null;
    _count?: { operationParcels?: number };
}

export default function LocationDetailPage() {
    const { tenantSlug, locationId } = useParams<{ tenantSlug: string; locationId: string }>();
    const buildUrl = useTenantApiUrl();
    const [tab, setTab] = useState<Tab>('overview');
    const [selected, setSelected] = useState<string[]>([]);
    const [showImport, setShowImport] = useState(false);
    const [activeJob, setActiveJob] = useState<string | null>(null);
    const [mapMode, setMapMode] = useState<MapMode>('select');
    const [pendingGeometry, setPendingGeometry] = useState<Polygon | null>(null);
    const [newParcelName, setNewParcelName] = useState('');
    const [saving, setSaving] = useState(false);
    const [showNdvi, setShowNdvi] = useState(false);

    const locQ = useTenantSWR<LocationDetail>(`/locations/${locationId}`);
    const parcelsQ = useTenantSWR<ParcelsResp>(`/locations/${locationId}/parcels`);
    const opsQ = useTenantSWR<OperationItem[]>(tab === 'operations' ? `/locations/${locationId}/operations` : null);
    // NDVI tile source (Agro-intel) — fetched only when the Map tab is open.
    const ndviQ = useTenantSWR<{ configured: boolean; tileUrl: string }>(
        tab === 'map' ? '/agro/ndvi-config' : null,
    );
    const ndviConfigured = ndviQ.data?.configured ?? false;
    const ndviTileUrl = ndviQ.data?.tileUrl ?? '';

    const loc = locQ.data;
    const parcels = useMemo(() => parcelsQ.data?.parcels ?? [], [parcelsQ.data]);
    const bounds = parcelsQ.data?.bounds ?? null;
    const mapParcels = useMemo<MapParcel[]>(
        () => parcels.map((p) => ({ id: p.id, name: p.name, areaHa: p.areaHa ?? null, geometry: (p.geometry ?? null) as Geometry | null })),
        [parcels],
    );

    const saveDrawnParcel = async () => {
        if (!pendingGeometry || !newParcelName.trim()) return;
        setSaving(true);
        try {
            await apiPost(buildUrl(`/locations/${locationId}/parcels`), {
                name: newParcelName.trim(),
                geometry: pendingGeometry,
            });
            setPendingGeometry(null);
            setNewParcelName('');
            await parcelsQ.mutate();
            await locQ.mutate();
        } finally {
            setSaving(false);
        }
    };

    const reshapeParcel = async (parcelId: string, geometry: Polygon) => {
        await apiPatch(buildUrl(`/locations/${locationId}/parcels/${parcelId}`), { geometry });
        await parcelsQ.mutate();
    };

    const tabs = [
        { key: 'overview' as const, label: 'Overview' },
        { key: 'map' as const, label: 'Map' },
        { key: 'parcels' as const, label: 'Parcels', count: loc?._count?.parcels ?? parcels.length },
        { key: 'operations' as const, label: 'Operations' },
    ];

    const breadcrumbs: { label: string; href?: string }[] = [
        { label: 'Locations', href: `/t/${tenantSlug}/locations` },
        { label: loc?.name ?? 'Location' },
    ];

    return (
        <EntityDetailLayout<Tab>
            breadcrumbs={breadcrumbs}
            back={{ href: `/t/${tenantSlug}/locations`, label: 'Locations' }}
            title={loc?.name ?? 'Location'}
            loading={locQ.isLoading && !loc}
            error={locQ.error ? 'Failed to load location.' : null}
            actions={<Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>Import parcels</Button>}
            tabs={tabs}
            activeTab={tab}
            onTabChange={setTab}
        >
            {tab === 'overview' && (
                <div className="space-y-default">
                    <dl className="grid grid-cols-2 gap-default text-sm sm:grid-cols-3">
                        <div><dt className="text-content-secondary">Status</dt><dd className="font-medium">{loc?.status ?? '—'}</dd></div>
                        <div><dt className="text-content-secondary">Parcels</dt><dd className="font-medium">{loc?._count?.parcels ?? parcels.length}</dd></div>
                        <div><dt className="text-content-secondary">Spatial format</dt><dd className="font-medium">{loc?.spatialFormat ?? '—'}</dd></div>
                    </dl>
                    {loc?.description && <p className="text-sm">{loc.description}</p>}
                    {parcels.length === 0 && (
                        <div className="rounded-lg border border-border-subtle p-6 text-sm text-content-secondary">
                            No parcels yet — use “Import parcels” to upload a shapefile, KML, or GeoJSON.
                        </div>
                    )}
                </div>
            )}

            {tab === 'map' && (
                <div className="space-y-default">
                    <div className="flex flex-wrap items-center gap-compact">
                        <ToggleGroup
                            ariaLabel="Map mode"
                            options={[
                                { value: 'select', label: 'Select' },
                                { value: 'draw', label: 'Draw' },
                                { value: 'edit', label: 'Edit' },
                            ]}
                            selected={mapMode}
                            selectAction={(v) => { setMapMode(v as MapMode); setSelected([]); }}
                        />
                        <span className="text-xs text-content-subtle">
                            {mapMode === 'draw'
                                ? 'Click to add vertices; double-click to finish the parcel.'
                                : mapMode === 'edit'
                                  ? 'Drag a vertex to reshape; changes save automatically.'
                                  : 'Click parcels to select them for a spray job.'}
                        </span>
                        <div className="ml-auto flex items-center gap-compact">
                            <Button
                                variant={showNdvi && ndviConfigured ? 'primary' : 'secondary'}
                                size="sm"
                                onClick={() => setShowNdvi((v) => !v)}
                                disabled={!ndviConfigured}
                                aria-pressed={showNdvi && ndviConfigured}
                            >
                                NDVI
                            </Button>
                            {!ndviConfigured && (
                                <span className="text-xs text-content-subtle">
                                    Configure an NDVI tile source to enable the overlay.
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-section lg:grid-cols-[1fr_320px]">
                        <MapCanvas
                            parcels={mapParcels}
                            bounds={bounds}
                            selectedIds={selected}
                            onSelectionChange={setSelected}
                            mode={mapMode}
                            onCreateGeometry={(g) => setPendingGeometry(g)}
                            onUpdateGeometry={reshapeParcel}
                            showNdvi={showNdvi && ndviConfigured}
                            ndviTileUrl={ndviTileUrl}
                        />
                        {mapMode === 'select' ? (
                            <div className="rounded-lg border border-border-subtle p-4">
                                <Heading level={3} className="mb-3">New spray job</Heading>
                                <PrescriptionPanel
                                    locationId={locationId}
                                    tenantSlug={tenantSlug}
                                    selectedParcelIds={selected}
                                    onCreated={() => { setSelected([]); setTab('operations'); }}
                                />
                            </div>
                        ) : (
                            <div className="rounded-lg border border-border-subtle p-4 text-sm text-content-secondary">
                                {mapMode === 'draw'
                                    ? 'Draw a polygon on the map. You’ll name it before it’s saved.'
                                    : 'Reshape parcels by dragging their vertices. Switch to Select to plan a spray job.'}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {tab === 'parcels' && (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border-subtle text-left text-content-secondary">
                            <th className="py-2 pr-4 font-medium">Name</th>
                            <th className="py-2 pr-4 font-medium">Crop</th>
                            <th className="py-2 pr-4 font-medium">Area (ha)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {parcels.map((p) => (
                            <tr key={p.id} className="border-b border-border-subtle">
                                <td className="py-2 pr-4 font-medium">{p.name}</td>
                                <td className="py-2 pr-4">{p.cropType ?? '—'}</td>
                                <td className="py-2 pr-4">{p.areaHa ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {tab === 'operations' && (
                <div className="space-y-section">
                    {(opsQ.data ?? []).length === 0 ? (
                        <div className="rounded-lg border border-border-subtle p-6 text-sm text-content-secondary">
                            No spray jobs yet. Select parcels on the Map tab to create one.
                        </div>
                    ) : (
                        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                            {(opsQ.data ?? []).map((op) => (
                                <li key={op.id}>
                                    <button
                                        type="button"
                                        onClick={() => setActiveJob(activeJob === op.id ? null : op.id)}
                                        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-bg-muted/50"
                                    >
                                        <span className="text-sm font-medium">{op.key ? `${op.key} · ` : ''}{op.title}</span>
                                        <span className="text-xs text-content-secondary">{op.status} · {op._count?.operationParcels ?? 0} parcels</span>
                                    </button>
                                    {activeJob === op.id && (
                                        <div className="border-t border-border-subtle p-4">
                                            <FieldOperationPanel taskId={op.id} />
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <SpatialImportModal
                locationId={locationId}
                open={showImport}
                setOpen={setShowImport}
                onImported={() => { locQ.mutate(); parcelsQ.mutate(); }}
            />

            <Modal
                showModal={!!pendingGeometry}
                setShowModal={(v) => { if (!v) { setPendingGeometry(null); setNewParcelName(''); } }}
                size="sm"
                title="Name parcel"
                description="Name the parcel you just drew."
            >
                <Modal.Header title="Name parcel" description="Give the drawn parcel a name to save it." />
                <Modal.Form id="name-parcel-form" onSubmit={(e) => { e.preventDefault(); void saveDrawnParcel(); }}>
                    <Modal.Body>
                        <FormField label="Name" required>
                            <Input value={newParcelName} onChange={(e) => setNewParcelName(e.target.value)} placeholder="e.g. North 40" />
                        </FormField>
                    </Modal.Body>
                    <Modal.Actions>
                        <Button variant="secondary" size="sm" type="button" onClick={() => { setPendingGeometry(null); setNewParcelName(''); }}>Cancel</Button>
                        <Button variant="primary" size="sm" type="submit" loading={saving} disabled={!newParcelName.trim() || saving}>Create parcel</Button>
                    </Modal.Actions>
                </Modal.Form>
            </Modal>
        </EntityDetailLayout>
    );
}
