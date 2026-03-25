import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import type { EntityId } from '@/shared/contracts';

export const neonObservabilityEventKinds = [
    'run_started',
    'run_completed',
    'run_failed',
    'run_aborted',
    'transport_selected',
    'stream_chunk',
    'usage_updated',
    'tool_state_changed',
] as const;
export type NeonObservabilityEventKind = (typeof neonObservabilityEventKinds)[number];

export const neonLiveStreamChunkKinds = [
    'text_delta',
    'reasoning_delta',
    'tool_call',
    'tool_result',
    'status',
    'usage',
    'done',
    'error',
] as const;
export type NeonLiveStreamChunkKind = (typeof neonLiveStreamChunkKinds)[number];

export const neonToolLifecycleStates = [
    'proposed',
    'input_complete',
    'approval_required',
    'approved',
    'denied',
    'executing',
    'completed',
    'failed',
    'cancelled',
] as const;
export type NeonToolLifecycleState = (typeof neonToolLifecycleStates)[number];

export const neonObservabilityEventSources = [
    'provider.stream',
    'runtime.run_execution',
    'runtime.terminal_state',
    'runtime.tool_execution',
    'runtime.transport',
] as const;
export type NeonObservabilityEventSource = (typeof neonObservabilityEventSources)[number];

export interface NeonObservabilitySubscriptionInput {
    afterSequence?: number;
    profileId?: string;
    sessionId?: EntityId<'sess'>;
    runId?: EntityId<'run'>;
}

export interface NeonObservabilityUsage {
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    costMicrounits?: number;
}

export type NeonLiveStreamChunk =
    | {
          kind: 'text_delta';
          text: string;
      }
    | {
          kind: 'reasoning_delta';
          text: string;
          summary: boolean;
      }
    | {
          kind: 'tool_call';
          toolCallId: string;
          toolName: string;
          argumentsText: string;
      }
    | {
          kind: 'tool_result';
          toolCallId: string;
          toolName: string;
          outputText: string;
          isError: boolean;
      }
    | {
          kind: 'status';
          code?: string;
          label: string;
          elapsedMs?: number;
      }
    | ({
          kind: 'usage';
      } & NeonObservabilityUsage)
    | {
          kind: 'done';
      }
    | {
          kind: 'error';
          code: string;
          message: string;
      };

export interface NeonObservabilityEventBase {
    sequence: number;
    at: string;
    kind: NeonObservabilityEventKind;
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    providerId: RuntimeProviderId | string;
    modelId: string;
    source: NeonObservabilityEventSource;
}

export type NeonObservabilityEvent =
    | (NeonObservabilityEventBase & {
          kind: 'run_started';
          topLevelTab: TopLevelTab;
          modeKey: string;
      })
    | (NeonObservabilityEventBase & {
          kind: 'run_completed';
      })
    | (NeonObservabilityEventBase & {
          kind: 'run_failed';
          errorCode: string;
          errorMessage: string;
      })
    | (NeonObservabilityEventBase & {
          kind: 'run_aborted';
      })
    | (NeonObservabilityEventBase & {
          kind: 'transport_selected';
          requestedTransportFamily: string;
          selectedTransportFamily: string;
          degraded: boolean;
          degradedReason?: string;
      })
    | (NeonObservabilityEventBase & {
          kind: 'stream_chunk';
          chunk: NeonLiveStreamChunk;
      })
    | (NeonObservabilityEventBase & {
          kind: 'usage_updated';
          usage: NeonObservabilityUsage;
      })
    | (NeonObservabilityEventBase & {
          kind: 'tool_state_changed';
          toolCallId: string;
          toolName: string;
          state: NeonToolLifecycleState;
          argumentsText?: string;
          requestId?: string;
          error?: string;
          policySource?: string;
      });
