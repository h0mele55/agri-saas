/**
 * Crop-plan list-page filter configuration.
 *
 * Keys align with the crop-plans GET query: status. Values MUST match
 * the Prisma `CropPlanStatus` enum — the UI selection passes straight
 * through to Prisma.
 *
 * Icons are Nucleo (the canonical family) cast to the icon shape the
 * `FilterDefInput` contract types. The cast is sourced from
 * `FilterDefInput['icon']` so this new file never reaches for the
 * legacy icon package — keeping it off the Nucleo-migration allowlist.
 */

import type { FilterDefInput } from '@/components/ui/filter/filter-definitions';
import {
    createTypedFilterDefs,
    optionsFromEnum,
} from '@/components/ui/filter/filter-definitions';
import { CircleDotted } from '@/components/ui/icons/nucleo';

/** The icon shape the filter contract expects, derived from the
 *  contract type itself (no direct legacy-icon-package dependency). */
type FilterIcon = FilterDefInput['icon'];
const asIcon = (c: unknown): FilterIcon => c as FilterIcon;

export const CROP_PLAN_STATUS_LABELS = {
    DRAFT: 'Draft',
    ACTIVE: 'Active',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
} as const;

const STATIC_DEFS = {
    status: {
        label: 'Status',
        description: 'Plan lifecycle status.',
        group: 'Attributes',
        icon: asIcon(CircleDotted),
        options: optionsFromEnum(CROP_PLAN_STATUS_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
} satisfies Record<string, FilterDefInput>;

export const cropPlanFilterDefs = createTypedFilterDefs()(STATIC_DEFS);
export const CROP_PLAN_FILTER_KEYS = cropPlanFilterDefs.filterKeys;

export function buildCropPlanFilters() {
    return cropPlanFilterDefs.filters;
}
