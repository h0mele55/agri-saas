/**
 * POST /api/t/:slug/admin/members/bulk/delete
 *
 * Bulk-deactivate (remove) memberships — the members table selection
 * action-row. Guarded by `admin.members`. The usecase is batch-aware: it
 * skips the caller's own membership and protects the last active OWNER/ADMIN.
 * Body: `{ membershipIds: string[] }`. Returns `{ deactivated, skipped }`.
 */
import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { bulkDeactivateTenantMember } from '@/app-layer/usecases/tenant-admin';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';
import { jsonResponse } from '@/lib/api-response';

const BulkDeactivateSchema = z.object({
    membershipIds: z.array(z.string().min(1)).min(1).max(100),
});

export const POST = withApiErrorHandling(
    requirePermission('admin.members', async (req: NextRequest, _routeArgs, ctx) => {
        const body = await req.json();
        const { membershipIds } = BulkDeactivateSchema.parse(body);
        const result = await bulkDeactivateTenantMember(ctx, { membershipIds });
        return jsonResponse(result);
    }),
);
