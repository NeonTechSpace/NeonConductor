import {
    OPENAI_OAUTH_AUTHORIZE_URL,
    OPENAI_OAUTH_CLIENT_ID,
    OPENAI_OAUTH_DEVICE_CODE_URL,
    OPENAI_OAUTH_REDIRECT_URI,
    OPENAI_OAUTH_TOKEN_URL,
} from '@/app/backend/providers/auth/constants';
import {
    createOpaque,
    createPkceChallenge,
    isRecord,
    plusSeconds,
    readOpenAIAccountId,
    readString,
} from '@/app/backend/providers/auth/helpers';
import type { OpenAITokenPayload } from '@/app/backend/providers/auth/types';

function parseOpenAITokenPayload(payload: unknown): OpenAITokenPayload {
    if (!isRecord(payload)) {
        throw new Error('Invalid OpenAI token payload.');
    }

    const accessToken = readString(payload['access_token']);
    if (!accessToken) {
        const errorCode = readString(payload['error']) ?? 'unknown';
        const errorDescription = readString(payload['error_description']) ?? 'OpenAI token exchange failed.';
        throw new Error(`${errorCode}: ${errorDescription}`);
    }

    const expiresIn =
        typeof payload['expires_in'] === 'number' && Number.isFinite(payload['expires_in'])
            ? payload['expires_in']
            : undefined;
    const refreshToken = readString(payload['refresh_token']);
    const claimedAccountId = readString(payload['account_id']);
    const inferredAccountId = readOpenAIAccountId(accessToken);

    return {
        accessToken,
        ...(refreshToken ? { refreshToken } : {}),
        ...(expiresIn !== undefined ? { expiresAt: plusSeconds(expiresIn) } : {}),
        ...(claimedAccountId
            ? { accountId: claimedAccountId }
            : inferredAccountId
              ? { accountId: inferredAccountId }
              : {}),
    };
}

async function postForm(endpoint: string, body: URLSearchParams): Promise<unknown> {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
        if (isRecord(payload)) {
            const errorCode = readString(payload['error']) ?? 'unknown';
            const errorDescription =
                readString(payload['error_description']) ?? `OpenAI request failed (${String(response.status)}).`;
            throw new Error(`${errorCode}: ${errorDescription}`);
        }

        throw new Error(`OpenAI request failed (${String(response.status)}).`);
    }

    return payload;
}

export interface OpenAIPkceStartResult {
    state: string;
    nonce: string;
    codeVerifier: string;
    authorizeUrl: string;
}

export interface OpenAIDeviceStartResult {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    intervalSeconds: number;
    expiresInSeconds: number;
}

export async function startOpenAIDeviceAuth(): Promise<OpenAIDeviceStartResult> {
    const payload = await postForm(
        OPENAI_OAUTH_DEVICE_CODE_URL,
        new URLSearchParams({
            client_id: OPENAI_OAUTH_CLIENT_ID,
            scope: 'openid profile offline_access',
        })
    );

    if (!isRecord(payload)) {
        throw new Error('Invalid OpenAI device auth payload.');
    }

    const deviceCode = readString(payload['device_code']);
    const userCode = readString(payload['user_code']);
    const verificationUri =
        readString(payload['verification_uri']) ??
        readString(payload['verification_uri_complete']) ??
        readString(payload['verificationUrl']);
    const intervalSeconds = typeof payload['interval'] === 'number' ? payload['interval'] : 5;
    const expiresInSeconds = typeof payload['expires_in'] === 'number' ? payload['expires_in'] : 900;

    if (!deviceCode || !userCode || !verificationUri) {
        throw new Error('OpenAI device auth payload is missing required fields.');
    }

    return {
        deviceCode,
        userCode,
        verificationUri,
        intervalSeconds,
        expiresInSeconds,
    };
}

export function startOpenAIPkceAuth(): OpenAIPkceStartResult {
    const state = createOpaque(24);
    const nonce = createOpaque(24);
    const codeVerifier = createOpaque(48);
    const codeChallenge = createPkceChallenge(codeVerifier);

    const authorizeUrl = new URL(OPENAI_OAUTH_AUTHORIZE_URL);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', OPENAI_OAUTH_CLIENT_ID);
    authorizeUrl.searchParams.set('redirect_uri', OPENAI_OAUTH_REDIRECT_URI);
    authorizeUrl.searchParams.set('scope', 'openid profile offline_access');
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('nonce', nonce);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    return {
        state,
        nonce,
        codeVerifier,
        authorizeUrl: authorizeUrl.toString(),
    };
}

export async function exchangeOpenAIAuthorizationCode(code: string, codeVerifier: string): Promise<OpenAITokenPayload> {
    const payload = await postForm(
        OPENAI_OAUTH_TOKEN_URL,
        new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: OPENAI_OAUTH_CLIENT_ID,
            redirect_uri: OPENAI_OAUTH_REDIRECT_URI,
            code_verifier: codeVerifier,
            code,
        })
    );

    return parseOpenAITokenPayload(payload);
}

export async function exchangeOpenAIDeviceCode(deviceCode: string): Promise<OpenAITokenPayload | null> {
    const response = await fetch(OPENAI_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            client_id: OPENAI_OAUTH_CLIENT_ID,
            device_code: deviceCode,
        }),
        signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
        if (isRecord(payload) && readString(payload['error']) === 'authorization_pending') {
            return null;
        }

        if (isRecord(payload) && readString(payload['error']) === 'expired_token') {
            throw new Error('expired_token: OpenAI device code expired.');
        }

        const errorDescription = isRecord(payload)
            ? (readString(payload['error_description']) ??
              `OpenAI device exchange failed (${String(response.status)}).`)
            : `OpenAI device exchange failed (${String(response.status)}).`;
        throw new Error(errorDescription);
    }

    return parseOpenAITokenPayload(payload);
}

export async function refreshOpenAIToken(refreshToken: string): Promise<OpenAITokenPayload> {
    const payload = await postForm(
        OPENAI_OAUTH_TOKEN_URL,
        new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: OPENAI_OAUTH_CLIENT_ID,
            refresh_token: refreshToken,
        })
    );

    return parseOpenAITokenPayload(payload);
}
