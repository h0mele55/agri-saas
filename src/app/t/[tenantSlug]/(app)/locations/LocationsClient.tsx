'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { apiPost } from '@/lib/api-client';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

interface LocationItem {
    id: string;
    name: string;
    description?: string | null;
    status: string;
    _count?: { parcels?: number };
}

export function LocationsClient({ tenantSlug }: { tenantSlug: string }) {
    const buildUrl = useTenantApiUrl();
    const { data, mutate, isLoading } = useTenantSWR<LocationItem[]>('/locations');
    const [showNew, setShowNew] = useState(false);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await apiPost(buildUrl('/locations'), { name });
            setShowNew(false);
            setName('');
            await mutate();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create location');
        } finally {
            setBusy(false);
        }
    };

    const rows = data ?? [];

    return (
        <ListPageShell className="gap-section">
            <ListPageShell.Header>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold">Locations</h1>
                        <p className="text-sm text-content-secondary">Field blocks and their parcels.</p>
                    </div>
                    <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>New location</Button>
                </div>
            </ListPageShell.Header>
            <ListPageShell.Body>
                {isLoading && !data ? (
                    <div className="text-sm text-content-secondary">Loading…</div>
                ) : rows.length === 0 ? (
                    <div className="rounded-lg border border-border-default p-8 text-center text-sm text-content-secondary">
                        No locations yet. Create one, then import a parcel file.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border-default text-left text-content-secondary">
                                <th className="py-2 pr-4 font-medium">Name</th>
                                <th className="py-2 pr-4 font-medium">Status</th>
                                <th className="py-2 pr-4 font-medium">Parcels</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((loc) => (
                                <tr key={loc.id} className="border-b border-border-subtle hover:bg-bg-subtle">
                                    <td className="py-2 pr-4">
                                        <Link href={`/t/${tenantSlug}/locations/${loc.id}`} className="font-medium text-content-link hover:underline">
                                            {loc.name}
                                        </Link>
                                    </td>
                                    <td className="py-2 pr-4">{loc.status}</td>
                                    <td className="py-2 pr-4">{loc._count?.parcels ?? 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </ListPageShell.Body>

            <Modal showModal={showNew} setShowModal={setShowNew} size="md" title="New location" description="Create a field block.">
                <Modal.Header title="New location" description="Create a field block; import parcels next." />
                <Modal.Form id="new-location-form" onSubmit={create}>
                    <Modal.Body>
                        {error && (
                            <div role="alert" className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error">
                                {error}
                            </div>
                        )}
                        <FormField label="Name" required>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home Farm" />
                        </FormField>
                    </Modal.Body>
                    <Modal.Actions>
                        <Button variant="secondary" size="sm" type="button" onClick={() => setShowNew(false)}>Cancel</Button>
                        <Button variant="primary" size="sm" type="submit" loading={busy} disabled={!name || busy}>Create</Button>
                    </Modal.Actions>
                </Modal.Form>
            </Modal>
        </ListPageShell>
    );
}
