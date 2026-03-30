import type {
    OpenAICompatibleExecutionBranch,
    OpenAICompatibleRuntimeConfig,
} from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleRuntime.types';
import { resolveRuntimeFamilyExecutionPath } from '@/app/backend/providers/runtimeFamilies';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

export function resolveOpenAICompatibleExecutionBranch(input: {
    runtimeInput: ProviderRuntimeInput;
    config: Pick<OpenAICompatibleRuntimeConfig, 'providerId'>;
}): OpenAICompatibleExecutionBranch | null {
    const executionPath = resolveRuntimeFamilyExecutionPath(input.runtimeInput.runtime.toolProtocol);
    if (executionPath === 'provider_native') {
        return 'provider_native';
    }

    if (executionPath === 'direct_family') {
        return 'direct_family';
    }

    if (
        input.config.providerId === 'openai' &&
        input.runtimeInput.runtimeOptions.execution.openAIExecutionMode === 'realtime_websocket'
    ) {
        return 'realtime_websocket';
    }

    if (
        input.runtimeInput.runtime.toolProtocol === 'openai_chat_completions' ||
        input.runtimeInput.runtime.toolProtocol === 'openai_responses'
    ) {
        return input.runtimeInput.runtime.toolProtocol;
    }

    return null;
}
