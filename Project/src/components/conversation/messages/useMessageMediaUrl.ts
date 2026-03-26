import { useEffect, useState } from 'react';

import {
    acquireMessageMediaObjectUrl,
    releaseMessageMediaObjectUrl,
} from '@/web/components/conversation/messages/messageMediaObjectUrlCache';
import { SECONDARY_QUERY_OPTIONS } from '@/web/lib/query/secondaryQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { EntityId, SessionMessageMediaPayload } from '@/shared/contracts';

function isIndexedRecord(value: unknown): value is Record<PropertyKey, unknown> {
    return typeof value === 'object' && value !== null;
}

function isArrayLikeByteSource(value: unknown): value is Record<PropertyKey, unknown> & { length: number } {
    return isIndexedRecord(value) && typeof value['length'] === 'number';
}

function normalizeMediaBytes(value: unknown): Uint8Array | undefined {
    if (value instanceof Uint8Array) {
        return Uint8Array.from(value);
    }

    if (isArrayLikeByteSource(value)) {
        const { length } = value;
        const bytes = Array.from({ length }, (_unused, index) => {
            const candidate = value[index];
            return typeof candidate === 'number' ? candidate : 0;
        });

        return Uint8Array.from(bytes);
    }

    return undefined;
}

function toMediaPayload(
    value:
        | {
              found: boolean;
              mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
              bytes?: unknown;
              byteSize?: number;
              width?: number;
              height?: number;
              sha256?: string;
          }
        | undefined
): SessionMessageMediaPayload | undefined {
    const bytes = normalizeMediaBytes(value?.bytes);
    if (
        !value?.found ||
        !value.mimeType ||
        !bytes ||
        typeof value.byteSize !== 'number' ||
        typeof value.width !== 'number' ||
        typeof value.height !== 'number' ||
        !value.sha256
    ) {
        return undefined;
    }

    return {
        mimeType: value.mimeType,
        bytes,
        byteSize: value.byteSize,
        width: value.width,
        height: value.height,
        sha256: value.sha256,
    };
}

export function useMessageMediaUrl(input: { profileId: string; mediaId: EntityId<'media'>; enabled: boolean }) {
    const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);
    const mediaQuery = trpc.session.getMessageMedia.useQuery(
        {
            profileId: input.profileId,
            mediaId: input.mediaId,
        },
        {
            enabled: input.enabled,
            ...SECONDARY_QUERY_OPTIONS,
            staleTime: Number.POSITIVE_INFINITY,
            gcTime: 1000 * 60 * 20,
        }
    );

    useEffect(() => {
        const payload = toMediaPayload(mediaQuery.data);
        if (!payload) {
            setObjectUrl(undefined);
            return;
        }

        const nextObjectUrl = acquireMessageMediaObjectUrl(input.mediaId, payload);
        setObjectUrl(nextObjectUrl);

        return () => {
            releaseMessageMediaObjectUrl(input.mediaId, payload);
        };
    }, [input.mediaId, mediaQuery.data]);

    return {
        objectUrl,
        mediaQuery,
    };
}
