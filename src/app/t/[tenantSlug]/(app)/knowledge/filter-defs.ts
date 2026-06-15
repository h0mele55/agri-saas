/**
 * Knowledge Base list page filter configuration.
 *
 * Mirrors `policies/filter-defs.ts` (the Knowledge feature is the
 * policy feature's twin — versioned articles with a publish lifecycle
 * + per-reader acknowledgements). Keys map onto the
 * `GET /api/t/{slug}/knowledge` query (q + status + category).
 *
 * The article status enum is narrower than the policy one:
 * `DRAFT | PUBLISHED | ARCHIVED` (no IN_REVIEW / APPROVED approval
 * stages — acknowledgement, not approval, is the readership gate).
 */

import type { FilterDefInput } from '@/components/ui/filter/filter-definitions';
import {
    createTypedFilterDefs,
    optionsFromEnum,
} from '@/components/ui/filter/filter-definitions';
import type { FilterOption } from '@/components/ui/filter/types';
import { CircleDot, Tag } from 'lucide-react';

// Canonical labels for the article status enum — single source of
// truth for the filter picker AND the row badge (mirrors
// POLICY_STATUS_LABELS).
export const KNOWLEDGE_STATUS_LABELS = {
    DRAFT: 'Draft',
    PUBLISHED: 'Published',
    ARCHIVED: 'Archived',
} as const;

const STATIC_DEFS = {
    status: {
        label: 'Status',
        description: 'Lifecycle stage of the article.',
        group: 'Attributes',
        icon: CircleDot,
        options: optionsFromEnum(KNOWLEDGE_STATUS_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    category: {
        label: 'Category',
        description: 'Knowledge domain / taxonomy bucket.',
        group: 'Attributes',
        icon: Tag,
        options: null, // derived from loaded rows
        multiple: true,
        resetBehavior: 'clearable',
    },
} satisfies Record<string, FilterDefInput>;

export const knowledgeFilterDefs = createTypedFilterDefs()(STATIC_DEFS);
export const KNOWLEDGE_FILTER_KEYS = knowledgeFilterDefs.filterKeys;

interface ArticleLike {
    category?: string | null;
}

export function categoryOptionsFromArticles(
    articles: ReadonlyArray<ArticleLike>,
): FilterOption[] {
    const seen = new Set<string>();
    for (const a of articles) {
        const c = a.category?.trim();
        if (c) seen.add(c);
    }
    return Array.from(seen)
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value }));
}

export function buildKnowledgeFilters(articles: ReadonlyArray<ArticleLike>) {
    const categoryOpts = categoryOptionsFromArticles(articles);
    return knowledgeFilterDefs.filters.map((f) =>
        f.key === 'category' ? { ...f, options: categoryOpts } : f,
    );
}
