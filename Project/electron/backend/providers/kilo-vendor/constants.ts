// Adapted from Kilo-Org/kilocode packages/kilo-gateway/src/api/constants.ts
export const ENV_KILO_API_URL = 'KILO_API_URL';
export const DEFAULT_KILO_API_URL = 'https://api.kilo.ai';
export const KILO_API_BASE = process.env[ENV_KILO_API_URL] ?? DEFAULT_KILO_API_URL;
export const KILO_GATEWAY_BASE = `${KILO_API_BASE}/api/gateway`;
export const MODELS_FETCH_TIMEOUT_MS = 10_000;

export const HEADER_ORGANIZATION_ID = 'X-KiloCode-OrganizationId';
export const HEADER_MODE = 'x-kilocode-mode';
export const HEADER_EDITOR_NAME = 'X-KILOCODE-EDITORNAME';
export const DEFAULT_EDITOR_NAME = 'NeonConductor';
