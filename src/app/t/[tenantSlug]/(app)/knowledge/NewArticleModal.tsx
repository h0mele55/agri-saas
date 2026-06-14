'use client';

/**
 * NewArticleModal — create a Knowledge Base article.
 *
 * Mirrors NewPolicyModal (the Knowledge feature is the policy
 * feature's twin): a `<Modal.Form>` shell with the canonical
 * unsaved-changes discard guard (synchronous `window.confirm` on
 * close so a mis-click can't drop a typed draft). The content editor
 * is the shared TipTap `<RichTextEditor>`, lazy-loaded via
 * `next/dynamic` so its ~200KB chunk only lands when the modal opens.
 *
 * The modal owns its own open state and renders the caller-supplied
 * `trigger` element (cloned with an onClick). POSTs `/knowledge`
 * (201 → `{ id, slug, title }`) and reports the new article via
 * `onCreated` so the list page can navigate to it.
 */

import {
    cloneElement,
    isValidElement,
    useCallback,
    useState,
    type Dispatch,
    type ReactElement,
    type SetStateAction,
} from 'react';
import dynamic from 'next/dynamic';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { apiPost } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SkeletonCard } from '@/components/ui/skeleton';
import type { RichTextContentType } from '@/components/ui/RichTextEditor';

const RichTextEditor = dynamic(
    () => import('@/components/ui/RichTextEditor').then((m) => m.RichTextEditor),
    { ssr: false, loading: () => <SkeletonCard lines={4} /> },
);

interface CreatedArticle {
    id: string;
    slug: string;
    title: string;
}

export interface NewArticleModalProps {
    /** Clickable element that opens the modal (cloned with onClick). */
    trigger: ReactElement;
    /** Called with the created article so the caller can navigate. */
    onCreated?: (article: CreatedArticle) => void;
}

export function NewArticleModal({ trigger, onCreated }: NewArticleModalProps) {
    const buildUrl = useTenantApiUrl();
    const [open, setOpen] = useState(false);

    // ── Form state ──
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('');
    const [summary, setSummary] = useState('');
    const [content, setContent] = useState('');
    const [contentType, setContentType] = useState<RichTextContentType>('HTML');
    const [dirty, setDirty] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const markDirty = () => setDirty(true);

    const reset = () => {
        setTitle('');
        setCategory('');
        setSummary('');
        setContent('');
        setContentType('HTML');
        setDirty(false);
        setError(null);
    };

    const canSubmit = title.trim().length > 0 && !submitting;

    const submit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const body: Record<string, unknown> = {
                title: title.trim(),
                summary: summary.trim() || null,
                category: category.trim() || null,
                contentType,
                content: content.trim() || null,
            };
            const created = await apiPost<CreatedArticle>(
                buildUrl('/knowledge'),
                body,
            );
            setDirty(false);
            setOpen(false);
            reset();
            onCreated?.(created);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Failed to create article',
            );
        } finally {
            setSubmitting(false);
        }
    };

    // Unsaved-changes guard — same synchronous-close shape as
    // NewPolicyModal / JournalEntryModal.
    const guardedSetOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
        (next) => {
            const wantClose =
                typeof next === 'function' ? !next(true) : next === false;
            if (wantClose) {
                if (submitting) return;
                if (
                    dirty &&
                    !window.confirm(
                        'Discard article? Any details you entered will be lost.',
                    )
                ) {
                    return;
                }
            }
            setOpen(next);
        },
        [submitting, dirty],
    );
    const close = () => guardedSetOpen(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void submit();
    };

    const triggerEl = isValidElement(trigger)
        ? cloneElement(trigger as ReactElement<{ onClick?: () => void }>, {
              onClick: () => setOpen(true),
          })
        : trigger;

    return (
        <>
            {triggerEl}
            <Modal
                showModal={open}
                setShowModal={guardedSetOpen}
                size="lg"
                title="New article"
                description="Capture operating knowledge your team can reference and acknowledge."
                preventDefaultClose={submitting}
            >
                <Modal.Header
                    title="New article"
                    description="Capture operating knowledge your team can reference and acknowledge."
                />
                <Modal.Form id="new-article-form" onSubmit={handleSubmit}>
                    <Modal.Body>
                        {error && (
                            <div
                                className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                                id="new-article-error"
                                role="alert"
                            >
                                {error}
                            </div>
                        )}
                        <fieldset
                            disabled={submitting}
                            className="m-0 p-0 border-0 space-y-default"
                        >
                            <FormField label="Title" required>
                                <Input
                                    value={title}
                                    onChange={(e) => {
                                        setTitle(e.target.value);
                                        markDirty();
                                    }}
                                    placeholder="e.g. Tractor pre-start inspection SOP"
                                    id="article-title-input"
                                />
                            </FormField>

                            <FormField label="Category">
                                <Input
                                    value={category}
                                    onChange={(e) => {
                                        setCategory(e.target.value);
                                        markDirty();
                                    }}
                                    placeholder="e.g. Equipment, Safety, Compliance"
                                    id="article-category-input"
                                />
                            </FormField>

                            <FormField
                                label="Summary"
                                hint="A one-line description shown in the article list."
                            >
                                <Input
                                    value={summary}
                                    onChange={(e) => {
                                        setSummary(e.target.value);
                                        markDirty();
                                    }}
                                    placeholder="What does this article cover?"
                                    id="article-summary-input"
                                />
                            </FormField>

                            <FormField label="Content">
                                <RichTextEditor
                                    id="article-content-editor"
                                    value={content}
                                    contentType={contentType}
                                    placeholder="Write the article content…"
                                    onChange={(value, nextType) => {
                                        setContent(value);
                                        setContentType(nextType);
                                        markDirty();
                                    }}
                                    minHeightPx={200}
                                />
                            </FormField>
                        </fieldset>
                    </Modal.Body>
                    <Modal.Actions>
                        <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            onClick={close}
                            disabled={submitting}
                            id="new-article-cancel-btn"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            disabled={!canSubmit}
                            loading={submitting}
                            id="create-article-btn"
                        >
                            Create article
                        </Button>
                    </Modal.Actions>
                </Modal.Form>
            </Modal>
        </>
    );
}
