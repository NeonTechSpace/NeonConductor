import type {
    MessagePartRecord,
    MessageRecord,
    RunRecord,
    SessionSummaryRecord,
    ThreadListRecord,
} from '@/app/backend/persistence/types';
import type {
    ComposerImageAttachmentInput,
    EntityId,
    ModeDefinition,
    ResolvedContextState,
    ProviderAuthMethod,
    RuntimeProviderId,
    RuntimeRunOptions,
    RunStatus,
    TopLevelTab,
    RunStartRejectionAction,
    ResolvedWorkspaceContext,
} from '@/app/backend/runtime/contracts';
import type { RunExecutionErrorCode } from '@/app/backend/runtime/services/runExecution/errors';
import type { ProviderRuntimeToolDefinition } from '@/app/backend/providers/types';
import type {
    ProviderApiFamily,
    ProviderRoutedApiFamily,
    ProviderRuntimeTransportFamily,
    ProviderToolProtocol,
} from '@/app/backend/providers/types';

export interface StartRunInput {
    profileId: string;
    sessionId: EntityId<'sess'>;
    prompt: string;
    attachments?: ComposerImageAttachmentInput[];
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    worktreeId?: EntityId<'wt'>;
    requestId?: string;
    correlationId?: string;
    runtimeOptions: RuntimeRunOptions;
    providerId?: RuntimeProviderId;
    modelId?: string;
}

export interface ResolvedRunTarget {
    providerId: RuntimeProviderId;
    modelId: string;
}

export interface ResolvedRunAuth {
    authMethod: ProviderAuthMethod | 'none';
    apiKey?: string;
    accessToken?: string;
    organizationId?: string;
}

export interface RunCacheResolution {
    strategy: RuntimeRunOptions['cache']['strategy'];
    key?: string;
    applied: boolean;
    reason?: string;
}

export interface RunContextMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    parts: RunContextPart[];
}

interface RunContextReasoningMetadata {
    detailType?: string;
    detailId?: string;
    detailFormat?: string;
    detailSignature?: string;
    detailIndex?: number;
}

export type RunContextPart =
    | {
          type: 'text';
          text: string;
      }
    | {
          type: 'image';
          mediaId?: string;
          dataUrl?: string;
          sha256?: string;
          mimeType: ComposerImageAttachmentInput['mimeType'];
          width: number;
          height: number;
      }
    | ({
          type: 'reasoning';
          text: string;
      } & RunContextReasoningMetadata)
    | ({
          type: 'reasoning_summary';
          text: string;
      } & RunContextReasoningMetadata)
    | ({
          type: 'reasoning_encrypted';
          opaque: unknown;
      } & RunContextReasoningMetadata)
    | {
          type: 'tool_call';
          callId: string;
          toolName: string;
          argumentsText: string;
      }
    | {
          type: 'tool_result';
          callId: string;
          toolName: string;
          outputText: string;
          isError: boolean;
      };

export interface RunContext {
    messages: RunContextMessage[];
    digest: string;
}

export interface RunTransportResolution {
    requested: RuntimeRunOptions['transport']['family'];
    selected: ProviderRuntimeTransportFamily;
    degraded: boolean;
    degradedReason?: string;
}

export type ResolvedKiloRouting =
    | {
          mode: 'dynamic';
          sort: 'default' | 'price' | 'throughput' | 'latency';
      }
    | {
          mode: 'pinned';
          providerId: string;
      };

export interface PreparedRunStart {
    resolvedMode: {
        mode: ModeDefinition;
    };
    activeTarget: ResolvedRunTarget;
    runtimeProtocol: ProviderToolProtocol;
    apiFamily?: ProviderApiFamily;
    routedApiFamily?: ProviderRoutedApiFamily;
    resolvedAuth: ResolvedRunAuth;
    resolvedCache: RunCacheResolution;
    initialTransport: RunTransportResolution;
    toolDefinitions: ProviderRuntimeToolDefinition[];
    runContext?: RunContext;
    kiloRouting?: ResolvedKiloRouting;
    workspaceContext?: ResolvedWorkspaceContext;
}

export type StartRunResult =
    | {
          accepted: false;
          reason: 'not_found' | 'already_running' | 'rejected';
          code?: RunExecutionErrorCode;
          message?: string;
          action?: RunStartRejectionAction;
      }
    | {
          accepted: true;
          runId: EntityId<'run'>;
          runStatus: RunStatus;
          run: RunRecord;
          session: SessionSummaryRecord;
          initialMessages: {
              messages: MessageRecord[];
              messageParts: MessagePartRecord[];
          };
          thread?: ThreadListRecord;
          resolvedContextState: ResolvedContextState;
      };
