import { useState } from 'react';

import { Button } from '@/web/components/ui/button';

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

function resolutionLabel(resolution: 'deny' | 'allow_once' | 'allow_profile' | 'allow_workspace'): string {
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

export function PendingPermissionsPanel({
    requests,
    workspaceByFingerprint,
    busy,
    onResolve,
}: PendingPermissionsPanelProps) {
    const [selectedResources, setSelectedResources] = useState<Record<string, string>>({});

    if (requests.length === 0) {
        return null;
    }

    return (
        <section className='mb-3 space-y-2'>
            {requests.map((request) => {
                const workspaceInfo = request.workspaceFingerprint
                    ? workspaceByFingerprint?.[request.workspaceFingerprint]
                    : undefined;
                const selectedApprovalResource =
                    selectedResources[request.id] ??
                    request.selectedApprovalResource ??
                    request.approvalCandidates?.[0]?.resource ??
                    request.resource;

                return (
                    <article key={request.id} className='border-border bg-card rounded-2xl border p-3 shadow-sm'>
                        <div className='flex flex-wrap items-start justify-between gap-3'>
                            <div className='min-w-0 flex-1'>
                                <p className='text-sm font-semibold'>{request.summary.title}</p>
                                <p className='text-muted-foreground mt-1 text-xs'>{request.summary.detail}</p>
                                {request.commandText ? (
                                    <pre className='bg-background mt-3 overflow-x-auto rounded-xl border px-3 py-3 text-xs leading-5'>
                                        <code>{request.commandText}</code>
                                    </pre>
                                ) : null}
                                {request.rationale ? (
                                    <p className='text-muted-foreground mt-3 text-xs'>{request.rationale}</p>
                                ) : null}
                                <div className='text-muted-foreground mt-3 space-y-1 text-[11px]'>
                                    <p>{request.resource}</p>
                                    {request.workspaceFingerprint ? (
                                        <p>
                                            {workspaceInfo
                                                ? `${workspaceInfo.label} · ${workspaceInfo.absolutePath}`
                                                : `workspace ${request.workspaceFingerprint}`}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                            <div className='flex w-full max-w-[360px] flex-col gap-2'>
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
                                                setSelectedResources((current) => ({
                                                    ...current,
                                                    [request.id]: event.target.value,
                                                }));
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
                        </div>
                    </article>
                );
            })}
        </section>
    );
}
