import { patchThreadListRecord } from '@/web/components/conversation/sidebar/sidebarCache';
import { trpc } from '@/web/trpc/client';

import type { ThreadRecord, WorktreeRecord } from '@/app/backend/persistence/types';

type TrpcUtils = ReturnType<typeof trpc.useUtils>;
type ThreadListData = Awaited<ReturnType<TrpcUtils['conversation']['listThreads']['fetch']>>;
type WorktreeListData = Awaited<ReturnType<TrpcUtils['worktree']['list']['fetch']>>;
type ShellBootstrapData = Awaited<ReturnType<TrpcUtils['runtime']['getShellBootstrap']['fetch']>>;

interface ThreadListInput {
    profileId: string;
    activeTab: 'chat' | 'agent' | 'orchestrator';
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    scope?: 'detached' | 'workspace';
    workspaceFingerprint?: string;
    sort?: 'latest' | 'alphabetical';
}

function removeWorktrees(current: WorktreeRecord[], removedIds: readonly string[]): WorktreeRecord[] {
    const removedIdSet = new Set(removedIds);
    return current.filter((worktree) => !removedIdSet.has(worktree.id));
}

function upsertWorktree(current: WorktreeRecord[], worktree: WorktreeRecord): WorktreeRecord[] {
    return [worktree, ...current.filter((candidate) => candidate.id !== worktree.id)].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
    );
}

export function patchWorktreeCaches(input: {
    utils: TrpcUtils;
    profileId: string;
    listThreadsInput: ThreadListInput;
    thread?: ThreadRecord;
    worktree?: WorktreeRecord;
    removedWorktreeIds?: string[];
}) {
    const nextThread = input.thread;
    const nextWorktree = input.worktree;
    const removedWorktreeIds = input.removedWorktreeIds ?? [];

    if (nextThread) {
        input.utils.conversation.listThreads.setData(
            input.listThreadsInput,
            (current: ThreadListData | undefined) =>
                current
                    ? {
                          ...current,
                          threads: patchThreadListRecord(current.threads, nextThread),
                      }
                    : current
        );
    }

    if (nextWorktree) {
        input.utils.worktree.list.setData(
            { profileId: input.profileId },
            (current: WorktreeListData | undefined) => ({
                worktrees: upsertWorktree(current?.worktrees ?? [], nextWorktree),
            })
        );
        input.utils.runtime.getShellBootstrap.setData(
            { profileId: input.profileId },
            (current: ShellBootstrapData | undefined) =>
                current
                    ? {
                          ...current,
                          worktrees: upsertWorktree(current.worktrees, nextWorktree),
                      }
                    : current
        );
    }

    if (removedWorktreeIds.length > 0) {
        input.utils.worktree.list.setData(
            { profileId: input.profileId },
            (current: WorktreeListData | undefined) =>
                current
                    ? {
                          worktrees: removeWorktrees(current.worktrees, removedWorktreeIds),
                      }
                    : current
        );
        input.utils.runtime.getShellBootstrap.setData(
            { profileId: input.profileId },
            (current: ShellBootstrapData | undefined) =>
                current
                    ? {
                          ...current,
                          worktrees: removeWorktrees(current.worktrees, removedWorktreeIds),
                      }
                    : current
        );
    }
}
