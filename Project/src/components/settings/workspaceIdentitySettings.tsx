import { Image, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { WorkspaceIcon } from '@/web/components/workspaces/workspaceIcon';
import { formatWorkspaceIconState } from '@/web/components/workspaces/workspaceIconModel';
import { patchWorkspaceRootCaches } from '@/web/components/workspaces/workspacesSurfaceCacheProjector';
import { trpc } from '@/web/trpc/client';

import type { WorkspaceRootRecord } from '@/shared/contracts';

export function WorkspaceIdentitySettings({
    profileId,
    workspaceRoot,
}: {
    profileId: string;
    workspaceRoot: WorkspaceRootRecord;
}) {
    const utils = trpc.useUtils();
    const patchWorkspaceRootMutation = trpc.runtime.patchWorkspaceRoot.useMutation();
    const [labelDraft, setLabelDraft] = useState(workspaceRoot.label);
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);

    async function patchWorkspaceRoot(input: Parameters<typeof patchWorkspaceRootMutation.mutateAsync>[0]) {
        setStatusMessage(undefined);
        const result = await patchWorkspaceRootMutation.mutateAsync(input);
        patchWorkspaceRootCaches({
            utils,
            profileId,
            workspaceRoot: result.workspaceRoot,
        });
        setLabelDraft(result.workspaceRoot.label);
        return result.workspaceRoot;
    }

    async function chooseManualIcon() {
        const picker = window.neonDesktop;
        if (!picker) {
            setStatusMessage('Workspace icon picker is unavailable in this runtime.');
            return;
        }
        const result = await picker.pickWorkspaceIcon();
        if (result.canceled) {
            return;
        }
        await patchWorkspaceRoot({
            profileId,
            workspaceFingerprint: workspaceRoot.fingerprint,
            iconAction: {
                kind: 'set_manual',
                sourceAbsolutePath: result.absolutePath,
            },
        });
        setStatusMessage('Updated workspace icon.');
    }

    async function saveLabel() {
        await patchWorkspaceRoot({
            profileId,
            workspaceFingerprint: workspaceRoot.fingerprint,
            label: labelDraft,
        });
        setStatusMessage('Updated workspace name.');
    }

    async function clearManualIcon() {
        await patchWorkspaceRoot({
            profileId,
            workspaceFingerprint: workspaceRoot.fingerprint,
            iconAction: {
                kind: 'clear_manual',
            },
        });
        setStatusMessage('Cleared manual icon.');
    }

    async function refreshDetectedIcon() {
        await patchWorkspaceRoot({
            profileId,
            workspaceFingerprint: workspaceRoot.fingerprint,
            iconAction: {
                kind: 'refresh_detected',
            },
        });
        setStatusMessage('Refreshed workspace icon detection.');
    }

    return (
        <section className='border-border/70 bg-card/40 rounded-2xl border p-4'>
            <div className='flex flex-wrap items-start justify-between gap-4'>
                <div className='flex min-w-0 items-start gap-3'>
                    <WorkspaceIcon
                        profileId={profileId}
                        workspaceFingerprint={workspaceRoot.fingerprint}
                        summary={workspaceRoot.workspaceIconSummary}
                        label={workspaceRoot.label}
                        className='h-12 w-12 rounded-xl'
                    />
                    <div className='min-w-0 space-y-1'>
                        <p className='text-sm font-semibold'>Workspace Identity</p>
                        <p className='text-muted-foreground truncate text-xs'>{workspaceRoot.absolutePath}</p>
                        <p className='text-muted-foreground text-xs'>
                            {formatWorkspaceIconState(workspaceRoot.workspaceIconSummary)}
                        </p>
                    </div>
                </div>
                <div className='flex flex-wrap gap-2'>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        className='rounded-full'
                        disabled={patchWorkspaceRootMutation.isPending}
                        onClick={() => {
                            void chooseManualIcon();
                        }}>
                        <Image className='h-4 w-4' />
                        Choose
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        className='rounded-full'
                        disabled={patchWorkspaceRootMutation.isPending}
                        onClick={() => {
                            void refreshDetectedIcon();
                        }}>
                        <RefreshCw className='h-4 w-4' />
                        Refresh
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        className='rounded-full'
                        disabled={
                            patchWorkspaceRootMutation.isPending || workspaceRoot.workspaceIconSummary.kind !== 'manual'
                        }
                        onClick={() => {
                            void clearManualIcon();
                        }}>
                        <RotateCcw className='h-4 w-4' />
                        Clear
                    </Button>
                </div>
            </div>

            <div className='mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]'>
                <label className='space-y-1.5'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Workspace Name
                    </span>
                    <input
                        value={labelDraft}
                        onChange={(event) => {
                            setLabelDraft(event.target.value);
                        }}
                        className='border-border bg-background h-10 w-full rounded-2xl border px-3 text-sm'
                    />
                </label>
                <Button
                    type='button'
                    size='sm'
                    variant='secondary'
                    className='self-end rounded-full'
                    disabled={
                        patchWorkspaceRootMutation.isPending ||
                        labelDraft.trim().length === 0 ||
                        labelDraft.trim() === workspaceRoot.label
                    }
                    onClick={() => {
                        void saveLabel();
                    }}>
                    <Save className='h-4 w-4' />
                    Save
                </Button>
            </div>

            {statusMessage || patchWorkspaceRootMutation.error ? (
                <p className='text-muted-foreground mt-3 text-xs'>
                    {patchWorkspaceRootMutation.error?.message ?? statusMessage}
                </p>
            ) : null}
        </section>
    );
}
