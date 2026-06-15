'use client';

import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { Heading, TextLink } from '@/components/ui/typography';
import type { AgDashboardLowStockItem } from '@/app-layer/usecases/ag-dashboard';

interface LowStockCardProps {
    /** Tenant-scoped href to the inventory list page (`/t/{slug}/inventory`). */
    href: string;
    items: AgDashboardLowStockItem[];
}

/**
 * Low-stock inventory lots — items whose on-hand quantity has fallen below
 * their reorder level (the `lowStock` flag computed by `listLots`). Mirrors
 * RecentActivityCard's chassis; reads the read-model from <AgDashboardStrip>.
 */
export default function LowStockCard({ href, items }: LowStockCardProps) {
    return (
        <Card>
            <div className="flex items-baseline justify-between mb-3 gap-tight">
                <Heading level={3} id="low-stock-heading">
                    Low Stock
                </Heading>
                <TextLink href={href} tone="muted" className="text-xs">
                    View all
                </TextLink>
            </div>
            <div
                className="space-y-tight max-h-40 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
                tabIndex={0}
                role="region"
                aria-labelledby="low-stock-heading"
            >
                {items.map((lot) => (
                    <Link
                        key={lot.id}
                        href={href}
                        className="flex items-baseline justify-between gap-tight text-xs rounded px-1 -mx-1 py-0.5 hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                        <span className="text-content-default font-medium truncate">{lot.name}</span>
                        <span className="text-content-warning whitespace-nowrap tabular-nums">
                            {lot.quantityOnHand} {lot.unitSymbol}
                        </span>
                    </Link>
                ))}
                {items.length === 0 && (
                    <p className="text-content-subtle text-xs">Nothing low on stock</p>
                )}
            </div>
        </Card>
    );
}
