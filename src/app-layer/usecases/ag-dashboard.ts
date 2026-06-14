import type { ModuleKey } from '@prisma/client';
import { RequestContext } from '../types';
import { assertCanRead } from '../policies/common';
import { listLogEntries } from './journal';
import { listLots } from './inventory';
import { listMyFarmTasks } from './farm-task';
import { getEnabledModules } from './modules';

/**
 * Agriculture dashboard strip — the small "your farm today" read-model
 * that sits ABOVE the GRC executive cards on the tenant dashboard.
 *
 * This is a THIN aggregation: it reuses the existing list usecases
 * (`listLogEntries` / `listLots` / `listMyFarmTasks`) verbatim — every
 * one of those already authorizes via `assertCanRead`, scopes queries to
 * the tenant via `runInTenantContext` + RLS, and bounds its underlying
 * `findMany` with `take`. We add one more `assertCanRead` here for
 * defence-in-depth at the aggregation boundary, then slice each list to
 * the dashboard cap (≤ 5) for a glanceable strip.
 *
 * `enabledModules` is returned so the client strip can gate each card to
 * the module that owns it (JOURNAL → journal card, INVENTORY → low-stock
 * card; the farm-tasks card is always shown because Tasks is not
 * module-gated). A pure-GRC tenant with neither ag module enabled gets
 * empty lists + a module list that hides the journal/low-stock cards,
 * so the strip renders nothing.
 */

/** How many rows each card shows — a glanceable strip, not a list page. */
const STRIP_LIMIT = 5;

export interface AgDashboardJournalItem {
    id: string;
    type: string;
    title: string;
    occurredAt: string | null;
}

export interface AgDashboardLowStockItem {
    id: string;
    name: string;
    quantityOnHand: number;
    unitSymbol: string;
}

export interface AgDashboardTaskItem {
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
}

export interface AgDashboardPayload {
    /** The tenant's enabled modules — drives client-side card gating. */
    enabledModules: ModuleKey[];
    recentJournal: AgDashboardJournalItem[];
    lowStock: AgDashboardLowStockItem[];
    myTasks: AgDashboardTaskItem[];
}

function toIso(d: Date | string | null | undefined): string | null {
    if (!d) return null;
    return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export async function getAgDashboard(ctx: RequestContext): Promise<AgDashboardPayload> {
    assertCanRead(ctx);

    const enabledModules = await getEnabledModules(ctx);
    const journalOn = enabledModules.includes('JOURNAL');
    const inventoryOn = enabledModules.includes('INVENTORY');

    // Fetch only what's enabled. Each underlying list is already bounded
    // (`take` in the repository) and authorizes independently; we run them
    // in parallel and slice to the strip cap below.
    const [journalEntries, lots, tasks] = await Promise.all([
        // LogEntry list — newest occurredAt first (repository orderBy).
        journalOn ? listLogEntries(ctx) : Promise.resolve([]),
        // Lots carry a computed `lowStock` boolean; we filter to those.
        // A take of 50 keeps the read bounded while leaving enough room to
        // surface the low-stock subset for the ≤5-row card.
        inventoryOn ? listLots(ctx, { take: 50 }) : Promise.resolve([]),
        // The caller's FARM_TASK + FIELD_OPERATION queue, soonest-due first.
        // Always fetched — Tasks is not module-gated.
        listMyFarmTasks(ctx),
    ]);

    const recentJournal: AgDashboardJournalItem[] = journalEntries
        .slice(0, STRIP_LIMIT)
        .map((e) => ({
            id: e.id,
            type: e.type,
            title: e.title,
            occurredAt: toIso(e.occurredAt),
        }));

    const lowStock: AgDashboardLowStockItem[] = lots
        .filter((l) => l.lowStock)
        .slice(0, STRIP_LIMIT)
        .map((l) => ({
            id: l.id,
            name: l.item.name,
            quantityOnHand: l.quantityOnHand,
            unitSymbol: l.unit.symbol,
        }));

    const myTasks: AgDashboardTaskItem[] = tasks
        .slice(0, STRIP_LIMIT)
        .map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            dueAt: toIso(t.dueAt),
        }));

    return { enabledModules, recentJournal, lowStock, myTasks };
}
