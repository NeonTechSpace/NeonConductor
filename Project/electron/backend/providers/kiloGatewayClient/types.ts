export interface KiloGatewayModel {
    id: string;
    name: string;
    upstreamProvider?: string;
    contextLength?: number;
    supportedParameters: string[];
    pricing: Record<string, unknown>;
    raw: Record<string, unknown>;
}

export interface KiloGatewayProvider {
    id: string;
    label: string;
    raw: Record<string, unknown>;
}

export interface KiloGatewayModelsByProvider {
    providerId: string;
    modelIds: string[];
    raw: Record<string, unknown>;
}

export interface KiloProfileOrganization {
    organizationId: string;
    name: string;
    isActive: boolean;
    entitlement: Record<string, unknown>;
}

export interface KiloProfileResponse {
    accountId?: string;
    displayName: string;
    emailMasked: string;
    organizations: KiloProfileOrganization[];
    raw: Record<string, unknown>;
}

export interface KiloProfileBalanceResponse {
    balance: number;
    currency: string;
    raw: Record<string, unknown>;
}

export interface KiloDefaultsResponse {
    defaultProviderId?: string;
    defaultModelId?: string;
    raw: Record<string, unknown>;
}

export interface KiloDeviceCodeResponse {
    code: string;
    userCode: string;
    verificationUri: string;
    pollIntervalSeconds: number;
    expiresAt: string;
    raw: Record<string, unknown>;
}

export interface KiloDeviceCodeStatusResponse {
    status: 'pending' | 'approved' | 'expired' | 'denied';
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    accountId?: string;
    organizationId?: string;
    raw: Record<string, unknown>;
}
