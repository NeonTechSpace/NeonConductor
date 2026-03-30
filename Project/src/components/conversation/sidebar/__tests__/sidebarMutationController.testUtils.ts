import { vi } from 'vitest';

import type {
    ConversationRecord,
    SessionSummaryRecord,
    TagRecord,
    ThreadListRecord,
    ThreadTagRecord,
} from '@/app/backend/persistence/types';

type Updater<T> = T | ((current: T | undefined) => T | undefined);

function createQueryLeaf<T>(initialValue: T | undefined) {
    let value = initialValue;

    return {
        getData: vi.fn((_input?: unknown) => value),
        setData: vi.fn((_input: unknown, nextValue: Updater<T | undefined>) => {
            if (typeof nextValue === 'function') {
                const updater = nextValue as (current: T | undefined) => T | undefined;
                value = updater(value);
                return value;
            }

            value = nextValue;
            return value;
        }),
        read: () => value,
    };
}

export function createSidebarMutationUtils(input: {
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    tags: TagRecord[];
    threadTags: ThreadTagRecord[];
    sessions: SessionSummaryRecord[];
}) {
    const bucketLeaf = createQueryLeaf({ buckets: input.buckets });
    const threadLeaf = createQueryLeaf({ threads: input.threads });
    const tagLeaf = createQueryLeaf({ tags: input.tags });
    const shellBootstrapLeaf = createQueryLeaf({
        threadTags: input.threadTags,
        workspaceRoots: [],
        workspacePreferences: [],
    });
    const sessionLeaf = createQueryLeaf({ sessions: input.sessions });

    return {
        utils: {
            conversation: {
                listBuckets: bucketLeaf,
                listThreads: threadLeaf,
                listTags: tagLeaf,
            },
            runtime: {
                getShellBootstrap: shellBootstrapLeaf,
            },
            session: {
                list: sessionLeaf,
            },
        },
        read() {
            return {
                buckets: bucketLeaf.read(),
                threads: threadLeaf.read(),
                tags: tagLeaf.read(),
                shellBootstrap: shellBootstrapLeaf.read(),
                sessions: sessionLeaf.read(),
            };
        },
    };
}
