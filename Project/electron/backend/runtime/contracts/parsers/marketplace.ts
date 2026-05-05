import { validRange } from 'semver';

import {
    createParser,
    readArray,
    readEnumValue,
    readObject,
    readOptionalNumber,
    readOptionalString,
    readString,
    readStringArray,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import {
    marketplaceCatalogSchemaVersion,
    marketplacePackageKinds,
    type MarketplaceAuthoredPackageMetadata,
    type MarketplaceCatalogSource,
    type MarketplaceGeneratedCatalog,
    type MarketplaceMcpPackageMetadata,
    type MarketplaceModePackageMetadata,
    type MarketplacePackageArtifact,
    type MarketplacePackageCompatibility,
    type MarketplacePackageMetadata,
    type MarketplacePackageSource,
    type MarketplaceSkillPackageMetadata,
} from '@/app/backend/runtime/contracts/types/marketplace';

const sha256Pattern = /^[a-f0-9]{64}$/u;
const commitShaPattern = /^[a-f0-9]{7,64}$/u;

const catalogKeys = new Set(['schemaVersion', 'generatedAt', 'source', 'packages']);
const authoredMetadataKeys = new Set(['schemaVersion', 'metadata']);
const sourceKeys = new Set(['repositoryUrl', 'relativePath']);
const catalogSourceKeys = new Set(['repositoryUrl', 'commitSha']);
const artifactKeys = new Set(['url', 'sha256', 'sizeBytes']);
const compatibilityKeys = new Set(['neonVersionRange', 'requiredCapabilities']);
const skillKeys = new Set(['entryFile']);
const modeKeys = new Set(['manifestFile']);
const mcpKeys = new Set(['manifestFile', 'serverLabel']);
const basePackageKeys = [
    'kind',
    'slug',
    'version',
    'name',
    'summary',
    'description',
    'tags',
    'source',
    'artifact',
    'compatibility',
] as const;

function assertAllowedKeys(source: Record<string, unknown>, allowedKeys: Set<string>, field: string): void {
    for (const key of Object.keys(source)) {
        if (!allowedKeys.has(key)) {
            throw new Error(`Invalid "${field}.${key}": unexpected field.`);
        }
    }
}

function readSchemaVersion(value: unknown, field: string): typeof marketplaceCatalogSchemaVersion {
    if (value !== marketplaceCatalogSchemaVersion) {
        throw new Error(`Invalid "${field}": expected ${String(marketplaceCatalogSchemaVersion)}.`);
    }
    return marketplaceCatalogSchemaVersion;
}

function readSlug(value: unknown, field: string): string {
    const slug = readString(value, field);
    const segments = slug.split('-');
    if (
        segments.length === 0 ||
        segments.some(
            (segment) =>
                segment.length === 0 || Array.from(segment).some((character) => !isLowerAlphaNumeric(character))
        )
    ) {
        throw new Error(`Invalid "${field}": expected lowercase kebab-case slug.`);
    }
    return slug;
}

function readSemver(value: unknown, field: string): string {
    const version = readString(value, field);
    if (!isSemanticVersion(version)) {
        throw new Error(`Invalid "${field}": expected semantic version.`);
    }
    return version;
}

function isLowerAlphaNumeric(character: string): boolean {
    return (character >= 'a' && character <= 'z') || (character >= '0' && character <= '9');
}

function isAsciiAlphaNumericHyphen(character: string): boolean {
    return (
        (character >= 'a' && character <= 'z') ||
        (character >= 'A' && character <= 'Z') ||
        (character >= '0' && character <= '9') ||
        character === '-'
    );
}

function isNumericIdentifier(value: string): boolean {
    if (value.length === 0) {
        return false;
    }
    if (value.length > 1 && value.startsWith('0')) {
        return false;
    }
    return Array.from(value).every((character) => character >= '0' && character <= '9');
}

function isSemverIdentifierList(value: string, allowNumericLeadingZero: boolean): boolean {
    const identifiers = value.split('.');
    return identifiers.every((identifier) => {
        if (identifier.length === 0) {
            return false;
        }
        if (Array.from(identifier).some((character) => !isAsciiAlphaNumericHyphen(character))) {
            return false;
        }
        if (
            !allowNumericLeadingZero &&
            Array.from(identifier).every((character) => character >= '0' && character <= '9')
        ) {
            return identifier.length === 1 || !identifier.startsWith('0');
        }
        return true;
    });
}

function isSemanticVersion(value: string): boolean {
    const buildSeparatorIndex = value.indexOf('+');
    const withoutBuild = buildSeparatorIndex === -1 ? value : value.slice(0, buildSeparatorIndex);
    const buildMetadata = buildSeparatorIndex === -1 ? undefined : value.slice(buildSeparatorIndex + 1);
    if (buildMetadata !== undefined && !isSemverIdentifierList(buildMetadata, true)) {
        return false;
    }

    const prereleaseSeparatorIndex = withoutBuild.indexOf('-');
    const coreVersion =
        prereleaseSeparatorIndex === -1 ? withoutBuild : withoutBuild.slice(0, prereleaseSeparatorIndex);
    const prerelease = prereleaseSeparatorIndex === -1 ? undefined : withoutBuild.slice(prereleaseSeparatorIndex + 1);
    if (prerelease !== undefined && !isSemverIdentifierList(prerelease, false)) {
        return false;
    }

    const coreIdentifiers = coreVersion.split('.');
    return coreIdentifiers.length === 3 && coreIdentifiers.every((identifier) => isNumericIdentifier(identifier));
}

function readSha256(value: unknown, field: string): string {
    const sha256 = readString(value, field);
    if (!sha256Pattern.test(sha256)) {
        throw new Error(`Invalid "${field}": expected lowercase SHA-256 digest.`);
    }
    return sha256;
}

function readCommitSha(value: unknown, field: string): string {
    const commitSha = readString(value, field);
    if (!commitShaPattern.test(commitSha)) {
        throw new Error(`Invalid "${field}": expected Git commit SHA.`);
    }
    return commitSha;
}

function readHttpsUrl(value: unknown, field: string): string {
    const text = readString(value, field);
    let parsed: URL;
    try {
        parsed = new URL(text);
    } catch (error) {
        throw new Error(`Invalid "${field}": expected URL.`, { cause: error });
    }

    if (parsed.protocol !== 'https:') {
        throw new Error(`Invalid "${field}": expected HTTPS URL.`);
    }
    if (parsed.username || parsed.password) {
        throw new Error(`Invalid "${field}": URL credentials are not allowed.`);
    }

    return text;
}

function readRelativeCatalogPath(value: unknown, field: string): string {
    const relativePath = readString(value, field);
    const segments = relativePath.split('/');
    if (
        relativePath.includes('\\') ||
        relativePath.startsWith('/') ||
        /^[A-Za-z]:/u.test(relativePath) ||
        segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
    ) {
        throw new Error(`Invalid "${field}": expected repository-relative path.`);
    }

    return relativePath;
}

function readOptionalUniqueStringArray(value: unknown, field: string): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    const entries = readStringArray(value, field);
    const uniqueEntries = Array.from(new Set(entries));
    return uniqueEntries.length > 0 ? uniqueEntries : undefined;
}

