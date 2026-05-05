export const marketplaceCatalogSchemaVersion = 1 as const;

export const marketplacePackageKinds = ['skill', 'mode', 'mcp'] as const;
export type MarketplacePackageKind = (typeof marketplacePackageKinds)[number];

export interface MarketplaceCatalogSource {
    repositoryUrl: string;
    commitSha: string;
}

export interface MarketplacePackageSource {
    repositoryUrl: string;
    relativePath: string;
}

export interface MarketplacePackageArtifact {
    url: string;
    sha256: string;
    sizeBytes?: number;
}

export interface MarketplacePackageCompatibility {
    neonVersionRange: string;
    requiredCapabilities?: string[];
}

export interface MarketplacePackageBaseMetadata {
    kind: MarketplacePackageKind;
    slug: string;
    version: string;
    name: string;
    summary: string;
    description?: string;
    tags?: string[];
    source: MarketplacePackageSource;
    artifact: MarketplacePackageArtifact;
    compatibility: MarketplacePackageCompatibility;
}

export interface MarketplaceSkillPackageMetadata extends MarketplacePackageBaseMetadata {
    kind: 'skill';
    skill: {
        entryFile: string;
    };
}

export interface MarketplaceModePackageMetadata extends MarketplacePackageBaseMetadata {
    kind: 'mode';
    mode: {
        manifestFile: string;
    };
}

export interface MarketplaceMcpPackageMetadata extends MarketplacePackageBaseMetadata {
    kind: 'mcp';
    mcp: {
        manifestFile: string;
        serverLabel: string;
    };
}

export type MarketplacePackageMetadata =
    | MarketplaceSkillPackageMetadata
    | MarketplaceModePackageMetadata
    | MarketplaceMcpPackageMetadata;

export interface MarketplaceAuthoredPackageMetadata {
    schemaVersion: typeof marketplaceCatalogSchemaVersion;
    metadata: MarketplacePackageMetadata;
}

export interface MarketplaceGeneratedCatalog {
    schemaVersion: typeof marketplaceCatalogSchemaVersion;
    generatedAt: string;
    source: MarketplaceCatalogSource;
    packages: MarketplacePackageMetadata[];
}
