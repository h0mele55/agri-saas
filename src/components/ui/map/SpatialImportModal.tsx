'use client';

/**
 * SpatialImportModal — upload a parcel-boundary file (shapefile .zip /
 * KML / GeoJSON) into a Location. Posts multipart/form-data to the
 * spatial-import route; existing parcels are replaced.
 */
import { useState, type Dispatch, type SetStateAction } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';

export interface SpatialImportModalProps {
    locationId: string;
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    onImported?: (result: { parcelCount: number; format: string }) => void;
}

export function SpatialImportModal({ locationId, open, setOpen, onImported }: SpatialImportModalProps) {
    const buildUrl = useTenantApiUrl();
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError('Choose a file first.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(buildUrl(`/locations/${locationId}/spatial-import`), { method: 'POST', body: fd });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error?.message || body?.error || `Import failed (${res.status})`);
            }
            const result = await res.json();
            onImported?.(result);
            setOpen(false);
            setFile(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            showModal={open}
            setShowModal={setOpen}
            size="md"
            title="Import parcels"
            description="Upload a shapefile (.zip), KML, or GeoJSON. Existing parcels are replaced."
            preventDefaultClose={busy}
        >
            <Modal.Header title="Import parcels" description="Upload a shapefile (.zip), KML, or GeoJSON. Existing parcels are replaced." />
            <Modal.Form id="spatial-import-form" onSubmit={submit}>
                <Modal.Body>
                    {error && (
                        <div role="alert" className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error">
                            {error}
                        </div>
                    )}
                    <FormField label="Spatial file" required description="Accepted: .zip (shapefile), .kml/.kmz, .geojson/.json">
                        <input
                            type="file"
                            accept=".zip,.kml,.kmz,.geojson,.json"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            className="block w-full text-sm text-content-secondary file:mr-3 file:rounded-md file:border file:border-border-subtle file:bg-bg-subtle file:px-3 file:py-1.5 file:text-sm"
                        />
                    </FormField>
                </Modal.Body>
                <Modal.Actions>
                    <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button variant="primary" size="sm" type="submit" loading={busy} disabled={!file || busy}>
                        {busy ? 'Importing…' : 'Import'}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}

export default SpatialImportModal;
