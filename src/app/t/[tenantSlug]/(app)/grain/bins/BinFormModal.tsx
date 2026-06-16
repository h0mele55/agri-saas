'use client';

/**
 * Create / edit a grain bin (a Location with kind BIN or STORAGE).
 *
 * Dual-purpose modal mounted inside the Bins list:
 *   - no `bin` prop  → POST  /grain/bins        (create)
 *   - `bin` provided → PATCH /grain/bins/{id}   (edit)
 *
 * Bins have no delete route — this modal is the only mutation surface
 * besides create. The `kind` field uses the shared `<RadioGroup>`
 * primitive (BIN vs STORAGE); `capacityTonnes` is captured as text and
 * coerced to `number | null` on the wire.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
    useEffect,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import type { BinRow } from './BinsClient';

const KIND_OPTIONS: ReadonlyArray<readonly [string, string]> = [
    ['BIN', 'Bin'],
    ['STORAGE', 'Storage'],
] as const;

const numericText = z
    .string()
    .optional()
    .refine(
        (v) => v == null || v.trim() === '' || Number(v) >= 0,
        'Must be zero or positive',
    );

const formSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    kind: z.enum(['BIN', 'STORAGE']),
    capacityTonnes: numericText,
    key: z.string().optional(),
    description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_VALUES: FormValues = {
    name: '',
    kind: 'BIN',
    capacityTonnes: '',
    key: '',
    description: '',
};

function textToNum(v: string | undefined): number | null {
    if (v == null || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

export interface BinFormModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    tenantSlug: string;
    /** When set, the modal edits this bin (PATCH); else it creates. */
    bin?: BinRow | null;
    onSaved?: () => void;
}

export function BinFormModal({
    open,
    setOpen,
    tenantSlug,
    bin,
    onSaved,
}: BinFormModalProps) {
    const apiUrl = useTenantApiUrl();
    const queryClient = useQueryClient();
    const isEdit = Boolean(bin);

    const {
        register,
        handleSubmit,
        control,
        reset,
        setError: setFormError,
        setFocus,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: DEFAULT_VALUES,
        mode: 'onTouched',
    });

    useEffect(() => {
        if (!open) return;
        if (bin) {
            reset({
                name: bin.name,
                kind: bin.kind,
                capacityTonnes:
                    bin.capacityTonnes == null ? '' : String(bin.capacityTonnes),
                key: bin.key ?? '',
                description: bin.description ?? '',
            });
        } else {
            reset(DEFAULT_VALUES);
        }
        const t = setTimeout(() => setFocus('name'), 60);
        return () => clearTimeout(t);
    }, [open, bin, reset, setFocus]);

    const onSubmit = async (values: FormValues) => {
        try {
            const body = {
                name: values.name.trim(),
                kind: values.kind,
                capacityTonnes: textToNum(values.capacityTonnes),
                key: values.key?.trim() || null,
                description: values.description?.trim() || null,
            };
            const res = await fetch(
                isEdit ? apiUrl(`/grain/bins/${bin!.id}`) : apiUrl('/grain/bins'),
                {
                    method: isEdit ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                },
            );
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const msg =
                    typeof data.error === 'string'
                        ? data.error
                        : data.message ||
                          `Failed to ${isEdit ? 'update' : 'create'} bin`;
                throw new Error(msg);
            }
            queryClient.invalidateQueries({ queryKey: ['grain-bins', tenantSlug] });
            setOpen(false);
            onSaved?.();
        } catch (err) {
            setFormError('root.api', {
                type: 'api',
                message:
                    err instanceof Error
                        ? err.message
                        : `Failed to ${isEdit ? 'update' : 'create'} bin`,
            });
        }
    };

    const apiError = errors.root?.api?.message;
    const heading = isEdit ? 'Edit bin' : 'New bin';
    const description = isEdit
        ? 'Update this grain storage bin.'
        : 'Add a bin or storage location that holds harvested produce.';

    return (
        <Modal
            showModal={open}
            setShowModal={setOpen}
            size="lg"
            title={heading}
            description={description}
            preventDefaultClose={isSubmitting}
        >
            <Modal.Header title={heading} description={description} />
            <Modal.Form onSubmit={handleSubmit(onSubmit)}>
                <Modal.Body>
                    {apiError && (
                        <div
                            className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            id="bin-form-error"
                            role="alert"
                        >
                            {apiError}
                        </div>
                    )}

                    <div className="space-y-default">
                        <FormField
                            label="Name"
                            required
                            error={errors.name?.message}
                        >
                            <Input
                                id="bin-name-input"
                                type="text"
                                placeholder="e.g. Silo 3"
                                autoComplete="off"
                                {...register('name')}
                            />
                        </FormField>

                        <FormField label="Kind" error={errors.kind?.message}>
                            <Controller
                                control={control}
                                name="kind"
                                render={({ field }) => (
                                    <RadioGroup
                                        value={field.value}
                                        onValueChange={(v) => field.onChange(v)}
                                        className="flex gap-default"
                                    >
                                        {KIND_OPTIONS.map(([value, labelText]) => (
                                            <label
                                                key={value}
                                                htmlFor={`bin-kind-${value}`}
                                                className="flex items-center gap-tight text-sm cursor-pointer text-content-default"
                                            >
                                                <RadioGroupItem
                                                    id={`bin-kind-${value}`}
                                                    value={value}
                                                    size="sm"
                                                />
                                                {labelText}
                                            </label>
                                        ))}
                                    </RadioGroup>
                                )}
                            />
                        </FormField>

                        <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                            <FormField
                                label="Capacity (t)"
                                error={errors.capacityTonnes?.message}
                            >
                                <Input
                                    id="bin-capacity-input"
                                    inputMode="decimal"
                                    placeholder="e.g. 1200"
                                    autoComplete="off"
                                    {...register('capacityTonnes')}
                                />
                            </FormField>
                            <FormField label="Key" error={errors.key?.message}>
                                <Input
                                    id="bin-key-input"
                                    type="text"
                                    placeholder="Optional short code"
                                    autoComplete="off"
                                    {...register('key')}
                                />
                            </FormField>
                        </div>

                        <FormField
                            label="Description"
                            error={errors.description?.message}
                        >
                            <Textarea
                                id="bin-description-input"
                                rows={2}
                                placeholder="Location, type, or handling notes"
                                {...register('description')}
                            />
                        </FormField>
                    </div>
                </Modal.Body>
                <Modal.Actions>
                    <Button
                        variant="secondary"
                        size="sm"
                        id="bin-cancel-btn"
                        onClick={() => {
                            if (!isSubmitting) setOpen(false);
                        }}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        id="save-bin-btn"
                        loading={isSubmitting}
                    >
                        {isEdit ? 'Save bin' : 'Create bin'}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
