import { describe, expect, it } from 'vitest';

import {
    parseMarketplaceAuthoredPackageMetadata,
    parseMarketplaceGeneratedCatalog,
} from '@/app/backend/runtime/contracts/parsers/marketplace';

function validSkillPackage(): Record<string, unknown> {
    return {
        kind: 'skill',
        slug: 'repo-review',
        version: '1.0.0',
        name: 'Repo Review',
        summary: 'Review repository changes against NeonConductor quality rules.',
        description: 'Validates the marketplace catalog contract.',
        tags: ['review', 'review', 'quality'],
        source: {
            repositoryUrl: 'https://github.com/NeonTechSpace/neonconductor-marketplace',
            relativePath: 'skills/repo-review',
        },
        artifact: {
            url: 'https://neontechspace.github.io/neonconductor-marketplace/artifacts/skills/repo-review-1.0.0.tgz',
            sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            sizeBytes: 1024,
        },
        compatibility: {
            neonVersionRange: '>=0.0.1 <1.0.0',
            requiredCapabilities: ['skills', 'skills'],
        },
        skill: {
            entryFile: 'skills/repo-review/SKILL.md',
        },
    };
}

function validModePackage(): Record<string, unknown> {
    return {
        kind: 'mode',
        slug: 'focused-implementer',
        version: '1.0.0',
        name: 'Focused Implementer',
        summary: 'A valid mode package.',
        source: {
            repositoryUrl: 'https://github.com/NeonTechSpace/neonconductor-marketplace',
            relativePath: 'modes/focused-implementer',
        },
        artifact: {
            url: 'https://neontechspace.github.io/neonconductor-marketplace/artifacts/modes/focused-implementer-1.0.0.tgz',
            sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
        compatibility: {
            neonVersionRange: '>=0.0.1 <1.0.0',
        },
        mode: {
            manifestFile: 'modes/focused-implementer/MODE.yaml',
        },
    };
}

function validMcpPackage(): Record<string, unknown> {
    return {
        kind: 'mcp',
        slug: 'local-files',
        version: '1.0.0',
        name: 'Local Files MCP',
        summary: 'A valid MCP package.',
        source: {
            repositoryUrl: 'https://github.com/NeonTechSpace/neonconductor-marketplace',
            relativePath: 'mcps/local-files',
        },
        artifact: {
            url: 'https://neontechspace.github.io/neonconductor-marketplace/artifacts/mcps/local-files-1.0.0.tgz',
            sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        },
        compatibility: {
            neonVersionRange: '>=0.0.1 <1.0.0',
        },
        mcp: {
            manifestFile: 'mcps/local-files/MCP.yaml',
            serverLabel: 'Local Files',
        },
    };
}

function validCatalog(): Record<string, unknown> {
    return {
        schemaVersion: 1,
        generatedAt: '2026-05-05T00:00:00.000Z',
        source: {
            repositoryUrl: 'https://github.com/NeonTechSpace/neonconductor-marketplace',
            commitSha: '0123456789abcdef0123456789abcdef01234567',
        },
        packages: [validSkillPackage(), validModePackage(), validMcpPackage()],
    };
}

function packageAt(catalog: Record<string, unknown>, index: number): Record<string, unknown> {
    const packages = catalog.packages;
    if (!Array.isArray(packages)) {
        throw new Error('Test fixture has no packages array.');
    }
    return packages[index] as Record<string, unknown>;
}

function nestedRecord(source: Record<string, unknown>, key: string): Record<string, unknown> {
    return source[key] as Record<string, unknown>;
}

describe('marketplace catalog parser', () => {
    it('parses a v1 generated catalog for skill, mode, and MCP packages', () => {
        const catalog = parseMarketplaceGeneratedCatalog(validCatalog());

        expect(catalog.schemaVersion).toBe(1);
        expect(catalog.packages.map((item) => item.kind)).toEqual(['skill', 'mode', 'mcp']);
        expect(catalog.packages[0]?.tags).toEqual(['review', 'quality']);
        expect(catalog.packages[0]?.compatibility.requiredCapabilities).toEqual(['skills']);
    });

    it('parses authored package metadata with the same package contract', () => {
        const authored = parseMarketplaceAuthoredPackageMetadata({
            schemaVersion: 1,
            metadata: validSkillPackage(),
        });

        expect(authored.metadata.kind).toBe('skill');
        expect(authored.metadata.slug).toBe('repo-review');
    });

    it('rejects unsupported schema versions', () => {
        const catalog = validCatalog();
        catalog.schemaVersion = 2;

        expect(() => parseMarketplaceGeneratedCatalog(catalog)).toThrow(/schemaVersion/u);
    });

    it('rejects duplicate package identities', () => {
        const catalog = validCatalog();
        catalog.packages = [validSkillPackage(), validSkillPackage()];

        expect(() => parseMarketplaceGeneratedCatalog(catalog)).toThrow(/duplicate package identity/u);
    });

    it('rejects invalid slugs, versions, hashes, URLs, and source paths', () => {
        const invalidCases: Array<{
            label: string;
            mutate: (catalog: Record<string, unknown>) => void;
            message: RegExp;
        }> = [
            {
                label: 'slug',
                mutate: (catalog) => {
                    packageAt(catalog, 0).slug = 'Repo Review';
                },
                message: /slug/u,
            },
            {
                label: 'version',
                mutate: (catalog) => {
                    packageAt(catalog, 0).version = '1';
                },
                message: /version/u,
            },
            {
                label: 'hash',
                mutate: (catalog) => {
                    nestedRecord(packageAt(catalog, 0), 'artifact').sha256 = 'abc';
                },
                message: /SHA-256/u,
            },
            {
                label: 'http URL',
                mutate: (catalog) => {
                    nestedRecord(packageAt(catalog, 0), 'artifact').url = 'http://example.com/package.tgz';
                },
                message: /HTTPS/u,
            },
            {
                label: 'credentialed URL',
                mutate: (catalog) => {
                    nestedRecord(packageAt(catalog, 0), 'source').repositoryUrl =
                        'https://user:password@example.com/repo';
                },
                message: /credentials/u,
            },
            {
                label: 'path escape',
                mutate: (catalog) => {
                    nestedRecord(packageAt(catalog, 0), 'source').relativePath = '../skills/repo-review';
                },
                message: /repository-relative/u,
            },
        ];

        for (const invalidCase of invalidCases) {
            const catalog = validCatalog();
            invalidCase.mutate(catalog);
            expect(() => parseMarketplaceGeneratedCatalog(catalog)).toThrow(invalidCase.message);
        }
    });

    it('rejects missing kind-specific package metadata', () => {
        const catalog = validCatalog();
        delete packageAt(catalog, 2).mcp;

        expect(() => parseMarketplaceGeneratedCatalog(catalog)).toThrow(/packages\[2\]\.mcp/u);
    });

    it('rejects invalid compatibility ranges', () => {
        const catalog = validCatalog();
        nestedRecord(packageAt(catalog, 0), 'compatibility').neonVersionRange = 'not a range';

        expect(() => parseMarketplaceGeneratedCatalog(catalog)).toThrow(/semantic version range/u);
    });
});
