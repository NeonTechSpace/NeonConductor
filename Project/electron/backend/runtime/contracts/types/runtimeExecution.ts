import type { RuntimeProviderId, TopLevelTab } from '@/app/backend/runtime/contracts/enums';

export type RuntimeCompatibilityState = 'compatible' | 'warning' | 'incompatible';

export type RuntimeCompatibilityIssue =
    | {
          code: 'execution_target_unavailable';
          target: 'workspace' | 'sandbox';
          workspaceFingerprint?: string;
          detail?: 'sandbox_not_materialized' | 'workspace_not_resolved' | 'generic';
      }
    | {
          code: 'permission_required';
          requestId?: string;
          detail?: 'dynamic_skill_context' | 'generic';
      }
    | {
          code: 'provider_not_runnable';
          providerId?: RuntimeProviderId;
      }
    | {
          code: 'provider_unsupported';
          providerId?: string;
      }
    | {
          code: 'model_unavailable';
          providerId?: RuntimeProviderId;
          modelId?: string;
      }
    | {
          code: 'model_tools_required';
          providerId?: RuntimeProviderId;
          modelId?: string;
          modeKey: string;
      }
    | {
          code: 'model_vision_required';
          providerId?: RuntimeProviderId;
          modelId?: string;
      }
    | {
          code: 'mode_invalid';
          modeKey: string;
          topLevelTab?: TopLevelTab;
      }
    | {
          code: 'provider_native_unsupported';
          providerId?: RuntimeProviderId;
          modelId?: string;
      }
    | {
          code: 'runtime_options_invalid';
          providerId?: RuntimeProviderId;
          modelId?: string;
          modeKey?: string;
          detail?:
              | 'attachments_not_allowed'
              | 'generic'
              | 'chat_mode_not_supported'
              | 'model_not_realtime_capable'
              | 'api_key_required'
              | 'base_url_not_supported'
              | 'provider_not_supported';
      };

export type RunStartRejectionAction = RuntimeCompatibilityIssue;
export type ModelCompatibilityIssue = RuntimeCompatibilityIssue;
