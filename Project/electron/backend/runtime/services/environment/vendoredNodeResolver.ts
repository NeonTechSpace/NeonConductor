import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

import { resolveRuntimeAssetPath } from '@/app/main/runtime/assets';
import { resolveElectronRuntimeApi } from '@/app/main/runtime/electronRuntimeResolver';

import {
    resolveVendoredNodeTargetKey,
    vendoredNodeTargets,
    type VendoredNodeTargetKey,
} from '@/shared/tooling/vendoredNode';

export interface VendoredNodeRuntimeContext {
    platform: NodeJS.Platform;
    arch: string;
    isPackaged: boolean;
    appPath: string;
    resourcesPath?: string;
}

export interface ResolvedVendoredNode {
    available: boolean;
    targetKey?: VendoredNodeTargetKey;
    executableName?: 'node' | 'node.exe';
    executablePath?: string;
    reason?: 'unsupported_target' | 'missing_asset';
}

function readDefaultRuntimeContext(): VendoredNodeRuntimeContext {
    let isPackaged = false;
    let appPath = process.cwd();
    try {
        const electronApi = resolveElectronRuntimeApi();
        isPackaged = electronApi.app.isPackaged;
        appPath = electronApi.app.getAppPath();
    } catch {
        // Vendored tool resolution also runs in backend contract tests and CLI probes outside Electron.
    }

    return {
        platform: process.platform,
        arch: process.arch,
        isPackaged,
        appPath,
        resourcesPath: process.resourcesPath,
    };
}

export class VendoredNodeResolver {
    async resolve(runtimeContextOverrides: Partial<VendoredNodeRuntimeContext> = {}): Promise<ResolvedVendoredNode> {
        const runtimeContext = {
            ...readDefaultRuntimeContext(),
            ...runtimeContextOverrides,
        } satisfies VendoredNodeRuntimeContext;

        const targetKey = resolveVendoredNodeTargetKey({
            platform: runtimeContext.platform,
            arch: runtimeContext.arch,
        });
        if (!targetKey) {
            return {
                available: false,
                reason: 'unsupported_target',
            };
        }

        const target = vendoredNodeTargets[targetKey];
        const executablePath = resolveRuntimeAssetPath({
            isPackaged: runtimeContext.isPackaged,
            appPath: runtimeContext.appPath,
            relativePath: target.resourceRelativePath,
            ...(runtimeContext.resourcesPath ? { resourcesPath: runtimeContext.resourcesPath } : {}),
        });

        try {
            await access(executablePath, constants.F_OK);
        } catch {
            return {
                available: false,
                targetKey,
                executableName: target.executableName,
                executablePath,
                reason: 'missing_asset',
            };
        }

        return {
            available: true,
            targetKey,
            executableName: target.executableName,
            executablePath,
        };
    }
}

export const vendoredNodeResolver = new VendoredNodeResolver();
