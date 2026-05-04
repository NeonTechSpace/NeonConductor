import { useState } from 'react';

import { WorkbenchRowShell } from '@/web/components/conversation/messages/workbenchRowPrimitives';
import { Button } from '@/web/components/ui/button';

import type { PermissionRecord } from '@/app/backend/persistence/types';

type PermissionResolution = 'deny' | 'allow_once' | 'allow_profile' | 'allow_workspace';

export interface WorkbenchApprovalRowProps {
    request: PermissionRecord;
    workspaceInfo?: {
        label: string;
        absolutePath: string;
    };
    busy: boolean;
    onResolve: (
        requestId: PermissionRecord['id'],
        resolution: PermissionResolution,
        selectedApprovalResource?: string
    ) => void;
}

function resolutionLabel(resolution: PermissionResolution): string {
    if (resolution === 'deny') {
        return 'Deny';
    }
    if (resolution === 'allow_once') {
        return 'Allow Once';
    }
    if (resolution === 'allow_profile') {
        return 'Allow Profile';
    }

    return 'Allow Workspace';
}

export function WorkbenchApprovalRow({ request, workspaceInfo, busy, onResolve }: WorkbenchApprovalRowProps) {
    const [selectedApprovalResource, setSelectedApprovalResource] = useState(
        request.selectedApprovalResource ?? request.approvalCandidates?.[0]?.resource ?? request.resource
    );

    return (
        <WorkbenchRowShell
            id={request.id}
            icon='approval'
            severity='warning'
            title={request.summary.title}
            summary={request.summary.detail}
            defaultCollapsed={false}
            meta={<span>Approval required</span>}>
            <div className='space-y-3'>
                {request.commandText ? (
                    <pre className='bg-background overflow-x-auto rounded-xl border px-3 py-3 text-xs leading-5'>
                        <code>{request.commandText}</code>
                    </pre>
                ) : null}
                {request.rationale ? <p className='text-muted-foreground'>{request.rationale}</p> : null}
                <div className='text-muted-foreground space-y-1 text-[11px]'>
                    <p>{request.resource}</p>
                    {request.workspaceFingerprint ? (
                        <p>
                            {workspaceInfo
                                ? `${workspaceInfo.label} · ${workspaceInfo.absolutePath}`
                                : `workspace ${request.workspaceFingerprint}`}
                        </p>
                    ) : null}
                </div>
                {request.approvalCandidates && request.approvalCandidates.length > 0 ? (
                    <label className='block'>
                        <span className='text-muted-foreground mb-1 block text-[11px] font-semibold tracking-[0.12em] uppercase'>
                            Save Approval As
                        </span>
                        <select
                            value={selectedApprovalResource}
                            disabled={busy}
                            className='border-border bg-background h-11 w-full rounded-xl border px-3 text-sm'
                            onChange={(event) => {
                                setSelectedApprovalResource(event.target.value);
                            }}>
                            {request.approvalCandidates.map((candidate) => (
                                <option key={candidate.resource} value={candidate.resource}>
                                    {candidate.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
                <div className='flex flex-wrap gap-2'>
                    <Button
                        type='button'
                        variant='outline'
                        className='h-11'
                        disabled={busy}
                        onClick={() => {
                            onResolve(request.id, 'deny');
                        }}>
                        {resolutionLabel('deny')}
                    </Button>
                    <Button
                        type='button'
                        variant='outline'
                        className='h-11'
                        disabled={busy}
                        onClick={() => {
                            onResolve(request.id, 'allow_once');
                        }}>
                        {resolutionLabel('allow_once')}
                    </Button>
                    <Button
                        type='button'
                        variant='outline'
                        className='h-11'
                        disabled={busy}
                        onClick={() => {
                            onResolve(request.id, 'allow_profile', selectedApprovalResource);
                        }}>
                        {resolutionLabel('allow_profile')}
                    </Button>
                    {request.workspaceFingerprint ? (
                        <Button
                            type='button'
                            variant='outline'
                            className='h-11'
                            disabled={busy}
                            onClick={() => {
                                onResolve(request.id, 'allow_workspace', selectedApprovalResource);
                            }}>
                            {resolutionLabel('allow_workspace')}
                        </Button>
                    ) : null}
                </div>
            </div>
        </WorkbenchRowShell>
    );
}
