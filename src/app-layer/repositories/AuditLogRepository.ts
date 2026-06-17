import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

export class AuditLogRepository {
    static async list(db: PrismaTx, ctx: RequestContext) {
        return db.auditLog.findMany({
            where: { tenantId: ctx.tenantId },
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: { user: { select: { name: true, email: true } } },
        });
    }

    /**
     * Audit rows for a single action, newest first. Backed by the
     * `[tenantId, action]` index. Bounded by `take`. Selects only the
     * fields a feature timeline needs (structured `detailsJson` + actor)
     * rather than the full row.
     */
    static async listByAction(db: PrismaTx, ctx: RequestContext, action: string, limit = 50) {
        return db.auditLog.findMany({
            where: { tenantId: ctx.tenantId, action },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                createdAt: true,
                detailsJson: true,
                user: { select: { name: true, email: true } },
            },
        });
    }
}
