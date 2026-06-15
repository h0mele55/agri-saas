import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import { assembleSchemePack } from '@/app-layer/usecases/scheme-pack';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * Assemble a scheme inspection pack — a FROZEN-able, SHARE-able audit pack
 * scoped to one certification scheme (a global AG_SCHEME framework). Gated
 * behind the CERTIFICATION module. Admin gate (OWNER/ADMIN/EDITOR) lives
 * inside `assembleSchemePack`.
 *
 * The caller FREEZES + SHARES the returned pack via the EXISTING audit-pack
 * freeze + share endpoints — this route only builds the DRAFT pack.
 */

const AssembleSchemePackSchema = z
    .object({
        auditCycleId: z.string().min(1),
        name: z.string().min(1).max(200),
    })
    .strip();

export const POST = withApiErrorHandling(
    withValidatedBody(
        AssembleSchemePackSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; schemeKey: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            await assertModuleEnabled(ctx, 'CERTIFICATION');
            const result = await assembleSchemePack(ctx, {
                schemeKey: params.schemeKey,
                auditCycleId: body.auditCycleId,
                name: body.name,
            });
            return jsonResponse(result, { status: 201 });
        },
    ),
);
