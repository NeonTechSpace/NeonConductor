import type { WorkspaceEnvironmentSnapshot } from '@/app/backend/runtime/contracts/types/runtime';

function formatProjectNodeExpectationSource(
    source: NonNullable<WorkspaceEnvironmentSnapshot['projectNodeExpectation']>['source']
): string {
    if (source === 'package_json_engines') {
        return 'package.json engines';
    }

    if (source === 'nvmrc') {
        return '.nvmrc';
    }

    if (source === 'node_version_file') {
        return '.node-version';
    }

    return 'workspace markers';
}

export function buildWorkspaceEnvironmentGuidance(
    snapshot: WorkspaceEnvironmentSnapshot,
    options?: {
        vendoredRipgrepAvailable?: boolean;
    }
): string {
    const shellLine =
        snapshot.platform === 'win32' && !snapshot.shellExecutable
            ? `Platform: ${snapshot.platform}. Windows shell could not be resolved.`
            : `Platform: ${snapshot.platform}. Shell family: ${snapshot.shellFamily}.${snapshot.shellExecutable ? ` Shell executable: ${snapshot.shellExecutable}.` : ''}`;
    const lines = [
        `Effective root: ${snapshot.workspaceRootPath}.`,
        shellLine,
    ];

    if (snapshot.baseWorkspaceRootPath) {
        lines.push(`Base workspace root: ${snapshot.baseWorkspaceRootPath}.`);
    }

    if (snapshot.effectivePreferences.vcs.family !== 'unknown') {
        lines.push(`Preferred VCS: ${snapshot.effectivePreferences.vcs.family}.`);
    }

    if (snapshot.effectivePreferences.packageManager.family !== 'unknown') {
        lines.push(`Preferred package manager: ${snapshot.effectivePreferences.packageManager.family}.`);
    }

    if (snapshot.vendoredNode.available) {
        lines.push(
            `Vendored code runtime: Node v${snapshot.vendoredNode.version}.${snapshot.vendoredNode.targetKey ? ` Target: ${snapshot.vendoredNode.targetKey}.` : ''}`
        );
    } else if (snapshot.vendoredNode.reason === 'unsupported_target') {
        lines.push(
            `Vendored code runtime: Node v${snapshot.vendoredNode.version}. Status: unavailable for this platform/architecture.`
        );
    } else {
        lines.push(
            `Vendored code runtime: Node v${snapshot.vendoredNode.version}. Status: packaged/runtime asset missing.`
        );
    }

    if (snapshot.projectNodeExpectation?.source === 'node_workspace_heuristic') {
        lines.push('Workspace looks Node/TypeScript-oriented, but no explicit root Node version expectation was found.');
    } else if (snapshot.projectNodeExpectation?.rawValue) {
        lines.push(
            `Workspace Node expectation: "${snapshot.projectNodeExpectation.rawValue}" from ${formatProjectNodeExpectationSource(snapshot.projectNodeExpectation.source)}.`
        );
    }

    if (snapshot.projectNodeExpectation?.satisfiesVendoredNode === true) {
        lines.push('Vendored Node satisfies that expectation.');
    } else if (snapshot.projectNodeExpectation?.satisfiesVendoredNode === false) {
        lines.push('Vendored Node does not satisfy that expectation.');
    }

    if (options?.vendoredRipgrepAvailable) {
        lines.push(
            'For ordinary workspace text search, prefer the native search_files tool. If shell-based search is specifically needed, prefer rg and rg --files.'
        );
    }

    return [...lines, ...snapshot.notes].join(' ');
}