function readOptionalDescription(value: unknown, field: string): string | undefined {
    const description = readOptionalString(value, field);
    return description ? description.replace(/\r\n?/gu, '\n') : undefined;
}

function readOptionalPositiveInteger(value: unknown, field: string): number | undefined {
    const number = readOptionalNumber(value, field);
    if (number === undefined) {
        return undefined;
    }
    if (!Number.isInteger(number) || number <= 0) {
        throw new Error(`Invalid "${field}": expected positive integer.`);
    }
    return number;
}

function readCatalogSource(value: unknown, field: string): MarketplaceCatalogSource {
    const source = readObject(value, field);
    assertAllowedKeys(source, catalogSourceKeys, field);

    return {
        repositoryUrl: readHttpsUrl(source.repositoryUrl, `${field}.repositoryUrl`),
        commitSha: readCommitSha(source.commitSha, `${field}.commitSha`),
    };
}

function readPackageSource(value: unknown, field: string): MarketplacePackageSource {
    const source = readObject(value, field);
    assertAllowedKeys(source, sourceKeys, field);

    return {
        repositoryUrl: readHttpsUrl(source.repositoryUrl, `${field}.repositoryUrl`),
        relativePath: readRelativeCatalogPath(source.relativePath, `${field}.relativePath`),
    };
}

function readArtifact(value: unknown, field: string): MarketplacePackageArtifact {
    const source = readObject(value, field);
    assertAllowedKeys(source, artifactKeys, field);
    const sizeBytes = readOptionalPositiveInteger(source.sizeBytes, `${field}.sizeBytes`);

    return {
        url: readHttpsUrl(source.url, `${field}.url`),
        sha256: readSha256(source.sha256, `${field}.sha256`),
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    };
}

function readCompatibility(value: unknown, field: string): MarketplacePackageCompatibility {
    const source = readObject(value, field);
    assertAllowedKeys(source, compatibilityKeys, field);
    const neonVersionRange = readString(source.neonVersionRange, `${field}.neonVersionRange`);
    if (!validRange(neonVersionRange)) {
        throw new Error(`Invalid "${field}.neonVersionRange": expected semantic version range.`);
    }
    const requiredCapabilities = readOptionalUniqueStringArray(
        source.requiredCapabilities,
        `${field}.requiredCapabilities`
    );

    return {
        neonVersionRange,
        ...(requiredCapabilities ? { requiredCapabilities } : {}),
    };
}

