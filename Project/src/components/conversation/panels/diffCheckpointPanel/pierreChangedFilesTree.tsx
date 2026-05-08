import { FileTree, useFileTree } from '@pierre/trees/react';
import { startTransition, useEffect, useRef } from 'react';
import type { SyntheticEvent } from 'react';

import type { DiffTreeViewModel } from '@/web/components/conversation/panels/diffViewModels';

export interface PierreChangedFilesTreeProps {
    onPrefetchPatch: (path: string) => void;
    onSelectPath: (path: string) => void;
    resolvedSelectedPath: string | undefined;
    viewModel: DiffTreeViewModel;
}

export function PierreChangedFilesTree({
    viewModel,
    resolvedSelectedPath,
    onPrefetchPatch,
    onSelectPath,
}: PierreChangedFilesTreeProps) {
    return (
        <PierreChangedFilesTreeInstance
            key={viewModel.signature}
            viewModel={viewModel}
            resolvedSelectedPath={resolvedSelectedPath}
            onPrefetchPatch={onPrefetchPatch}
            onSelectPath={onSelectPath}
        />
    );
}

function PierreChangedFilesTreeInstance({
    viewModel,
    resolvedSelectedPath,
    onPrefetchPatch,
    onSelectPath,
}: PierreChangedFilesTreeProps) {
    const lastPrefetchPathRef = useRef<string | undefined>(undefined);
    const { model } = useFileTree({
        gitStatus: viewModel.gitStatus,
        initialExpansion: 'open',
        initialSelectedPaths: resolvedSelectedPath ? [resolvedSelectedPath] : [],
        itemHeight: 36,
        onSelectionChange: (selectedPaths) => {
            const selectedPath = selectedPaths.find((path) => viewModel.filesByPath.has(path));
            if (!selectedPath) {
                return;
            }

            startTransition(() => {
                onSelectPath(selectedPath);
            });
            onPrefetchPatch(selectedPath);
        },
        paths: viewModel.paths,
        renderRowDecoration: ({ item }) => {
            const file = viewModel.filesByPath.get(item.path);
            if (!file) {
                return null;
            }

            return {
                text: file.lineDeltaLabel ?? file.statusLabel,
                title: file.previousPath
                    ? `${file.statusLabel}: ${file.previousPath} -> ${file.path}`
                    : `${file.statusLabel}${file.lineDeltaLabel ? `: ${file.lineDeltaLabel}` : ''}`,
            };
        },
        search: true,
        searchBlurBehavior: 'retain',
        unsafeCSS: `
            button[data-type='item'] {
                border-radius: 6px;
                font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
                font-size: 12px;
            }
            button[data-type='item'][data-item-selected] {
                outline: 1px solid hsl(var(--primary));
            }
        `,
    });

    useEffect(() => {
        if (!resolvedSelectedPath || !viewModel.filesByPath.has(resolvedSelectedPath)) {
            return;
        }

        for (const selectedPath of model.getSelectedPaths()) {
            if (selectedPath !== resolvedSelectedPath) {
                model.getItem(selectedPath)?.deselect();
            }
        }
        const selectedItem = model.getItem(resolvedSelectedPath);
        selectedItem?.select();
        selectedItem?.focus();
        onPrefetchPatch(resolvedSelectedPath);
    }, [model, onPrefetchPatch, resolvedSelectedPath, viewModel.filesByPath]);

    const prefetchPathFromEvent = (event: SyntheticEvent<HTMLElement>) => {
        for (const node of event.nativeEvent.composedPath()) {
            if (!(node instanceof HTMLElement)) {
                continue;
            }

            const itemPath = node.dataset.itemPath;
            if (itemPath && viewModel.filesByPath.has(itemPath) && lastPrefetchPathRef.current !== itemPath) {
                lastPrefetchPathRef.current = itemPath;
                onPrefetchPatch(itemPath);
                return;
            }
        }
    };

    return (
        <div className='p-2'>
            <FileTree
                aria-label='Changed files'
                className='block h-72 overflow-hidden rounded-md'
                model={model}
                onFocusCapture={prefetchPathFromEvent}
                onMouseMove={prefetchPathFromEvent}
            />
            <p className='text-muted-foreground mt-2 truncate px-1 font-mono text-[11px]'>
                {resolvedSelectedPath ?? `${String(viewModel.fileCount)} changed files`}
            </p>
        </div>
    );
}
