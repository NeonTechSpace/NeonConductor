import type {
    KiloAccountContextRecord,
    ProviderAuthFlowRecord,
    ProviderAuthStateRecord,
} from '@/app/backend/persistence/types';
import type { ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';

export type FlowAuthMethod = Extract<ProviderAuthMethod, 'device_code' | 'oauth_pkce' | 'oauth_device'>;

export interface StartAuthResult {
    flow: ProviderAuthFlowRecord;
    pollAfterSeconds?: number;
    verificationUri?: string;
    userCode?: string;
    authorizeUrl?: string;
}

export interface PollAuthResult {
    flow: ProviderAuthFlowRecord;
    state: ProviderAuthStateRecord;
}

export interface ProviderAccountContextResult {
    profileId: string;
    providerId: RuntimeProviderId;
    authState: ProviderAuthStateRecord;
    kiloAccountContext?: KiloAccountContextRecord;
}

export interface OpenAITokenPayload {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    accountId?: string;
}
