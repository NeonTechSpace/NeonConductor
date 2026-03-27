import { patchThreadListRecord } from '@/web/components/conversation/sidebar/sidebarCache';
import { trpc } from '@/web/trpc/client';

import type { ThreadRecord, SandboxRecord } from '@/app/backend/persistence/types';

type TrpcUtils = ReturnType<typeof trpc.useUtils>;
type ThreadListData = Awaited<ReturnType<TrpcUtils['conversation']['listThreads']['fetch']>>;
type SandboxListData = Awaited<ReturnType<TrpcUtils['sandbox']['list']['fetch']>>;
type ShellBootstrapData = Awaited<ReturnType<TrpcUtils['runtime']['getShellBootstrap']['fetch']>>;

export interface ThreadListInput {
    profileId: string;
    activeTab: 'chat' | 'agent' | 'orchestrator';
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    scope?: 'detached' | 'workspace';
    workspaceFingerprint?: string;
    sort?: 'latest' | 'alphabetical';
}

export interface WorkspaceSandboxCacheUtils {
    conversation: {
        listThreads: {
            setData: (
                input: ThreadListInput,
                updater: (current: ThreadListData | undefined) => ThreadListData | undefined
            ) => unknown;
        };
    };
    sandbox: {
        list: {
            setData: (
                input: { profileId: string },
                updater: (current: SandboxListData | undefined) => SandboxListData | undefined
            ) => unknown;
        };
    };
    runtime: {
        getShellBootstrap: {
            setData: (
                input: { profileId: string },
                updater: (current: ShellBootstrapData | undefined) => ShellBootstrapData | undefined
            ) => unknown;
        };
    };
}

function removeSandboxes(current: SandboxRecord[], removedIds: readonly string[]): SandboxRecord[] {
    const removedIdSet = new Set(removedIds);
    return current.filter((sandbox) => !removedIdSet.has(sandbox.id));
}

function upsertSandbox(current: SandboxRecord[], sandbox: SandboxRecord): SandboxRecord[] {
    return [sandbox, ...current.filter((candidate) => candidate.id !== sandbox.id)].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
    );
}

export function patchSandboxCaches(input: {
    utils: WorkspaceSandboxCacheUtils;
    profileId: string;
    listThreadsInput: ThreadListInput;
    thread?: ThreadRecord;
    sandbox?: SandboxRecord;
    removedSandboxIds?: string[];
}) {
    const nextThread = input.thread;
    const nextSandbox = input.sandbox;
    const removedSandboxIds = input.removedSandboxIds ?? [];

    if (nextThread) {
        input.utils.conversation.listThreads.setData(input.listThreadsInput, (current: ThreadListData | undefined) =>
            current
                ? {
                      ...current,
                      threads: patchThreadListRecord(current.threads, nextThread),
                  }
                : current
        );
    }

    if (nextSandbox) {
        input.utils.sandbox.list.setData({ profileId: input.profileId }, (current: SandboxListData | undefined) => ({
            sandboxes: upsertSandbox(current?.sandboxes ?? [], nextSandbox),
        }));
        input.utils.runtime.getShellBootstrap.setData(
            { profileId: input.profileId },
            (current: ShellBootstrapData | undefined) =>
                current
                    ? {
                          ...current,
                          sandboxes: upsertSandbox(current.sandboxes, nextSandbox),
                      }
                    : current
        );
    }

    if (removedSandboxIds.length > 0) {
        input.utils.sandbox.list.setData({ profileId: input.profileId }, (current: SandboxListData | undefined) =>
            current
                ? {
                      sandboxes: removeSandboxes(current.sandboxes, removedSandboxIds),
                  }
                : current
        );
        input.utils.runtime.getShellBootstrap.setData(
            { profileId: input.profileId },
            (current: ShellBootstrapData | undefined) =>
                current
                    ? {
                          ...current,
                          sandboxes: removeSandboxes(current.sandboxes, removedSandboxIds),
                      }
                    : current
        );
    }
}
