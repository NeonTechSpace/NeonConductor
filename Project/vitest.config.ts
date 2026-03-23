import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        tsconfigPaths: true,
    },
    test: {
        environment: 'node',
        passWithNoTests: true,
        include: [
            'electron/**/*.test.ts',
            'electron/**/*.test.tsx',
            'src/**/*.test.ts',
            'src/**/*.test.tsx',
            'scripts/**/*.test.ts',
            'scripts/**/*.test.tsx',
        ],
    },
});