function readSkillMetadata(
    source: Record<string, unknown>,
    field: string
): Pick<MarketplaceSkillPackageMetadata, 'skill'> {
    const skillSource = readObject(source.skill, `${field}.skill`);
    assertAllowedKeys(skillSource, skillKeys, `${field}.skill`);
    return {
        skill: {
            entryFile: readRelativeCatalogPath(skillSource.entryFile, `${field}.skill.entryFile`),
        },
    };
}

function readModeMetadata(
    source: Record<string, unknown>,
    field: string
): Pick<MarketplaceModePackageMetadata, 'mode'> {
    const modeSource = readObject(source.mode, `${field}.mode`);
    assertAllowedKeys(modeSource, modeKeys, `${field}.mode`);
    return {
        mode: {
            manifestFile: readRelativeCatalogPath(modeSource.manifestFile, `${field}.mode.manifestFile`),
        },
    };
}

function readMcpMetadata(source: Record<string, unknown>, field: string): Pick<MarketplaceMcpPackageMetadata, 'mcp'> {
    const mcpSource = readObject(source.mcp, `${field}.mcp`);
    assertAllowedKeys(mcpSource, mcpKeys, `${field}.mcp`);
    return {
        mcp: {
            manifestFile: readRelativeCatalogPath(mcpSource.manifestFile, `${field}.mcp.manifestFile`),
            serverLabel: readString(mcpSource.serverLabel, `${field}.mcp.serverLabel`),
        },
    };
}

function readPackageMetadata(value: unknown, field: string): MarketplacePackageMetadata {
    const source = readObject(value, field);
    const kind = readEnumValue(source.kind, `${field}.kind`, marketplacePackageKinds);
    assertAllowedKeys(source, new Set([...basePackageKeys, kind]), field);

    const base = {
        kind,
        slug: readSlug(source.slug, `${field}.slug`),
        version: readSemver(source.version, `${field}.version`),
        name: readString(source.name, `${field}.name`),
        summary: readString(source.summary, `${field}.summary`),
        ...(() => {
            const description = readOptionalDescription(source.description, `${field}.description`);
            return description ? { description } : {};
        })(),
        ...(() => {
            const tags = readOptionalUniqueStringArray(source.tags, `${field}.tags`);
            return tags ? { tags } : {};
        })(),
        source: readPackageSource(source.source, `${field}.source`),
        artifact: readArtifact(source.artifact, `${field}.artifact`),
        compatibility: readCompatibility(source.compatibility, `${field}.compatibility`),
    };

    if (kind === 'skill') {
        return {
            ...base,
            kind,
            ...readSkillMetadata(source, field),
        };
    }
    if (kind === 'mode') {
        return {
            ...base,
            kind,
            ...readModeMetadata(source, field),
        };
    }
    return {
        ...base,
        kind,
        ...readMcpMetadata(source, field),
    };
}

function readGeneratedAt(value: unknown): string {
    const generatedAt = readString(value, 'generatedAt');
    if (!Number.isFinite(Date.parse(generatedAt))) {
        throw new Error('Invalid "generatedAt": expected ISO timestamp.');
    }
    return generatedAt;
}

function assertUniquePackageIdentities(packages: MarketplacePackageMetadata[]): void {
    const packageIdentities = new Set<string>();
    for (const item of packages) {
        const identity = `${item.kind}:${item.slug}:${item.version}`;
        if (packageIdentities.has(identity)) {
            throw new Error(`Invalid "packages": duplicate package identity "${identity}".`);
        }
        packageIdentities.add(identity);
    }
}

export function parseMarketplaceGeneratedCatalog(input: unknown): MarketplaceGeneratedCatalog {
    const source = readObject(input, 'input');
    assertAllowedKeys(source, catalogKeys, 'input');
    const packages = readArray(source.packages, 'packages').map((entry, index) =>
        readPackageMetadata(entry, `packages[${String(index)}]`)
    );
    assertUniquePackageIdentities(packages);

    return {
        schemaVersion: readSchemaVersion(source.schemaVersion, 'schemaVersion'),
        generatedAt: readGeneratedAt(source.generatedAt),
        source: readCatalogSource(source.source, 'source'),
        packages,
    };
}

export function parseMarketplaceAuthoredPackageMetadata(input: unknown): MarketplaceAuthoredPackageMetadata {
    const source = readObject(input, 'input');
    assertAllowedKeys(source, authoredMetadataKeys, 'input');

    return {
        schemaVersion: readSchemaVersion(source.schemaVersion, 'schemaVersion'),
        metadata: readPackageMetadata(source.metadata, 'metadata'),
    };
}

export const marketplaceGeneratedCatalogSchema = createParser(parseMarketplaceGeneratedCatalog);
export const marketplaceAuthoredPackageMetadataSchema = createParser(parseMarketplaceAuthoredPackageMetadata);
