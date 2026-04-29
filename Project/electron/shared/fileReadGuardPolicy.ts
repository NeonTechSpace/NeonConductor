import type {
    FileReadGuardDecision,
    FileReadGuardFileKind,
    ProfileFileReadGuardSettings,
    ResolvedFileReadGuardPolicy,
} from '@/shared/contracts';

export const DEFAULT_FILE_READ_GUARD_MAX_TEXT_BYTES = 256 * 1024;
export const MAX_FILE_READ_GUARD_TEXT_BYTES = 5 * 1024 * 1024;

export const DEFAULT_FILE_READ_GUARD_ALLOWED_EXTENSIONS = [
    '.pdf',
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.txt',
    '.md',
    '.markdown',
    '.rst',
    '.adoc',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.php',
    '.py',
    '.rb',
    '.go',
    '.rs',
    '.java',
    '.kt',
    '.c',
    '.cc',
    '.cpp',
    '.h',
    '.hpp',
    '.cs',
    '.sh',
    '.ps1',
    '.bat',
    '.cmd',
    '.sql',
    '.json',
    '.jsonl',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.xml',
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.less',
    '.csv',
    '.tsv',
    '.graphql',
    '.gql',
    '.dockerfile',
] as const;

export const DEFAULT_FILE_READ_GUARD_BLOCKED_PATTERNS = [
    '.env',
    '.npmrc',
    '.pypirc',
    '.netrc',
    'id_rsa',
    'id_dsa',
    'id_ecdsa',
    'id_ed25519',
    'private_key',
    'private-key',
    'credential',
    'credentials',
    'secret',
    'secrets',
    'token',
    'tokens',
    'password',
    'passwd',
    '.pem',
    '.key',
    '.p12',
    '.pfx',
    'wallet',
    'keystore',
] as const;

export const DEFAULT_PROFILE_FILE_READ_GUARD_SETTINGS: ProfileFileReadGuardSettings = {
    additionalAllowedExtensions: [],
    additionalBlockedPatterns: [],
    allowSecretLikeTextFiles: false,
    allowUnknownUtf8Text: false,
    maxTextFileBytes: DEFAULT_FILE_READ_GUARD_MAX_TEXT_BYTES,
};

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function normalizeList(values: readonly string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))).sort();
}

export function normalizeFileReadGuardExtension(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) {
        return '';
    }
    return normalized.startsWith('.') ? normalized : `.${normalized}`;
}

export function normalizeProfileFileReadGuardSettings(
    settings: Partial<ProfileFileReadGuardSettings> | undefined
): ProfileFileReadGuardSettings {
    const maxTextFileBytes = Math.max(
        1,
        Math.min(
            MAX_FILE_READ_GUARD_TEXT_BYTES,
            Math.floor(settings?.maxTextFileBytes ?? DEFAULT_FILE_READ_GUARD_MAX_TEXT_BYTES)
        )
    );

    return {
        additionalAllowedExtensions: normalizeList(
            (settings?.additionalAllowedExtensions ?? []).map(normalizeFileReadGuardExtension)
        ),
        additionalBlockedPatterns: normalizeList(settings?.additionalBlockedPatterns ?? []),
        allowSecretLikeTextFiles: settings?.allowSecretLikeTextFiles === true,
        allowUnknownUtf8Text: settings?.allowUnknownUtf8Text === true,
        maxTextFileBytes,
    };
}

export function resolveFileReadGuardPolicy(
    settings: Partial<ProfileFileReadGuardSettings> | undefined
): ResolvedFileReadGuardPolicy {
    const normalized = normalizeProfileFileReadGuardSettings(settings);
    return {
        ...normalized,
        defaultAllowedExtensions: [...DEFAULT_FILE_READ_GUARD_ALLOWED_EXTENSIONS],
        defaultBlockedPatterns: [...DEFAULT_FILE_READ_GUARD_BLOCKED_PATTERNS],
    };
}

