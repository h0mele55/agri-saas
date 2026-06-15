import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { env } from '@/env';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * NDVI tile-source config (Agro-intel) — tenant-scoped, authenticated.
 * Surfaces the operator-configured `AGRO_NDVI_TILE_URL` to the client map
 * so the NDVI overlay can render (or show its "configure a tile source"
 * empty state when unset). The URL is config, not a secret — it's an XYZ
 * tile template for a CC0 / openly-licensed raster source.
 *   GET → `{ configured: boolean, tileUrl: string }`
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        // Auth/membership gate only — config value is the same per deploy.
        await getTenantCtx(params, req);
        const tileUrl = env.AGRO_NDVI_TILE_URL ?? '';
        return jsonResponse({ configured: tileUrl.length > 0, tileUrl });
    },
);
