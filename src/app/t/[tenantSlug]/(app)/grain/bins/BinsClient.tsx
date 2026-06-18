'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Plus } from '@/components/ui/icons/nucleo';
import { createColumns } from '@/components/ui/table';
import {
    FilterProvider,
    useFilterContext,
    useFilters,
} from '@/components/ui/filter';
import { EntityListPage } from '@/components/layout/EntityListPage';
import { EmptyState } from '@/components/ui/empty-state';
import { TableTitleCell } from '@/components/ui/table-title-cell';
import { AgStatusBadge } from '@/components/ag/ag-status';
import { ProgressBar } from '@/components/ui/progress-bar';
import { BinFormModal } from './BinFormModal';

// ─── Types ───
// BinDto — plain numbers (the usecase already coerces Decimals).
export interface BinRow {
    id: string;
    name: string;
    key: string | null;
    kind: 'BIN' | 'STORAGE';
    description: string | null;
    capacityTonnes: number | null;
    storedQuantity: number;
    lotCount: number;
    /** Ratio storedQuantity / capacity (0..1+), or null when no capacity. */
    fillPct: number | null;
}

interface BinsClientProps {
    initialBins: BinRow[];
    tenantSlug: string;
    permissions: { canWrite: boolean };
}

function fmtNum(v: number | null): string {
    if (v == null) return '—';
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function BinsClient(props: BinsClientProps) {
    // Bins have no faceted filters — the empty key set still gives the
    // FilterToolbar a context for its live search box.
    const filterCtx = useFilterContext([], [] as const, {});
    return (
        <FilterProvider value={filterCtx}>
            <BinsPageInner {...props} />
        </FilterProvider>
    );
}

function BinsPageInner({ initialBins, tenantSlug, permissions }: BinsClientProps) {
    const apiUrl = useCallback(
        (path: string) => `/api/t/${tenantSlug}${path}`,
        [tenantSlug],
    );

    const filterCtx = useFilters();
    const { search } = filterCtx;

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editing, setEditing] = useState<BinRow | null>(null);

    const binsQuery = useQuery<BinRow[]>({
        queryKey: ['grain-bins', tenantSlug, 'list'],
        queryFn: async () => {
            const res = await fetch(apiUrl('/grain/bins'));
            if (!res.ok) throw new Error('Failed to fetch bins');
            return res.json();
        },
        initialData: initialBins,
        // eslint-disable-next-line react-hooks/purity
        initialDataUpdatedAt: Date.now(),
        staleTime: 30_000,
    });

    // Stable ref so the search memo below doesn't recompute every render.
    const rawBins = useMemo(() => binsQuery.data ?? [], [binsQuery.data]);
    const loading = binsQuery.isLoading && !binsQuery.data;

    // Live free-text search (name / key) over loaded rows.
    const bins = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rawBins;
        // guardrail-ignore: in-memory text filter over the loaded page, not a DB query.
        return rawBins.filter(
            (b) =>
                b.name.toLowerCase().includes(q) ||
                (b.key ?? '').toLowerCase().includes(q),
        );
    }, [rawBins, search]);

    const openEdit = useCallback((bin: BinRow) => {
        setEditing(bin);
        setIsCreateOpen(true);
    }, []);

    const handleRowClick = useCallback(
        (row: Row<BinRow>) => {
            if (!permissions.canWrite) return;
            openEdit(row.original);
        },
        [permissions.canWrite, openEdit],
    );
    const getRowId = useCallback((b: BinRow) => b.id, []);

    const columns = useMemo(
        () =>
            createColumns<BinRow>([
                {
                    accessorKey: 'name',
                    header: 'Name',
                    cell: ({ row }) => (
                        <TableTitleCell id={`bin-link-${row.original.id}`}>
                            {row.original.name}
                        </TableTitleCell>
                    ),
                },
                {
                    accessorKey: 'kind',
                    header: 'Kind',
                    cell: ({ row }) => (
                        <AgStatusBadge entity="bin" status={row.original.kind} />
                    ),
                },
                {
                    id: 'capacityTonnes',
                    header: 'Capacity (t)',
                    accessorFn: (b) => b.capacityTonnes ?? -1,
                    cell: ({ row }) => (
                        <span className="text-xs text-content-default tabular-nums block text-right">
                            {fmtNum(row.original.capacityTonnes)}
                        </span>
                    ),
                },
                {
                    id: 'storedQuantity',
                    header: 'Stored (t)',
                    accessorFn: (b) => b.storedQuantity,
                    cell: ({ row }) => (
                        <span className="text-xs text-content-default tabular-nums block text-right">
                            {fmtNum(row.original.storedQuantity)}
                        </span>
                    ),
                },
                {
                    id: 'fillPct',
                    header: 'Fill',
                    accessorFn: (b) => b.fillPct ?? -1,
                    cell: ({ row }) => {
                        const ratio = row.original.fillPct;
                        if (ratio == null) {
                            return (
                                <span className="text-xs text-content-subtle">—</span>
                            );
                        }
                        const pct = Math.round(ratio * 100);
                        return (
                            <ProgressBar
                                value={pct}
                                variant={pct >= 100 ? 'warning' : 'success'}
                                size="sm"
                                showValue
                                className="w-24"
                                aria-label={`Bin fill ${pct}%`}
                            />
                        );
                    },
                },
                {
                    id: 'lotCount',
                    header: 'Lots',
                    accessorFn: (b) => b.lotCount,
                    cell: ({ row }) => (
                        <span className="text-xs text-content-muted tabular-nums">
                            {row.original.lotCount}
                        </span>
                    ),
                },
            ]),
        [],
    );

    return (
        <EntityListPage<BinRow>
            className="animate-fadeIn gap-section"
            header={{
                breadcrumbs: [
                    { label: 'Dashboard', href: `/t/${tenantSlug}/dashboard` },
                    { label: 'Bins' },
                ],
                title: 'Bins',
                description:
                    'Storage bins and silos holding harvested produce — capacity, fill, and lot counts.',
                actions: permissions.canWrite ? (
                    <Button
                        variant="primary"
                        icon={<Plus className="-ml-0.5 -mr-2.5" />}
                        id="new-bin-btn"
                        onClick={() => {
                            setEditing(null);
                            setIsCreateOpen(true);
                        }}
                    >
                        Bin
                    </Button>
                ) : null,
            }}
            filters={{
                defs: [],
                searchId: 'grain-bins-search',
                searchPlaceholder: 'Search bins…',
            }}
            table={{
                data: bins,
                columns,
                loading,
                getRowId,
                onRowClick: permissions.canWrite ? handleRowClick : undefined,
                emptyState: search ? (
                    <EmptyState
                        size="sm"
                        variant="no-results"
                        title="No bins match your search"
                        description="Try a different name or clear the search."
                    />
                ) : (
                    <EmptyState
                        size="sm"
                        variant="no-records"
                        title="No bins yet"
                        description="Add a bin or storage location to track stored produce against its capacity."
                        primaryAction={
                            permissions.canWrite
                                ? {
                                      label: 'Add bin',
                                      onClick: () => {
                                          setEditing(null);
                                          setIsCreateOpen(true);
                                      },
                                  }
                                : undefined
                        }
                    />
                ),
                resourceName: (p) => (p ? 'bins' : 'bin'),
                'data-testid': 'grain-bins-table',
                className: 'hover:bg-bg-muted',
            }}
        >
            {permissions.canWrite && (
                <BinFormModal
                    open={isCreateOpen}
                    setOpen={setIsCreateOpen}
                    tenantSlug={tenantSlug}
                    bin={editing}
                    onSaved={() => binsQuery.refetch()}
                />
            )}
        </EntityListPage>
    );
}
