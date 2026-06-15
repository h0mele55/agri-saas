import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import { listCropTypes, createCropType } from '@/app-layer/usecases/crop-planning';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/**
 * Crop types — the tenant crop catalog (PLANNING module).
 *   GET  → list crop types (alphabetical, with variety counts).
 *   POST → create a crop type (write-gated).
 */

const CreateCropTypeSchema = z
    .object({
        name: z.string().min(1, 'Crop type name is required').max(200),
        key: z.string().max(100).nullable().optional(),
        family: z.string().max(200).nullable().optional(),
        category: z.string().max(200).nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
    })
    .strip();

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'PLANNING');
        const cropTypes = await listCropTypes(ctx);
        return jsonResponse(cropTypes);
    },
);

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateCropTypeSchema,
        async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            await assertModuleEnabled(ctx, 'PLANNING');
            const cropType = await createCropType(ctx, body);
            return jsonResponse(cropType, { status: 201 });
        },
    ),
);