export function getFileReadGuardExtension(fileName: string): string {
    const normalizedName = fileName.trim().toLowerCase();
    if (normalizedName === 'dockerfile') {
        return '.dockerfile';
    }
    const lastDotIndex = normalizedName.lastIndexOf('.');
    return lastDotIndex < 0 ? '' : normalizedName.slice(lastDotIndex);
}

function getFileKind(extension: string): FileReadGuardFileKind {
    if (extension === '.pdf') {
        return 'pdf';
    }
    if (imageExtensions.has(extension)) {
        return 'image';
    }
    if (extension.length > 0) {
        return 'text';
    }
    return 'unknown';
}

function includesPattern(fileNameOrPath: string, patterns: readonly string[]): boolean {
    const normalized = fileNameOrPath.replaceAll('\\', '/').toLowerCase();
    const baseName = normalized.split('/').filter(Boolean).at(-1) ?? normalized;
    return patterns.some((pattern) => {
        const normalizedPattern = pattern.trim().toLowerCase();
        return (
            normalizedPattern.length > 0 &&
            (normalized.includes(normalizedPattern) || baseName.includes(normalizedPattern))
        );
    });
}

export function evaluateFileReadGuard(input: {
    fileNameOrPath: string;
    mimeType?: string;
    byteSize?: number;
    policy: ResolvedFileReadGuardPolicy;
    utf8Valid?: boolean;
}): FileReadGuardDecision {
    const extension = getFileReadGuardExtension(input.fileNameOrPath);
    const fileKind = getFileKind(extension);
    const allBlockedPatterns = [
        ...input.policy.defaultBlockedPatterns,
        ...input.policy.additionalBlockedPatterns,
    ];
    if (!input.policy.allowSecretLikeTextFiles && includesPattern(input.fileNameOrPath, allBlockedPatterns)) {
        return { allowed: false, reason: 'blocked_secret_pattern', fileKind, extension };
    }

    if (
        fileKind === 'text' &&
        input.byteSize !== undefined &&
        input.byteSize > input.policy.maxTextFileBytes
    ) {
        return {
            allowed: false,
            reason: 'blocked_size_limit',
            fileKind,
            extension,
            maxBytes: input.policy.maxTextFileBytes,
        };
    }

    if (input.utf8Valid !== undefined && !input.utf8Valid) {
        return { allowed: false, reason: 'blocked_invalid_utf8', fileKind, extension };
    }

    if (input.policy.additionalAllowedExtensions.includes(extension)) {
        return { allowed: true, reason: 'allowed_profile_extension', fileKind, extension };
    }

    if (input.policy.defaultAllowedExtensions.includes(extension)) {
        if (fileKind === 'image' && input.mimeType && !input.mimeType.startsWith('image/')) {
            return { allowed: false, reason: 'blocked_unsupported_mime', fileKind, extension };
        }
        return { allowed: true, reason: 'allowed_default_extension', fileKind, extension };
    }

    if (extension.length === 0 && input.policy.allowUnknownUtf8Text) {
        return { allowed: true, reason: 'allowed_unknown_utf8_text', fileKind: 'text', extension };
    }

    return { allowed: false, reason: 'blocked_disallowed_extension', fileKind, extension };
}

export function formatFileReadGuardDecisionMessage(fileName: string, decision: FileReadGuardDecision): string {
    switch (decision.reason) {
        case 'blocked_secret_pattern':
            return `"${fileName}" looks like a secret or credential file. Profile file-read settings can explicitly allow secret-like text files.`;
        case 'blocked_size_limit':
            return `"${fileName}" exceeds the ${String(Math.floor((decision.maxBytes ?? 0) / 1024))} KB text file limit.`;
        case 'blocked_invalid_utf8':
            return `"${fileName}" is not valid UTF-8 text.`;
        case 'blocked_unsupported_mime':
            return `"${fileName}" has an unsupported media type.`;
        case 'blocked_disallowed_extension':
            return `"${fileName}" is not in this profile's model-visible file read allowlist.`;
        default:
            return `"${fileName}" is allowed by this profile's file read policy.`;
    }
}
