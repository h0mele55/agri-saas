/**
 * B6 — Unit tests for `useZodForm`.
 *
 * Pure-behaviour tests via `renderHook`. The hook is presentation-
 * layer plumbing — no fetch, no router, just state + Zod
 * validation.
 */
import { act, renderHook } from '@testing-library/react';
import { z } from 'zod';
import { useZodForm } from '@/lib/hooks/use-zod-form';

const Schema = z.object({
    name: z.string().min(1, 'Name is required'),
    age: z.number().int().min(18, 'Must be 18 or older'),
});

const initial = { name: '', age: 16 };

describe('useZodForm', () => {
    it('starts undirty + non-submittable + empty errors', () => {
        const onSubmit = jest.fn();
        const { result } = renderHook(() =>
            useZodForm({ schema: Schema, initial, onSubmit }),
        );
        expect(result.current.isDirty).toBe(false);
        expect(result.current.canSubmit).toBe(false); // age < 18
        // Pre-touch errors are hidden.
        expect(result.current.fieldError('name')).toBeUndefined();
        expect(result.current.fieldError('age')).toBeUndefined();
    });

    it('setField updates the value AND marks the form dirty', () => {
        const onSubmit = jest.fn();
        const { result } = renderHook(() =>
            useZodForm({ schema: Schema, initial, onSubmit }),
        );
        act(() => {
            result.current.setField('name', 'Ada');
        });
        expect(result.current.values.name).toBe('Ada');
        expect(result.current.isDirty).toBe(true);
    });

    it('touchField surfaces a field error', () => {
        const onSubmit = jest.fn();
        const { result } = renderHook(() =>
            useZodForm({ schema: Schema, initial, onSubmit }),
        );
        act(() => result.current.touchField('age'));
        expect(result.current.fieldError('age')).toBe('Must be 18 or older');
    });

    it('canSubmit flips to true once every field validates', () => {
        const onSubmit = jest.fn();
        const { result } = renderHook(() =>
            useZodForm({ schema: Schema, initial, onSubmit }),
        );
        act(() => {
            result.current.setField('name', 'Ada');
            result.current.setField('age', 21);
        });
        expect(result.current.canSubmit).toBe(true);
    });

    it('submit calls onSubmit with the typed payload', async () => {
        const onSubmit = jest.fn().mockResolvedValue({ ok: true });
        const { result } = renderHook(() =>
            useZodForm({ schema: Schema, initial, onSubmit }),
        );
        act(() => {
            result.current.setField('name', 'Ada');
            result.current.setField('age', 21);
        });
        await act(async () => {
            await result.current.submit();
        });
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada', age: 21 });
    });

    it('submit is a no-op when validation fails + surfaces every field error', async () => {
        const onSubmit = jest.fn();
        const { result } = renderHook(() =>
            useZodForm({ schema: Schema, initial, onSubmit }),
        );
        await act(async () => {
            await result.current.submit();
        });
        expect(onSubmit).not.toHaveBeenCalled();
        // Submit touched everything so fieldError returns now.
        expect(result.current.fieldError('name')).toBe('Name is required');
        expect(result.current.fieldError('age')).toBe('Must be 18 or older');
    });

    it('reset restores the initial values + clears dirty', () => {
        const onSubmit = jest.fn();
        const { result } = renderHook(() =>
            useZodForm({ schema: Schema, initial, onSubmit }),
        );
        act(() => {
            result.current.setField('name', 'Ada');
        });
        expect(result.current.isDirty).toBe(true);
        act(() => result.current.reset());
        expect(result.current.values).toEqual(initial);
        expect(result.current.isDirty).toBe(false);
    });

    it('surfaces submit errors on `error` + rethrows', async () => {
        const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() =>
            useZodForm({ schema: Schema, initial, onSubmit }),
        );
        act(() => {
            result.current.setField('name', 'Ada');
            result.current.setField('age', 21);
        });
        await act(async () => {
            await expect(result.current.submit()).rejects.toThrow('boom');
        });
        expect(result.current.error).toBe('boom');
    });
});
