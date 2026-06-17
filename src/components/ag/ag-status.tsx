'use client';

/**
 * Shared ag-domain status → StatusBadge treatment.
 *
 * Before this module each ag list/detail page hand-rolled its own
 * `status → StatusBadgeVariant` record (CropPlansClient, SeasonsClient,
 * BinsClient, ContractsClient, PlantingBoard, OfflineFieldPanel,
 * FieldOperationPanel …). The colour a given status showed therefore
 * lived in N places and could drift. This is the single source of
 * truth: one canonical map per ag entity, plus a resolver and a tiny
 * `<AgStatusBadge>` component.
 *
 * Two layers, on purpose:
 *
 *   • `AG_STATUS_VARIANTS` / `AG_STATUS_LABELS` + `agStatusVariant()` /
 *     `agStatusLabel()` are pure data + pure functions — no React, no
 *     next-intl. Unit-testable and importable from anywhere (including
 *     server code). The default English label here is the fallback.
 *
 *   • `<AgStatusBadge>` is the client component. It resolves the
 *     variant from the pure map, then upgrades the LABEL via
 *     `useTranslations('ag')` (`ag.status.<entity>.<STATUS>`) when a key
 *     exists, falling back to the English label and finally the raw
 *     status string. It never crashes on an unknown status — unknown ⇒
 *     `neutral` + the raw string.
 *
 * DRY rule: do not re-introduce a per-page `Record<string,
 * StatusBadgeVariant>` for any entity covered here. Add the entity to
 * the maps below instead.
 */

import { useTranslations } from 'next-intl';
import {
    StatusBadge,
    type StatusBadgeVariant,
} from '@/components/ui/status-badge';

/**
 * The ag entities whose status/kind/type enums have a canonical badge
 * treatment. Keep this union in sync with the keys of
 * `AG_STATUS_VARIANTS`.
 */
export type AgStatusEntity =
    | 'cropPlan'
    | 'season'
    | 'planting'
    | 'operationParcel'
    | 'bin'
    | 'contract'
    | 'contractType';

type VariantMap = Readonly<Record<string, StatusBadgeVariant>>;
type LabelMap = Readonly<Record<string, string>>;

/**
 * Canonical status → badge variant per ag entity. These values are the
 * EXACT variants the individual pages used before consolidation — this
 * is a DRY move, not a recolour.
 *
 * Annotated `Record<AgStatusEntity, VariantMap>` (not `satisfies …`) on
 * purpose: the resolver indexes `AG_STATUS_VARIANTS[entity][status]`
 * with a `string` status, so each entity's value must be a
 * string-indexable `Record`. A bare `satisfies` would keep literal-key
 * types and make `[status: string]` a TS7053 implicit-any.
 */
export const AG_STATUS_VARIANTS: Record<AgStatusEntity, VariantMap> = {
    // planning/CropPlansClient.tsx
    cropPlan: {
        DRAFT: 'neutral',
        ACTIVE: 'info',
        COMPLETED: 'success',
        CANCELLED: 'warning',
    },
    // planning/seasons/SeasonsClient.tsx
    season: {
        PLANNING: 'neutral',
        ACTIVE: 'info',
        CLOSED: 'success',
    },
    // planning/[cropPlanId]/PlantingBoard.tsx
    planting: {
        PLANNED: 'neutral',
        SOWN: 'info',
        TRANSPLANTED: 'info',
        HARVESTING: 'warning',
        HARVESTED: 'success',
        TERMINATED: 'neutral',
    },
    // offline/OfflineFieldPanel.tsx + ui/map/FieldOperationPanel.tsx
    // (DONE → success, everything else neutral was the prior treatment).
    operationParcel: {
        PENDING: 'neutral',
        DONE: 'success',
        SKIPPED: 'neutral',
    },
    // grain/bins/BinsClient.tsx (the `kind` column)
    bin: {
        BIN: 'info',
        STORAGE: 'neutral',
    },
    // grain/contracts/ContractsClient.tsx (status)
    contract: {
        DRAFT: 'neutral',
        ACTIVE: 'info',
        DELIVERED: 'success',
        SETTLED: 'success',
        CANCELLED: 'warning',
    },
    // grain/contracts/ContractsClient.tsx (type)
    contractType: {
        SALE: 'info',
        PURCHASE: 'neutral',
    },
};

