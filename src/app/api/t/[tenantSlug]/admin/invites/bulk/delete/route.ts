/**
 * POST /api/t/:slug/admin/invites/bulk/delete
 *
 * Bulk-revoke pending invitations (the invites table's selection action-row
 * "Revoke selected"). Guarded by `admin.members`; tenant-scoped + idempotent
 * in the usecase. Body: `{ inviteIds: string[] }`. Returns `{ revoked: n }`.
 */
import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { bulkRevokeInvite } from '@/app-layer/usecases/tenant-invites';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';
import { jsonResponse } from '@/lib/api-response';

const BulkRevokeInviteSchema = z.object({
    inviteIds: z.array(z.string().min(1)).min(1).max(100),
});

export const POST = withApiErrorHandling(
    requirePermission('admin.members', async (req: NextRequest, _routeArgs, ctx) => {
        const body = await req.json();
        const { inviteIds } = BulkRevokeInviteSchema.parse(body);
        const result = await bulkRevokeInvite(ctx, { inviteIds });
        return jsonResponse(result);
    }),
);
