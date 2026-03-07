export type SensitiveFieldCategory = 'person' | 'email' | 'organization' | 'account_id' | 'balance';

export interface PrivacyModeState {
    enabled: boolean;
}

const PRIVACY_MODE_STORAGE_KEY = 'neonconductor.privacy-mode.enabled';

const PERSON_PLACEHOLDERS = ['Avery Stone', 'Jordan Reed', 'Casey Brooks', 'Riley Hart'] as const;
const EMAIL_PLACEHOLDERS = [
    'avery.stone@example.test',
    'jordan.reed@example.test',
    'casey.brooks@example.test',
    'riley.hart@example.test',
] as const;
const ORGANIZATION_PLACEHOLDERS = ['Northwind Labs', 'Atlas Forge', 'Summit House', 'Brightline Studio'] as const;
const ACCOUNT_PREFIXES = ['acct_demo', 'acct_masked', 'acct_hidden', 'acct_private'] as const;
const BALANCE_PLACEHOLDERS = ['84.20 USD', '128.50 USD', '36.75 USD', '412.00 USD'] as const;

function hashString(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return hash;
}

function pickPlaceholder<T extends readonly string[]>(value: string, placeholders: T): T[number] {
    const index = hashString(value) % placeholders.length;
    const fallback = placeholders[0];
    if (fallback === undefined) {
        throw new Error('Privacy placeholders must not be empty.');
    }

    return placeholders[index] ?? fallback;
}

function formatAccountPlaceholder(value: string): string {
    const hash = hashString(value).toString(16).padStart(8, '0').slice(0, 8);
    const prefix = pickPlaceholder(value, ACCOUNT_PREFIXES);
    return `${prefix}_${hash}`;
}

export function readStoredPrivacyMode(): PrivacyModeState {
    if (typeof window === 'undefined') {
        return { enabled: false };
    }

    return {
        enabled: window.localStorage.getItem(PRIVACY_MODE_STORAGE_KEY) === 'true',
    };
}

export function persistPrivacyMode(state: PrivacyModeState): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(PRIVACY_MODE_STORAGE_KEY, state.enabled ? 'true' : 'false');
}

export function applyPrivacyMode(state: PrivacyModeState): void {
    if (typeof document === 'undefined') {
        return;
    }

    document.documentElement.dataset['privacyMode'] = state.enabled ? 'on' : 'off';
}

export function initializePrivacyMode(): void {
    applyPrivacyMode(readStoredPrivacyMode());
}

export function redactSensitiveValue(value: string, category: SensitiveFieldCategory): string {
    if (value.trim().length === 0) {
        return value;
    }

    if (category === 'person') {
        return pickPlaceholder(value, PERSON_PLACEHOLDERS);
    }

    if (category === 'email') {
        return pickPlaceholder(value, EMAIL_PLACEHOLDERS);
    }

    if (category === 'organization') {
        return pickPlaceholder(value, ORGANIZATION_PLACEHOLDERS);
    }

    if (category === 'balance') {
        return pickPlaceholder(value, BALANCE_PLACEHOLDERS);
    }

    return formatAccountPlaceholder(value);
}
