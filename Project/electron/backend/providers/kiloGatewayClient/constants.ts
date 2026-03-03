export const DEFAULT_KILO_API_BASE_URL = 'https://api.kilo.ai';
export const DEFAULT_KILO_GATEWAY_BASE_URL = 'https://api.kilo.ai/api/gateway';

export const KILO_API_BASE_URL = process.env['KILO_API_BASE_URL']?.trim() || DEFAULT_KILO_API_BASE_URL;
export const KILO_GATEWAY_BASE_URL = process.env['KILO_GATEWAY_BASE_URL']?.trim() || DEFAULT_KILO_GATEWAY_BASE_URL;

export const KILO_GATEWAY_TIMEOUT_MS = 15_000;

export const HEADER_ORGANIZATION_ID = 'X-KiloCode-OrganizationId';
export const HEADER_MODE = 'x-kilocode-mode';
export const HEADER_EDITOR_NAME = 'X-KILOCODE-EDITORNAME';

export const DEFAULT_EDITOR_NAME = 'NeonConductor';
export const DEFAULT_CLIENT_VERSION = 'p2b';
