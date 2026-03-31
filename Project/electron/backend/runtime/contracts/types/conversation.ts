import type {
    ConversationEditResolution,
    ConversationScope,
    ConversationThreadGroupView,
    ConversationThreadSort,
    ExecutionEnvironmentMode,
    ThreadTitleGenerationMode,
    TopLevelTab,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export type ConversationListBucketsInput = ProfileInput;

export interface ConversationListThreadsInput extends ProfileInput {
    activeTab?: TopLevelTab;
    showAllModes?: boolean;
    groupView?: ConversationThreadGroupView;
    scope?: ConversationScope;
    workspaceFingerprint?: string;
    sort?: ConversationThreadSort;
}

export interface ConversationCreateThreadInput extends ProfileInput {
    topLevelTab?: TopLevelTab;
    scope: ConversationScope;
    workspacePath?: string;
    title: string;
    executionEnvironmentMode?: ExecutionEnvironmentMode;
    sandboxId?: EntityId<'sb'>;
}

export interface ConversationRenameThreadInput extends ProfileInput {
    threadId: EntityId<'thr'>;
    title: string;
}

export interface ConversationSetThreadFavoriteInput extends ProfileInput {
    threadId: EntityId<'thr'>;
    isFavorite: boolean;
}

export interface ConversationSetThreadExecutionEnvironmentInput extends ProfileInput {
    threadId: EntityId<'thr'>;
    mode: ExecutionEnvironmentMode;
    sandboxId?: EntityId<'sb'>;
}

export type ConversationListTagsInput = ProfileInput;

export interface ConversationUpsertTagInput extends ProfileInput {
    label: string;
}

export interface ConversationSetThreadTagsInput extends ProfileInput {
    threadId: EntityId<'thr'>;
    tagIds: string[];
}

export interface ConversationWorkspaceThreadDeletePreviewInput extends ProfileInput {
    workspaceFingerprint: string;
    includeFavorites?: boolean;
}

export interface ConversationDeleteWorkspaceThreadsInput extends ProfileInput {
    workspaceFingerprint: string;
    includeFavorites?: boolean;
}

export type ConversationGetEditPreferenceInput = ProfileInput;

export interface ConversationSetEditPreferenceInput extends ProfileInput {
    value: ConversationEditResolution;
}

export type ConversationGetThreadTitlePreferenceInput = ProfileInput;

export interface ConversationSetThreadTitlePreferenceInput extends ProfileInput {
    mode: ThreadTitleGenerationMode;
}
