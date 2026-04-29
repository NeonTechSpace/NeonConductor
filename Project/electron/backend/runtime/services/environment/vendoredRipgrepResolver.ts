import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

import { resolveRuntimeAssetPath } from '@/app/main/runtime/assets';
import { app } from '@/app/main/runtime/electronApi';

import {
    resolveVendoredRipgrepTargetKey,
    vendoredRipgrepTargets,
    type VendoredRipgrepTargetKey,
} from '@/shared/tooling/vendoredRipgrep';

export interface VendoredRipgrepRuntimeContext {
    platform: NodeJS.Platform;
    arch: string;
    isPackaged: boolean;
    appPath: string;
    resourcesPath?: string;
}

export interface ResolvedVendoredRipgrep {
    available: boolean;
    targetKey?: VendoredRipgrepTargetKey;
    executableName?: 'rg' | 'rg.exe';
    executablePath?: string;
    reason?: 'unsupported_target' | 'missing_asset';
}

function readDefaultRuntimeContext(): VendoredRipgrepRuntimeContext {
    return {
        platform: process.platform,
        arch: process.arch,
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
    };
}

export class VendoredRipgrepResolver {
    async resolve(
        runtimeContextOverrides: Partial<VendoredRipgrepRuntimeContext> = {}
    ): Promise<ResolvedVendoredRipgrep> {
        const runtimeContext = {
            ...readDefaultRuntimeContext(),
            ...runtimeContextOverrides,
        } satisfies VendoredRipgrepRuntimeContext;

        const targetKey = resolveVendoredRipgrepTargetKey({
            platform: runtimeContext.platform,
            arch: runtimeContext.arch,
        });
        if (!targetKey) {
            return {
                available: false,
                reason: 'unsupported_target',
            };
        }

        const target = vendoredRipgrepTargets[targetKey];
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

export const vendoredRipgrepResolver = new VendoredRipgrepResolver();
