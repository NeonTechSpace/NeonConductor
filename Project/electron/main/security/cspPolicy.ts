/**
 * Content Security Policy (CSP) configuration module.
 *
 * This module provides a centralized, typed, and environment-aware CSP setup
 * for the Electron app. All CSP modifications should be made here.
 *
 * ## How CSP Works in This App
 * - In production: CSP is enforced via HTTP headers injected in main.ts
 * - The header-based CSP is the authoritative source of truth
 *
 * ## Common Modifications
 * - To allow an external API: add its origin to `connect-src`
 * - To allow images from a CDN: add its origin to `img-src`
 * - To allow fonts from a CDN: add its origin to `font-src`
 *
 * ## Security Notes
 * - Avoid 'unsafe-eval' unless absolutely necessary (breaks CSP protections)
 * - 'unsafe-inline' for styles is a pragmatic choice for React/Tailwind setups
 * - Always prefer explicit origins over wildcards
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * CSP directive names.
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy
 */
export type CspDirective =
    | 'default-src'
    | 'script-src'
    | 'style-src'
    | 'img-src'
    | 'font-src'
    | 'connect-src'
    | 'media-src'
    | 'object-src'
    | 'frame-src'
    | 'frame-ancestors'
    | 'base-uri'
    | 'form-action'
    | 'worker-src';

/**
 * A CSP policy represented as a map of directives to their allowed sources.
 */
export type CspPolicy = Partial<Record<CspDirective, string[]>>;

function policyDirectiveEntries(policy: CspPolicy): ReadonlyArray<readonly [CspDirective, string[]]> {
    return [
        ['default-src', policy['default-src'] ?? []],
        ['script-src', policy['script-src'] ?? []],
        ['style-src', policy['style-src'] ?? []],
        ['img-src', policy['img-src'] ?? []],
        ['font-src', policy['font-src'] ?? []],
        ['connect-src', policy['connect-src'] ?? []],
        ['media-src', policy['media-src'] ?? []],
        ['object-src', policy['object-src'] ?? []],
        ['frame-src', policy['frame-src'] ?? []],
        ['frame-ancestors', policy['frame-ancestors'] ?? []],
        ['base-uri', policy['base-uri'] ?? []],
        ['form-action', policy['form-action'] ?? []],
        ['worker-src', policy['worker-src'] ?? []],
    ];
}

// ---------------------------------------------------------------------------
// Policy Definitions
// ---------------------------------------------------------------------------

/**
 * Base CSP policy shared between dev and prod.
 * This defines the most restrictive common baseline.
 */
const basePolicy: CspPolicy = {
    // Default fallback for any directive not explicitly set
    'default-src': ["'self'"],

    // Scripts: only allow same-origin scripts (bundled JS)
    'script-src': ["'self'"],

    // Styles: same-origin + inline styles (required for Tailwind/React)
    'style-src': ["'self'", "'unsafe-inline'"],

    // Images: same-origin + data URIs + route-served workspace-root icons
    'img-src': ["'self'", 'data:', 'neon-workspace-icon:'],

    // Fonts: same-origin only (bundled local fonts)
    'font-src': ["'self'"],

    // Connections (fetch, XHR, WebSocket): same-origin for tRPC IPC
    'connect-src': ["'self'"],

    // Media (audio, video): same-origin only
    'media-src': ["'self'"],

    // Plugins (Flash, Java, etc.): completely disabled
    'object-src': ["'none'"],

    // Iframes: same-origin only (restrict embedded content)
    'frame-src': ["'self'"],

    // Prevent this app from being embedded in iframes elsewhere
    'frame-ancestors': ["'none'"],

    // Restrict <base> tag to same-origin
    'base-uri': ["'self'"],

    // Form submissions: same-origin only
    'form-action': ["'self'"],

    // Web workers: same-origin only
    'worker-src': ["'self'"],
};

/**
 * Options for building CSP.
 */
export interface CspOptions {
    /**
     * Optional dev server URL (e.g., Vite's VITE_DEV_SERVER_URL).
     * Used to dynamically allow the correct dev server origin and HMR WebSocket.
     */
    devServerUrl?: string;
}

/**
 * Development-specific CSP additions.
 * These loosen restrictions to allow Vite dev server features like HMR.
 */
