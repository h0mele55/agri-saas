import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { createFieldOperation, listLocationOperations } from '@/app-layer/usecases/field-operation';
import { withValidatedBody } from '@/lib/validation/route';
import { CreateFieldOperationSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const operations = await listLocationOperations(ctx, params.id);
    return jsonResponse(operations);
});

export const POST = withApiErrorHandling(withValidatedBody(CreateFieldOperationSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }, body) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const result = await createFieldOperation(ctx, params.id, body);
    return jsonResponse(result, { status: 201 });
}));
