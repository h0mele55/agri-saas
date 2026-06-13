import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { importLocationSpatialFile } from '@/app-layer/usecases/spatial-import';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_EXT = ['.zip', '.kml', '.kmz', '.geojson', '.json'];

export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
        return jsonResponse({ error: 'Missing or invalid file in form data' }, { status: 400 });
    }
    if (file.size === 0) {
        return jsonResponse({ error: 'File is empty' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
        return jsonResponse({ error: 'File exceeds the 50 MB cap' }, { status: 413 });
    }
    const lower = (file.name || '').toLowerCase();
    if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
        return jsonResponse(
            { error: 'Unsupported file type. Upload a shapefile (.zip), KML (.kml/.kmz), or GeoJSON (.geojson/.json).' },
            { status: 415 },
        );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importLocationSpatialFile(ctx, params.id, {
        filename: file.name,
        buffer,
        mimeType: file.type || undefined,
    });
    return jsonResponse(result, { status: 201 });
});
