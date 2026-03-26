import type { RunStartRejectionAction, RuntimeCompatibilityIssue, RuntimeProviderId } from '@/shared/contracts';

export function isProviderRunnable(authState: string, authMethod: string): boolean {
    if (authMethod === 'none') {
        return false;
    }

    if (authMethod === 'api_key') {
        return authState === 'configured' || authState === 'authenticated';
    }

    return authState === 'authenticated';
}

function isProviderId(value: string | undefined): value is RuntimeProviderId {
    return value === 'kilo' || value === 'openai' || value === 'zai' || value === 'moonshot';
}

function resolveProviderLabel(input: {
    providerId: string | undefined;
    providerLabel: string | undefined;
    providerById: Map<RuntimeProviderId, { label: string }> | undefined;
}): string | undefined {
    if (input.providerLabel) {
        return input.providerLabel;
    }

    if (!input.providerId || !isProviderId(input.providerId)) {
        return undefined;
    }

    return input.providerById?.get(input.providerId)?.label;
}

export function formatRuntimeCapabilityIssue(input: {
    issue?: RuntimeCompatibilityIssue | undefined;
    message?: string | undefined;
    surface: 'run_rejection' | 'conversation_option' | 'settings_option';
    providerById?: Map<RuntimeProviderId, { label: string }> | undefined;
    providerLabel?: string | undefined;
}): string {
    const issue = input.issue;
    const fallbackMessage = input.message ?? 'Run start was rejected.';
    const providerId = issue && 'providerId' in issue ? issue.providerId : undefined;
    const providerLabel = resolveProviderLabel({
        providerId,
        providerLabel: input.providerLabel,
        providerById: input.providerById,
    });

    switch (issue?.code) {
        case 'execution_target_unavailable':
            return input.surface === 'run_rejection'
                ? 'This run could not prepare its workspace or sandbox target. Fix the execution target and try again.'
                : fallbackMessage;
        case 'provider_not_runnable':
            if (input.surface === 'settings_option' && providerLabel) {
                return `Connect ${providerLabel} before using this model in runs.`;
            }

            if (input.surface === 'conversation_option' && providerLabel) {
                return `${providerLabel} is not connected for runs yet.`;
            }

            if (providerLabel?.toLowerCase() === 'kilo') {
                return 'Kilo is not authenticated. Open Settings > Kilo and sign in before running.';
            }

            if (providerLabel) {
                return `${providerLabel} is not authenticated. Open Settings > Providers and connect it before running.`;
            }

            return 'Selected provider is not authenticated. Open Settings > Providers and connect it before running.';
        case 'provider_unsupported':
            return fallbackMessage;
        case 'model_unavailable':
            return input.surface === 'run_rejection'
                ? 'Selected model is no longer available. Choose another model and try again.'
                : fallbackMessage;
        case 'model_tools_required':
            return input.surface === 'run_rejection'
                ? 'Selected model does not support native tool calling for this mode. Choose a tool-capable model before running.'
                : 'This mode requires native tool calling.';
        case 'model_vision_required':
            return input.surface === 'run_rejection'
                ? 'Selected model does not support image input. Choose a vision-capable model or remove the attached images.'
                : 'This model cannot accept image attachments.';
        case 'mode_invalid':
            return fallbackMessage;
        case 'provider_native_unsupported':
            return input.surface === 'run_rejection'
                ? 'Selected model requires a provider-native runtime path that is unavailable.'
                : 'This model requires a provider-native runtime path that is unavailable.';
        case 'runtime_options_invalid':
            if (issue.detail === 'attachments_not_allowed' && input.surface !== 'run_rejection') {
                return 'Image attachments are only available for executable runs.';
            }

            return input.surface === 'run_rejection' ? `Run failed: ${fallbackMessage}` : fallbackMessage;
        default:
            return input.surface === 'run_rejection' ? `Run failed: ${fallbackMessage}` : fallbackMessage;
    }
}

export interface RunStartRejectedResultLike {
    accepted: false;
    message?: string | undefined;
    action?: RunStartRejectionAction | undefined;
}