/**
 * Default English labels per ag entity status. These mirror the
 * existing `*_STATUS_LABELS` / `*_LABELS` records the pages already
 * used, and act as the fallback when an `ag.status.*` i18n key is
 * absent. The bin/operationParcel labels were previously the raw enum
 * value or a small inline map; we title-case them here so the shared
 * component reads cleanly everywhere.
 *
 * Annotated `Record<AgStatusEntity, LabelMap>` for the same
 * string-index reason as `AG_STATUS_VARIANTS` above.
 */
export const AG_STATUS_LABELS: Record<AgStatusEntity, LabelMap> = {
    cropPlan: {
        DRAFT: 'Draft',
        ACTIVE: 'Active',
        COMPLETED: 'Completed',
        CANCELLED: 'Cancelled',
    },
    season: {
        PLANNING: 'Planning',
        ACTIVE: 'Active',
        CLOSED: 'Closed',
    },
    planting: {
        PLANNED: 'Planned',
        SOWN: 'Sown',
        TRANSPLANTED: 'Transplanted',
        HARVESTING: 'Harvesting',
        HARVESTED: 'Harvested',
        TERMINATED: 'Terminated',
    },
    operationParcel: {
        PENDING: 'Pending',
        DONE: 'Done',
        SKIPPED: 'Skipped',
    },
    bin: {
        BIN: 'Bin',
        STORAGE: 'Storage',
    },
    contract: {
        DRAFT: 'Draft',
        ACTIVE: 'Active',
        DELIVERED: 'Delivered',
        SETTLED: 'Settled',
        CANCELLED: 'Cancelled',
    },
    contractType: {
        SALE: 'Sale',
        PURCHASE: 'Purchase',
    },
};

/**
 * Resolve the badge variant for an ag entity status. Unknown status ⇒
 * `neutral` (a sensible, quiet fallback — never throws).
 */
export function agStatusVariant(
    entity: AgStatusEntity,
    status: string | null | undefined,
): StatusBadgeVariant {
    if (!status) return 'neutral';
    return AG_STATUS_VARIANTS[entity][status] ?? 'neutral';
}

/**
 * Resolve the default (English) human label for an ag entity status.
 * Falls back to the raw status string when the value is unknown, so a
 * new enum member renders its code rather than blanking out.
 */
export function agStatusLabel(
    entity: AgStatusEntity,
    status: string | null | undefined,
): string {
    if (!status) return '';
    return AG_STATUS_LABELS[entity][status] ?? status;
}

export interface AgStatusBadgeProps {
    /** Which ag entity's status vocabulary to resolve against. */
    entity: AgStatusEntity;
    /** The raw enum value (e.g. `'ACTIVE'`). Null/empty renders nothing. */
    status: string | null | undefined;
    size?: 'sm' | 'md';
    className?: string;
}

/**
 * Render an ag status as an icon + text `<StatusBadge>` (never
 * colour-only — `StatusBadge` always supplies a tone icon).
 *
 * Label resolution order:
 *   1. `ag.status.<entity>.<STATUS>` via next-intl, when the key exists.
 *   2. The default English label from `AG_STATUS_LABELS`.
 *   3. The raw status string (last-ditch, so it never blanks).
 */
export function AgStatusBadge({
    entity,
    status,
    size = 'sm',
    className,
}: AgStatusBadgeProps) {
    const t = useTranslations('ag');

    if (!status) return null;

    const variant = agStatusVariant(entity, status);

    // i18n key first; fall back to the English label, then the raw code.
    const i18nKey = `status.${entity}.${status}`;
    const label = t.has(i18nKey) ? t(i18nKey) : agStatusLabel(entity, status);

    return (
        <StatusBadge variant={variant} size={size} className={className}>
            {label}
        </StatusBadge>
    );
}
