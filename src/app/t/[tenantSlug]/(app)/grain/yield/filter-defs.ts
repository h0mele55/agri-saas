/**
 * Grain yield-records list page filter configuration (Epic 53).
 *
 * Declarative filter defs for the Yield list toolbar. Keys map 1:1 onto
 * the API query parameters accepted by
 * `GET /api/t/:slug/grain/yield-records`:
 *
 *   q          → free-text search (search slot; filtered in-memory on the
 *                loaded rows since the API has no q param)
 *   seasonId   → Season id (options derived client-side from loaded rows)
 *   locationId → Location id (options derived client-side from loaded rows)
 *
 * Season / location options default to `null` (async-loading) and are
 * patched in at render time from the loaded yield rows, which carry the
 * `season` / `location` relations — no extra API call needed.
 */

import type {
    FilterDef,
    FilterDefInput,
} from '@/components/ui/filter/filter-definitions';
import { createTypedFilterDefs } from '@/components/ui/filter/filter-definitions';
import type { FilterOption } from '@/components/ui/filter/types';
// Nucleo icons cast to the contract's icon shape — keeps this file off
// the lucide allowlist (same precedent as `planning/filter-defs.ts`).
import { CalendarDays, LocationPin } from '@/components/ui/icons/nucleo';

/** The icon shape the filter contract expects, derived from the contract
 *  type itself (no direct legacy-icon-package dependency). */
type FilterIcon = FilterDefInput['icon'];
const asIcon = (c: unknown): FilterIcon => c as FilterIcon;

// ─── Static filter definitions ───────────────────────────────────────

const STATIC_DEFS = {
    seasonId: {
        label: 'Season',
        labelPlural: 'Seasons',
        description: 'Planning season the harvest belongs to.',
        group: 'Attributes',
        icon: asIcon(CalendarDays),
        options: null, // filled in at render time from loaded rows
        multiple: true,
        resetBehavior: 'clearable',
    },
    locationId: {
        label: 'Field',
        labelPlural: 'Fields',
        description: 'Field / location the harvest came from.',
        group: 'Attributes',
        icon: asIcon(LocationPin),
        options: null, // filled in at render time from loaded rows
        multiple: true,
        resetBehavior: 'clearable',
    },
} satisfies Record<string, FilterDefInput>;

// ─── Public API ──────────────────────────────────────────────────────

export const yieldFilterDefs = createTypedFilterDefs()(STATIC_DEFS);

/** URL param keys managed by the Yield filter set. `q` is the separate
 * search slot owned by `useFilterContext`. */
export const YIELD_FILTER_KEYS = yieldFilterDefs.filterKeys;

// ─── Runtime option builders ─────────────────────────────────────────

interface YieldLike {
    season?: { id: string; name: string } | null;
    location?: { id: string; name: string } | null;
}

function dedupeOptions(
    rows: ReadonlyArray<{ id: string; name: string } | null | undefined>,
): FilterOption[] {
    const seen = new Map<string, FilterOption>();
    for (const r of rows) {
        if (!r?.id) continue;
        if (seen.has(r.id)) continue;
        seen.set(r.id, { value: r.id, label: r.name || 'Unnamed' });
    }
    return Array.from(seen.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
    );
}

/**
 * Produce the Filter[] array FilterToolbar consumes, with the season /
 * location `options` replaced by the runtime-derived lists from the
 * loaded yield records.
 */
export function buildYieldFilters(
    loaded: ReadonlyArray<YieldLike>,
): FilterDef[] {
    const seasonOpts = dedupeOptions(loaded.map((y) => y.season));
    const locationOpts = dedupeOptions(loaded.map((y) => y.location));
    return yieldFilterDefs.filters.map((f) => {
        if (f.key === 'seasonId') return { ...f, options: seasonOpts };
        if (f.key === 'locationId') return { ...f, options: locationOpts };
        return f;
    });
}
