import { ArrowLeft, ArrowRight, MousePointerClick, RefreshCcw } from 'lucide-react';

import { Button } from '@/web/components/ui/button';

import type { DevBrowserTarget, DevBrowserTargetScheme } from '@/shared/contracts';

import type { RefObject } from 'react';

interface DevBrowserTargetSectionProps {
    statusLabel: string;
    selectionCount: number;
    commentDraftCount: number;
    designerDraftCount: number;
    scheme: DevBrowserTargetScheme;
    host: string;
    port: string;
    path: string;
    pickerActive: boolean;
    staleContextCount: number;
    visible: boolean;
    target: DevBrowserTarget | undefined;
    mountRef: RefObject<HTMLDivElement | null>;
    onSchemeChange: (scheme: DevBrowserTargetScheme) => void;
    onHostChange: (host: string) => void;
    onPortChange: (port: string) => void;
    onPathChange: (path: string) => void;
    onApplyTarget: () => void;
    onControl: (action: 'back' | 'forward' | 'reload') => void;
    onTogglePicker: () => void;
    onClearStale: () => void;
}

export function DevBrowserTargetSection({
    statusLabel,
    selectionCount,
    commentDraftCount,
    designerDraftCount,
    scheme,
    host,
    port,
    path,
    pickerActive,
    staleContextCount,
    visible,
    target,
    mountRef,
    onSchemeChange,
    onHostChange,
    onPortChange,
    onPathChange,
    onApplyTarget,
    onControl,
    onTogglePicker,
    onClearStale,
}: DevBrowserTargetSectionProps) {
    return (
        <div className='border-border/70 bg-card/20 rounded-[26px] border px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]'>
            <div className='mb-3 flex flex-wrap items-start justify-between gap-3'>
                <div>
                    <h3 className='text-sm font-semibold'>Dev Browser</h3>
                    <p className='text-muted-foreground text-xs'>
                        Local-network browser targeting, staged review comments, and packetized frontend context.
                    </p>
                </div>
                <div className='flex flex-wrap items-center gap-2 text-[11px]'>
                    <span className='text-muted-foreground rounded-full border px-2 py-1'>{statusLabel}</span>
                    <span className='text-muted-foreground rounded-full border px-2 py-1'>
                        {selectionCount} selection{selectionCount === 1 ? '' : 's'}
                    </span>
                    <span className='text-muted-foreground rounded-full border px-2 py-1'>
                        {commentDraftCount} comment{commentDraftCount === 1 ? '' : 's'}
                    </span>
                    <span className='text-muted-foreground rounded-full border px-2 py-1'>
                        {designerDraftCount} designer{designerDraftCount === 1 ? '' : 's'}
                    </span>
                </div>
            </div>

            <div className='grid gap-2 md:grid-cols-[92px_minmax(0,1fr)_88px_160px]'>
                <select
                    className='border-border bg-background rounded-xl border px-3 py-2 text-sm'
                    value={scheme}
                    onChange={(event) => {
                        onSchemeChange(event.target.value === 'https' ? 'https' : 'http');
                    }}>
                    <option value='http'>http</option>
                    <option value='https'>https</option>
                </select>
                <input
                    className='border-border bg-background rounded-xl border px-3 py-2 text-sm'
                    value={host}
                    onChange={(event) => {
                        onHostChange(event.target.value);
                    }}
                    placeholder='localhost'
                />
                <input
                    className='border-border bg-background rounded-xl border px-3 py-2 text-sm'
                    value={port}
                    onChange={(event) => {
                        onPortChange(event.target.value);
                    }}
                    placeholder='3000'
                />
                <input
                    className='border-border bg-background rounded-xl border px-3 py-2 text-sm'
                    value={path}
                    onChange={(event) => {
                        onPathChange(event.target.value);
                    }}
                    placeholder='/'
                />
            </div>

            <div className='mt-3 flex flex-wrap items-center gap-2'>
                <Button type='button' size='sm' variant='outline' onClick={onApplyTarget}>
                    Apply Target
                </Button>
                <Button
                    type='button'
                    size='icon'
                    variant='outline'
                    className='h-9 w-9 rounded-full'
                    onClick={() => {
                        onControl('back');
                    }}>
                    <ArrowLeft className='h-4 w-4' />
                </Button>
                <Button
                    type='button'
                    size='icon'
                    variant='outline'
                    className='h-9 w-9 rounded-full'
                    onClick={() => {
                        onControl('forward');
                    }}>
                    <ArrowRight className='h-4 w-4' />
                </Button>
                <Button
                    type='button'
                    size='icon'
                    variant='outline'
                    className='h-9 w-9 rounded-full'
                    onClick={() => {
                        onControl('reload');
                    }}>
                    <RefreshCcw className='h-4 w-4' />
                </Button>
                <Button type='button' size='sm' variant={pickerActive ? 'default' : 'outline'} onClick={onTogglePicker}>
                    <MousePointerClick className='mr-2 h-4 w-4' />
                    {pickerActive ? 'Picker On' : 'Start Picker'}
                </Button>
                {staleContextCount > 0 ? (
                    <Button type='button' size='sm' variant='outline' onClick={onClearStale}>
                        Clear Stale
                    </Button>
                ) : null}
            </div>

            {target?.validation.blockedReasonMessage ? (
                <p className='text-muted-foreground mt-3 text-xs'>{target.validation.blockedReasonMessage}</p>
            ) : target?.currentPage?.url ? (
                <p className='text-muted-foreground mt-3 text-xs'>
                    Current page: {target.currentPage.url}
                    {target.currentPage.title ? ` · ${target.currentPage.title}` : ''}
                </p>
            ) : null}

            <div
                ref={mountRef}
                className='border-border/70 bg-background mt-3 flex min-h-[340px] flex-1 items-center justify-center overflow-hidden rounded-[22px] border border-dashed'>
                <div className='text-muted-foreground px-6 text-center text-sm'>
                    {typeof window === 'undefined' || !window.neonDesktop
                        ? 'The desktop bridge is unavailable in this renderer context.'
                        : visible
                          ? target?.validation.status === 'allowed'
                              ? 'The dev browser is mounted here. Use the picker to capture structured element context.'
                              : 'Set an allowed local-network target to mount the dev browser in this panel.'
                          : 'Switch to the browser surface to mount the dev browser here.'}
                </div>
            </div>
        </div>
    );
}