function getDevAdditions(devServerUrl?: string): CspPolicy {
    const connectSrc = [
        // Allow Vite HMR WebSocket connections (common dev hosts)
        'ws://localhost:*',
        'http://localhost:*',
        'ws://127.0.0.1:*',
        'http://127.0.0.1:*',
    ];

    if (devServerUrl) {
        try {
            const parsed = new URL(devServerUrl);
            const origin = parsed.origin;
            const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsOrigin = `${wsProtocol}//${parsed.host}`;

            connectSrc.push(origin, wsOrigin);
        } catch {
            // Ignore invalid devServerUrl; fall back to localhost allowances
        }
    }

    return {
        'connect-src': connectSrc,
        // Allow Vite to inject inline scripts for HMR
        // Note: This weakens security but is necessary for dev experience
        'script-src': ["'unsafe-inline'", "'unsafe-eval'"],
    };
}

// ---------------------------------------------------------------------------
// Policy Builder
// ---------------------------------------------------------------------------

/**
 * Merges base policy with environment-specific additions.
 */
function mergePolicy(base: CspPolicy, additions: CspPolicy): CspPolicy {
    const merged = new Map<CspDirective, string[]>();

    for (const [directive, sources] of policyDirectiveEntries(base)) {
        merged.set(directive, [...sources]);
    }

    for (const [directive, sources] of policyDirectiveEntries(additions)) {
        if (sources.length === 0) {
            continue;
        }

        const existing = merged.get(directive) ?? [];
        merged.set(directive, [...existing, ...sources]);
    }

    return {
        'default-src': merged.get('default-src') ?? [],
        'script-src': merged.get('script-src') ?? [],
        'style-src': merged.get('style-src') ?? [],
        'img-src': merged.get('img-src') ?? [],
        'font-src': merged.get('font-src') ?? [],
        'connect-src': merged.get('connect-src') ?? [],
        'media-src': merged.get('media-src') ?? [],
        'object-src': merged.get('object-src') ?? [],
        'frame-src': merged.get('frame-src') ?? [],
        'frame-ancestors': merged.get('frame-ancestors') ?? [],
        'base-uri': merged.get('base-uri') ?? [],
        'form-action': merged.get('form-action') ?? [],
        'worker-src': merged.get('worker-src') ?? [],
    };
}

/**
 * Serializes a CSP policy object into a header string.
 *
 * @example
 * // Returns: "default-src 'self'; script-src 'self'"
 * serializePolicy({ 'default-src': ["'self'"], 'script-src': ["'self'"] })
 */
function serializePolicy(policy: CspPolicy): string {
    return Object.entries(policy)
        .flatMap(([directive, sources]) => {
            if (sources.length === 0) {
                return [];
            }
            return [`${directive} ${sources.join(' ')}`];
        })
        .join('; ');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type CspEnvironment = 'dev' | 'prod';

/**
 * Builds the complete CSP policy for the given environment.
 *
 * @param env - 'dev' for development mode, 'prod' for production
 * @param options - Optional configuration (e.g., dev server URL)
 * @returns The CSP policy object
 */
export function buildCspPolicy(env: CspEnvironment, options: CspOptions = {}): CspPolicy {
    if (env === 'dev') {
        return mergePolicy(basePolicy, getDevAdditions(options.devServerUrl));
    }

    return { ...basePolicy };
}

/**
 * Gets the CSP header string for the given environment.
 * This is the main function to use when setting the CSP header.
 *
 * @param env - 'dev' for development mode, 'prod' for production
 * @param options - Optional configuration (e.g., dev server URL)
 * @returns The complete CSP header value as a string
 *
 * @example
 * // In main.ts:
 * const cspHeader = getCspHeader(isDev ? 'dev' : 'prod');
 */
export function getCspHeader(env: CspEnvironment, options: CspOptions = {}): string {
    const policy = buildCspPolicy(env, options);
    return serializePolicy(policy);
}

/**
 * Gets the CSP policy object for inspection or debugging.
 * Useful for logging or testing what directives are active.
 *
 * @param env - 'dev' for development mode, 'prod' for production
 * @param options - Optional configuration (e.g., dev server URL)
 * @returns The CSP policy object
 */
export function getCspPolicy(env: CspEnvironment, options: CspOptions = {}): CspPolicy {
    return buildCspPolicy(env, options);
}
