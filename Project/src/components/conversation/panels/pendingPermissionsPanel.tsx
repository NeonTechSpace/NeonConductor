import { WorkbenchApprovalRow } from '@/web/components/conversation/panels/workbenchApprovalRow';

import type { PermissionRecord } from '@/app/backend/persistence/types';

interface PendingPermissionsPanelProps {
    requests: PermissionRecord[];
    workspaceByFingerprint?: Record<
        string,
        {
            label: string;
            absolutePath: string;
        }
    >;
    busy: boolean;
    onResolve: (
        requestId: PermissionRecord['id'],
        resolution: 'deny' | 'allow_once' | 'allow_profile' | 'allow_workspace',
        selectedApprovalResource?: string
    ) => void;
}

export function PendingPermissionsPanel({
    requests,
    workspaceByFingerprint,
    busy,
    onResolve,
}: PendingPermissionsPanelProps) {
    if (requests.length === 0) {
        return null;
    }

    return (
        <section className='mb-3 space-y-2'>
            {requests.map((request) => {
                const workspaceInfo = request.workspaceFingerprint
                    ? workspaceByFingerprint?.[request.workspaceFingerprint]
                    : undefined;

                return (
                    <WorkbenchApprovalRow
                        key={request.id}
                        request={request}
                        {...(workspaceInfo ? { workspaceInfo } : {})}
                        busy={busy}
                        onResolve={onResolve}
                    />
                );
            })}
        </section>
    );
}
