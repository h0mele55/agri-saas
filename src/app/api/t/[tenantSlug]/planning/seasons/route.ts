import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import { listSeasons, createSeason } from '@/app-layer/usecases/crop-planning';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/**
 * Seasons — crop-planning season windows (PLANNING module).
 *   GET  → list seasons (most-recent first).
 *   POST → create a season.
 */

const CreateSeasonSchema = z
    .object({
        name: z.string().min(1, 'Season name is required').max(200),
        year: z.number().int().min(1900).max(3000).nullable().optional(),
        startDate: z.string().min(8, 'Start date is required'),
        endDate: z.string().min(8, 'End date is required'),
        status: z.enum(['PLANNING', 'ACTIVE', 'CLOSED']).optional(),
        notes: z.string().max(5000).nullable().optional(),
    })
    .strip();

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'PLANNING');
        const seasons = await listSeasons(ctx);
        return jsonResponse(seasons);
    },
);

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateSeasonSchema,
        async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            await assertModuleEnabled(ctx, 'PLANNING');
            const season = await createSeason(ctx, body);
            return jsonResponse(season, { status: 201 });
        },
    ),
);
