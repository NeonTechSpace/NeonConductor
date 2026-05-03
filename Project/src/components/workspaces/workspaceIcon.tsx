import { Folder } from 'lucide-react';
import { useState } from 'react';

import {
    buildWorkspaceIconImageSource,
    formatWorkspaceIconState,
} from '@/web/components/workspaces/workspaceIconModel';
import { cn } from '@/web/lib/utils';

import type { WorkspaceIconSummary } from '@/shared/contracts';

export function WorkspaceIcon({
    profileId,
    workspaceFingerprint,
    summary,
    label,
    className,
}: {
    profileId: string;
    workspaceFingerprint: string;
    summary: WorkspaceIconSummary;
    label: string;
    className?: string;
}) {
    const [failedVersion, setFailedVersion] = useState<string | undefined>(undefined);
    const showFallback = summary.kind === 'fallback' || failedVersion === summary.updatedAt;
    const imageSource = buildWorkspaceIconImageSource({
        profileId,
        workspaceFingerprint,
        updatedAt: summary.updatedAt,
    });

    return (
        <span
            className={cn(
                'border-border bg-background inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border',
                className
            )}
            title={formatWorkspaceIconState(summary)}
            aria-label={`${label}: ${formatWorkspaceIconState(summary)}`}>
            {showFallback ? (
                <Folder className='text-muted-foreground h-4 w-4' aria-hidden />
            ) : (
                <img
                    src={imageSource}
                    alt=''
                    className='h-full w-full object-cover'
                    draggable={false}
                    onError={() => {
                        setFailedVersion(summary.updatedAt);
                    }}
                />
            )}
        </span>
    );
}
