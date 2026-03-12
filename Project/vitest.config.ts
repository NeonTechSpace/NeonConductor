import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        tsconfigPaths: true,
    },
    test: {
        environment: 'node',
        passWithNoTests: true,
        include: ['electron/**/*.test.ts', 'src/**/*.test.ts', 'scripts/**/*.test.ts'],
    },
});
