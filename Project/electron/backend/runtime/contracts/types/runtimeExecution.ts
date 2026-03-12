import type { RuntimeProviderId, TopLevelTab } from '@/app/backend/runtime/contracts/enums';

export type RuntimeCompatibilityState = 'compatible' | 'warning' | 'incompatible';

export type RuntimeCompatibilityIssue =
    | {
          code: 'provider_not_runnable';
          providerId?: RuntimeProviderId | string;
      }
    | {
          code: 'provider_unsupported';
          providerId?: string;
      }
    | {
          code: 'model_unavailable';
          providerId?: RuntimeProviderId | string;
          modelId?: string;
      }
    | {
          code: 'model_tools_required';
          providerId?: RuntimeProviderId | string;
          modelId?: string;
          modeKey: string;
      }
    | {
          code: 'model_vision_required';
          providerId?: RuntimeProviderId | string;
          modelId?: string;
      }
    | {
          code: 'mode_invalid';
          modeKey: string;
          topLevelTab?: TopLevelTab;
      }
    | {
          code: 'provider_native_unsupported';
          providerId?: RuntimeProviderId | string;
          modelId?: string;
      }
    | {
          code: 'runtime_options_invalid';
          providerId?: RuntimeProviderId | string;
          modelId?: string;
          modeKey?: string;
          detail?: 'attachments_not_allowed' | 'generic';
      };

export type RunStartRejectionAction = RuntimeCompatibilityIssue;
export type ModelCompatibilityIssue = RuntimeCompatibilityIssue;
