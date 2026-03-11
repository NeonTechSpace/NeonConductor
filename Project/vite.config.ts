import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import tsconfigPaths from 'vite-tsconfig-paths';

import { createPreloadBuildConfig } from './electron/main/preload/buildConfig';
import { resolveElectronChildEnv } from './electron/main/runtime/electronChildEnv';

function buildPreloadOptions(input: string, outputFileName: string) {
    return {
        onstart({ reload }: { reload: () => void }) {
            reload();
        },
        vite: createPreloadBuildConfig(input, outputFileName),
    };
}

// https://vite.dev/config/
export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: 'index.html',
                splash: 'splash.html',
            },
        },
    },
    plugins: [
        devtools(),
        tsconfigPaths(),
        tanstackRouter({
            target: 'react',
            autoCodeSplitting: true,
        }),

        react({
            babel: {
                plugins: [['babel-plugin-react-compiler']],
            },
        }),
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
                    plugins: [tsconfigPaths()],
                },
            },
            buildPreloadOptions('electron/main/preload/index.ts', 'mainWindow'),
            buildPreloadOptions('electron/main/preload/splash.ts', 'splashWindow'),
        ]),
    ],
});
