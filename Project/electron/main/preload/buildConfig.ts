import { builtinModules } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { LibraryFormats, Plugin, UserConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import { preloadBundleUsesUnsupportedModuleSyntax } from '../window/preloadBundleSyntax';

const sandboxedPreloadFormats: LibraryFormats[] = ['cjs'];
const builtinExternalModules = builtinModules.filter((moduleName) => !moduleName.startsWith('_')).flatMap((moduleName) => [
    moduleName,
    `node:${moduleName}`,
]);

function createSandboxedPreloadAssertionPlugin(bundleFileName: string, outDir: string): Plugin {
    return {
        name: `assert-sandboxed-preload-${bundleFileName}`,
        closeBundle() {
            const bundlePath = path.resolve(process.cwd(), outDir, bundleFileName);
            if (!existsSync(bundlePath)) {
                throw new Error(`Sandboxed preload bundle "${bundleFileName}" was not emitted at "${bundlePath}".`);
            }

            const bundleSource = readFileSync(bundlePath, 'utf8');
            if (preloadBundleUsesUnsupportedModuleSyntax(bundleSource)) {
                throw new Error(
                    `Sandboxed preload bundle "${bundleFileName}" contains top-level ESM syntax and cannot run under Electron sandbox preload execution.`
                );
            }
        },
    };
}

export function createPreloadBuildConfig(
    entry: string,
    outputFileName: string,
    options?: { outDir?: string }
): UserConfig {
    const outDir = options?.outDir ?? 'dist-electron';

    return {
        plugins: [tsconfigPaths(), createSandboxedPreloadAssertionPlugin(`${outputFileName}.js`, outDir)],
        build: {
            outDir,
            target: 'node20',
            minify: false,
            reportCompressedSize: false,
            lib: {
                entry,
                formats: sandboxedPreloadFormats,
                fileName: () => `${outputFileName}.js`,
            },
            rollupOptions: {
                input: entry,
                external: ['electron', ...builtinExternalModules],
                output: {
                    format: 'cjs',
                    exports: 'named',
                    inlineDynamicImports: true,
                },
            },
        },
    };
}
