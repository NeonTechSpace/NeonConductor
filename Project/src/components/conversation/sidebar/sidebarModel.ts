import { buildBranchRows, type ThreadRenderRow } from '@/web/components/conversation/sidebar/sidebarBranchRows';
import type { SidebarBrowserState } from '@/web/components/conversation/sidebar/sidebarTypes';

import type { ConversationRecord, TagRecord, ThreadListRecord } from '@/app/backend/persistence/types';

interface GroupedThreadRowsSection {
    label: string;
    workspaceFingerprint: string;
    absolutePath?: string;
    favoriteCount: number;
    threadCount: number;
    rows: ThreadRenderRow[];
}

function buildWorkspaceRows(threads: ThreadListRecord[]): ThreadRenderRow[] {
    const byId = new Map(threads.map((thread) => [thread.id, thread] as const));
    const delegatedChildrenByParent = new Map<string, ThreadListRecord[]>();
    const rootRows: ThreadListRecord[] = [];

    for (const thread of threads) {
        const parentId = thread.parentThreadId;
        const parentThread = parentId ? byId.get(parentId) : undefined;
        const shouldNestUnderParent =
            (Boolean(thread.delegatedFromOrchestratorRunId) || Boolean(thread.delegatedFromPlanResearchBatchId)) &&
            Boolean(parentId) &&
            Boolean(parentThread);
        if (!shouldNestUnderParent || !parentId) {
            rootRows.push(thread);
            continue;
        }

        const existingChildren = delegatedChildrenByParent.get(parentId) ?? [];
        existingChildren.push(thread);
        delegatedChildrenByParent.set(parentId, existingChildren);
    }

    const rows: ThreadRenderRow[] = [];
    const stack = rootRows
        .slice()
        .reverse()
        .map((thread) => ({
            thread,
            depth: 0,
        }));

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }

        rows.push(current);
        const delegatedChildren = delegatedChildrenByParent.get(current.thread.id) ?? [];
        for (let index = delegatedChildren.length - 1; index >= 0; index -= 1) {
            const childThread = delegatedChildren[index];
            if (!childThread) {
                continue;
            }

            stack.push({
                thread: childThread,
                depth: current.depth + 1,
            });
        }
    }

    return rows;
}

function compareWorkspaceFingerprints(
    left: string,
    right: string,
    workspaceLabelByFingerprint: Map<string, string>
): number {
    const leftLabel = workspaceLabelByFingerprint.get(left) ?? left;
    const rightLabel = workspaceLabelByFingerprint.get(right) ?? right;
    const labelCompare = leftLabel.localeCompare(rightLabel, undefined, {
        sensitivity: 'base',
        numeric: true,
    });
    if (labelCompare !== 0) {
        return labelCompare;
    }

    return left.localeCompare(right, undefined, {
        sensitivity: 'base',
        numeric: true,
    });
}

export function buildConversationSidebarModel(input: {
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    tags: TagRecord[];
    workspaceRoots: Array<{
        fingerprint: string;
        label: string;
        absolutePath?: string;
    }>;
    selectedThreadId?: string;
    groupView: 'workspace' | 'branch';
}): SidebarBrowserState {
    const workspaceLabelByFingerprint = new Map(
        input.workspaceRoots.map((workspaceRoot) => [workspaceRoot.fingerprint, workspaceRoot.label] as const)
    );
    for (const bucket of input.buckets) {
        if (bucket.scope === 'workspace' && bucket.workspaceFingerprint) {
            workspaceLabelByFingerprint.set(
                bucket.workspaceFingerprint,
                workspaceLabelByFingerprint.get(bucket.workspaceFingerprint) ?? bucket.title
            );
        }
    }
    const workspacePathByFingerprint = new Map(
        input.workspaceRoots.map((workspaceRoot) => [workspaceRoot.fingerprint, workspaceRoot.absolutePath] as const)
    );
    const rootedWorkspaceFingerprints = input.workspaceRoots.map((workspaceRoot) => workspaceRoot.fingerprint);
    const discoveredWorkspaceFingerprints = [
        ...new Set([
            ...input.buckets
                .filter((bucket) => bucket.scope === 'workspace')
                .map((bucket) => bucket.workspaceFingerprint),
            ...input.threads
                .filter((thread) => thread.anchorKind === 'workspace' && typeof thread.anchorId === 'string')
                .map((thread) => thread.anchorId),
        ]),
    ]
        .filter((workspaceFingerprint): workspaceFingerprint is string => {
            if (typeof workspaceFingerprint !== 'string') {
                return false;
            }

            return !rootedWorkspaceFingerprints.includes(workspaceFingerprint);
        })
        .sort((left, right) => compareWorkspaceFingerprints(left, right, workspaceLabelByFingerprint));
    const orderedWorkspaceFingerprints = [...rootedWorkspaceFingerprints, ...discoveredWorkspaceFingerprints];
    const workspaceOptions = orderedWorkspaceFingerprints;

    const tagLabelById = new Map(input.tags.map((tag) => [tag.id, tag.label]));
    const selectedThread = input.selectedThreadId
        ? input.threads.find((thread) => thread.id === input.selectedThreadId)
        : undefined;

    const grouped = new Map<string, GroupedThreadRowsSection>();
    for (const workspaceFingerprint of orderedWorkspaceFingerprints) {
        const workspaceRoot = input.workspaceRoots.find((candidate) => candidate.fingerprint === workspaceFingerprint);
        const absolutePath = workspaceRoot?.absolutePath ?? workspacePathByFingerprint.get(workspaceFingerprint);
        grouped.set(`ws:${workspaceFingerprint}`, {
            label:
                workspaceRoot?.label ?? workspaceLabelByFingerprint.get(workspaceFingerprint) ?? workspaceFingerprint,
            workspaceFingerprint,
            ...(absolutePath ? { absolutePath } : {}),
            favoriteCount: 0,
            threadCount: 0,
            rows: [],
        });
    }

    const playgroundThreads = input.threads.filter((thread) => thread.anchorKind !== 'workspace');

    for (const [anchorKey, group] of grouped.entries()) {
        const anchorThreads = input.threads.filter(
            (thread) => thread.anchorKind === 'workspace' && `ws:${thread.anchorId ?? ''}` === anchorKey
        );
        group.rows = input.groupView === 'branch' ? buildBranchRows(anchorThreads) : buildWorkspaceRows(anchorThreads);
        group.favoriteCount = anchorThreads.filter((thread) => thread.isFavorite).length;
        group.threadCount = anchorThreads.length;
    }

    return {
        workspaceOptions,
        tagLabelById,
        selectedThread,
        workspaceGroups: Array.from(grouped.values()),
        playgroundRows:
            input.groupView === 'branch' ? buildBranchRows(playgroundThreads) : buildWorkspaceRows(playgroundThreads),
    };
}
