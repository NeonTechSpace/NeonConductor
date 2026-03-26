import type { SessionMessageMediaPayload } from '@/shared/contracts';

interface CachedMediaObjectUrl {
    objectUrl: string;
    refCount: number;
}

const mediaObjectUrlCache = new Map<string, CachedMediaObjectUrl>();

function buildCacheKey(mediaId: string, payload: SessionMessageMediaPayload): string {
    return `${mediaId}:${payload.sha256}`;
}

export function acquireMessageMediaObjectUrl(mediaId: string, payload: SessionMessageMediaPayload): string {
    const cacheKey = buildCacheKey(mediaId, payload);
    const cached = mediaObjectUrlCache.get(cacheKey);
    if (cached) {
        cached.refCount += 1;
        return cached.objectUrl;
    }

    const normalizedBytes = Uint8Array.from(payload.bytes);
    const blob = new Blob([normalizedBytes.buffer], { type: payload.mimeType });
    const objectUrl = URL.createObjectURL(blob);
    mediaObjectUrlCache.set(cacheKey, {
        objectUrl,
        refCount: 1,
    });
    return objectUrl;
}

export function releaseMessageMediaObjectUrl(mediaId: string, payload: SessionMessageMediaPayload): void {
    const cacheKey = buildCacheKey(mediaId, payload);
    const cached = mediaObjectUrlCache.get(cacheKey);
    if (!cached) {
        return;
    }

    cached.refCount -= 1;
    if (cached.refCount > 0) {
        return;
    }

    URL.revokeObjectURL(cached.objectUrl);
    mediaObjectUrlCache.delete(cacheKey);
}
