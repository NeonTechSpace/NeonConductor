import { describe, expect, it } from 'vitest';

import {
    evaluateFileReadGuard,
    formatFileReadGuardDecisionMessage,
    resolveFileReadGuardPolicy,
} from '@/shared/fileReadGuardPolicy';

describe('fileReadGuardPolicy', () => {
    it('allows default readable file types and supported images', () => {
        const policy = resolveFileReadGuardPolicy(undefined);

        expect(evaluateFileReadGuard({ fileNameOrPath: 'notes.md', policy }).allowed).toBe(true);
        expect(evaluateFileReadGuard({ fileNameOrPath: 'image.webp', mimeType: 'image/webp', policy }).allowed).toBe(
            true
        );
        expect(evaluateFileReadGuard({ fileNameOrPath: 'manual.pdf', policy }).allowed).toBe(true);
    });

    it('blocks secret-like names even when their extension is readable', () => {
        const decision = evaluateFileReadGuard({
            fileNameOrPath: '.env',
            policy: resolveFileReadGuardPolicy(undefined),
            utf8Valid: true,
        });

        expect(decision).toMatchObject({
            allowed: false,
            reason: 'blocked_secret_pattern',
        });
        expect(formatFileReadGuardDecisionMessage('.env', decision)).toContain('secret or credential');
    });

    it('applies profile extension and unknown text overrides without disabling explicit block patterns', () => {
        const policy = resolveFileReadGuardPolicy({
            additionalAllowedExtensions: ['log'],
            additionalBlockedPatterns: ['prod-token'],
            allowSecretLikeTextFiles: false,
            allowUnknownUtf8Text: true,
            maxTextFileBytes: 256 * 1024,
        });

        expect(evaluateFileReadGuard({ fileNameOrPath: 'debug.log', policy, utf8Valid: true })).toMatchObject({
            allowed: true,
            reason: 'allowed_profile_extension',
        });
        expect(evaluateFileReadGuard({ fileNameOrPath: 'README', policy, utf8Valid: true })).toMatchObject({
            allowed: true,
            reason: 'allowed_unknown_utf8_text',
        });
        expect(evaluateFileReadGuard({ fileNameOrPath: 'prod-token.log', policy, utf8Valid: true })).toMatchObject({
            allowed: false,
            reason: 'blocked_secret_pattern',
        });
    });

    it('blocks oversized text files by profile limit', () => {
        const policy = resolveFileReadGuardPolicy({
            additionalAllowedExtensions: [],
            additionalBlockedPatterns: [],
            allowSecretLikeTextFiles: false,
            allowUnknownUtf8Text: false,
            maxTextFileBytes: 1024,
        });

        expect(evaluateFileReadGuard({ fileNameOrPath: 'big.txt', policy, byteSize: 1025 })).toMatchObject({
            allowed: false,
            reason: 'blocked_size_limit',
        });
    });
});

