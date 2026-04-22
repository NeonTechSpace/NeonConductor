import { getPersistence } from '@/app/backend/persistence/db';
import type { RegistryDiscoveryDiagnosticRecord } from '@/app/backend/persistence/types';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';

const registryDiagnosticScopes = ['global', 'workspace'] as const;
const registryDiscoveryAssetKinds = ['rules', 'skills'] as const;
const registryDiscoveryDiagnosticCodes = [
    'invalid_target_layout',
    'invalid_target_folder',
    'invalid_target_mode',
    'invalid_package_layout',
] as const;

function mapRegistryDiscoveryDiagnostic(row: {
    id: string;
    asset_kind: 'rules' | 'skills';
    scope: string;
    workspace_fingerprint: string | null;
    relative_path: string;
    severity: 'error';
    code: RegistryDiscoveryDiagnosticRecord['code'];
    message: string;
    created_at: string;
    updated_at: string;
}): RegistryDiscoveryDiagnosticRecord {
    return {
        id: row.id,
        assetKind: parseEnumValue(row.asset_kind, 'registry_discovery_diagnostics.asset_kind', registryDiscoveryAssetKinds),
        scope: parseEnumValue(row.scope, 'registry_discovery_diagnostics.scope', registryDiagnosticScopes),
        relativePath: row.relative_path,
        severity: row.severity,
        code: parseEnumValue(row.code, 'registry_discovery_diagnostics.code', registryDiscoveryDiagnosticCodes),
        message: row.message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class RegistryDiscoveryDiagnosticStore {
    async listByProfile(input: {
        profileId: string;
        scope: Extract<RegistryDiscoveryDiagnosticRecord['scope'], 'global' | 'workspace'>;
        workspaceFingerprint?: string;
    }): Promise<RegistryDiscoveryDiagnosticRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('registry_discovery_diagnostics')
            .select([
                'id',
                'asset_kind',
                'scope',
                'workspace_fingerprint',
                'relative_path',
                'severity',
                'code',
                'message',
                'created_at',
                'updated_at',
            ])
            .where('profile_id', '=', input.profileId)
            .where('scope', '=', input.scope)
            .where((eb) =>
                input.scope === 'workspace'
                    ? eb('workspace_fingerprint', '=', input.workspaceFingerprint ?? '')
                    : eb('workspace_fingerprint', 'is', null)
            )
            .orderBy('relative_path', 'asc')
            .execute();

        return rows.map((row) =>
            mapRegistryDiscoveryDiagnostic({
                ...row,
                asset_kind: row.asset_kind as 'rules' | 'skills',
                severity: row.severity as 'error',
                code: row.code as RegistryDiscoveryDiagnosticRecord['code'],
            })
        );
    }

    async replaceForScope(input: {
        profileId: string;
        scope: Extract<RegistryDiscoveryDiagnosticRecord['scope'], 'global' | 'workspace'>;
        workspaceFingerprint?: string;
        diagnostics: RegistryDiscoveryDiagnosticRecord[];
    }): Promise<void> {
        const { db } = getPersistence();
        await db
            .deleteFrom('registry_discovery_diagnostics')
            .where('profile_id', '=', input.profileId)
            .where('scope', '=', input.scope)
            .where((eb) =>
                input.scope === 'workspace'
                    ? eb('workspace_fingerprint', '=', input.workspaceFingerprint ?? '')
                    : eb('workspace_fingerprint', 'is', null)
            )
            .execute();

        if (input.diagnostics.length === 0) {
            return;
        }

        await db
            .insertInto('registry_discovery_diagnostics')
            .values(
                input.diagnostics.map((diagnostic) => ({
                    id: diagnostic.id,
                    profile_id: input.profileId,
                    asset_kind: diagnostic.assetKind,
                    scope: diagnostic.scope,
                    workspace_fingerprint: input.scope === 'workspace' ? (input.workspaceFingerprint ?? null) : null,
                    relative_path: diagnostic.relativePath,
                    severity: diagnostic.severity,
                    code: diagnostic.code,
                    message: diagnostic.message,
                    created_at: diagnostic.createdAt,
                    updated_at: diagnostic.updatedAt,
                }))
            )
            .execute();
    }
}

export const registryDiscoveryDiagnosticStore = new RegistryDiscoveryDiagnosticStore();
