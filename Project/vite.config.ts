import { builtinModules } from 'node:module';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';

import { createPreloadBuildConfig } from './electron/main/preload/buildConfig';
import { resolveElectronChildEnv } from './electron/main/runtime/electronChildEnv';

const electronMainExternalModules = [
    'electron',
    'electron-updater',
    'ws',
    ...builtinModules.filter((moduleName) => !moduleName.startsWith('_')).flatMap((moduleName) => [
        moduleName,
        `node:${moduleName}`,
    ]),
];

function buildPreloadOptions(input: string, outputFileName: string) {
    return {
        onstart({ reload }: { reload: () => void }) {
            reload();
        },
        vite: createPreloadBuildConfig(input, outputFileName),
    };
}

// https://vite.dev/config/
export default defineConfig(async () => {
    const reactCompilerPlugin = await babel({
        presets: [reactCompilerPreset()],
    });

    return {
        resolve: {
            tsconfigPaths: true,
        },
        build: {
            rolldownOptions: {
                input: {
                    main: 'index.html',
                    splash: 'splash.html',
                },
            },
        },
        plugins: [
            devtools(),
            tanstackRouter({
                target: 'react',
                autoCodeSplitting: true,
            }),
            react(),
            reactCompilerPlugin,
            tailwindcss(),
            ...electron([
                {
                    entry: 'electron/main/index.ts',
                    onstart({ startup }) {
                        void startup(['.', '--no-sandbox'], {
                            env: resolveElectronChildEnv(),
                        });
                    },
                    vite: {
                        resolve: {
                            tsconfigPaths: true,
                        },
                        build: {
                            rollupOptions: {
                                external: electronMainExternalModules,
                            },
                        },
                    },
                },
                buildPreloadOptions('electron/main/preload/index.ts', 'mainWindow'),
                buildPreloadOptions('electron/main/preload/splash.ts', 'splashWindow'),
            ]),
        ],
    };
});
