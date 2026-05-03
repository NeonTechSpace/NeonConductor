import { workspaceIconService } from '@/app/backend/runtime/services/workspaceIcons/service';
import { protocol } from '@/app/main/runtime/electronApi';

export const WORKSPACE_ICON_PROTOCOL = 'neon-workspace-icon';

function fallbackResponse(): Response {
    return new Response(null, {
        status: 404,
    });
}

function readRouteParts(url: string): { profileId: string; workspaceFingerprint: string } | null {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== `${WORKSPACE_ICON_PROTOCOL}:`) {
            return null;
        }
        if (parsed.hostname !== 'workspace-root-icon') {
            return null;
        }
        const [profileId, workspaceFingerprint] = parsed.pathname.split('/').filter(Boolean);
        if (!profileId || !workspaceFingerprint) {
            return null;
        }
        return {
            profileId: decodeURIComponent(profileId),
            workspaceFingerprint: decodeURIComponent(workspaceFingerprint),
        };
    } catch {
        return null;
    }
}

export function buildWorkspaceIconUrl(input: {
    profileId: string;
    workspaceFingerprint: string;
    version: string;
}): string {
    return `${WORKSPACE_ICON_PROTOCOL}://workspace-root-icon/${encodeURIComponent(input.profileId)}/${encodeURIComponent(
        input.workspaceFingerprint
    )}?v=${encodeURIComponent(input.version)}`;
}

export function registerWorkspaceIconProtocol(): void {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: WORKSPACE_ICON_PROTOCOL,
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
            },
        },
    ]);
}

export function handleWorkspaceIconProtocol(): void {
    protocol.handle(WORKSPACE_ICON_PROTOCOL, async (request) => {
        const route = readRouteParts(request.url);
        if (!route) {
            return fallbackResponse();
        }
        const payload = await workspaceIconService.resolveIconPayload(route);
        const body = Uint8Array.from(payload.bytes).buffer;
        return new Response(body, {
            status: 200,
            headers: {
                'Content-Type': payload.mimeType,
                'Cache-Control': 'no-store',
            },
        });
    });
}
