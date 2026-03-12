import js from '@eslint/js';
import { fixupPluginRules } from '@eslint/compat';
import neverthrowPlugin from '@bufferings/eslint-plugin-neverthrow';
import queryPlugin from '@tanstack/eslint-plugin-query';
import vitestPlugin from '@vitest/eslint-plugin';
import globals from 'globals';
import { globalIgnores } from 'eslint/config';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import nPlugin from 'eslint-plugin-n';
import noSecrets from 'eslint-plugin-no-secrets';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import securityPlugin from 'eslint-plugin-security';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const typeCheckedGlobs = [
    'src/**/*.{ts,tsx}',
    'electron/**/*.{ts,tsx}',
    'scripts/**/*.ts',
    'vite.config.ts',
    'vitest.config.ts',
];

const rendererGlobs = ['src/**/*.{js,jsx,ts,tsx}'];

const nodeGlobs = [
    'electron/**/*.{js,cjs,ts,tsx}',
    'scripts/**/*.{js,mjs,cjs,ts,tsx}',
    'vite.config.ts',
    'vitest.config.ts',
];
const nodeUntypedGlobs = ['electron/**/*.mjs'];

const testGlobs = [
    'electron/**/*.{test,spec}.ts',
    'src/**/*.{test,spec}.{ts,tsx}',
    'electron/**/__tests__/**/*.{ts,tsx}',
    'src/**/__tests__/**/*.{ts,tsx}',
];

const neverthrowWorkflowGlobs = ['electron/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}', 'scripts/**/*.ts'];
const generatedGlobs = ['src/routeTree.gen.ts'];
const validatedFsAuthorityGlobs = [
    'electron/backend/persistence/db.ts',
    'electron/backend/runtime/services/context/tokenizerRuntime.ts',
    'electron/backend/runtime/services/registry/filesystem.ts',
    'electron/backend/runtime/services/runtimeFactoryReset.ts',
    'electron/backend/runtime/services/toolExecution/handlers/listFiles.ts',
    'electron/backend/runtime/services/toolExecution/handlers/readFile.ts',
    'electron/backend/runtime/services/worktree/git.ts',
    'electron/main/preload/buildConfig.ts',
    'electron/main/logging/fileDrain.ts',
];
const processBridgeGlobs = [
    'electron/backend/runtime/services/checkpoint/gitWorkspace.ts',
    'electron/backend/runtime/services/toolExecution/handlers/runCommand.ts',
    'electron/backend/runtime/services/worktree/git.ts',
];
const validatedFsTestGlobs = [
    'electron/backend/trpc/__tests__/runtime-contracts.shared.ts',
    'electron/backend/trpc/__tests__/runtime-contracts.core.test.ts',
    'electron/main/preload/buildConfig.test.ts',
];

const sharedTypeLanguageOptions = {
    parser: tseslint.parser,
    parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
    },
};

const sharedBasePlugins = {
    import: fixupPluginRules(importPlugin),
    'no-secrets': fixupPluginRules(noSecrets),
};

const rendererPlugins = {
    ...sharedBasePlugins,
    react: fixupPluginRules(react),
    'react-hooks': fixupPluginRules(reactHooks),
    'react-refresh': fixupPluginRules(reactRefresh),
    'jsx-a11y': fixupPluginRules(jsxA11y),
    '@tanstack/query': fixupPluginRules(queryPlugin),
};

const nodePlugins = {
    ...sharedBasePlugins,
    n: fixupPluginRules(nPlugin),
    security: fixupPluginRules(securityPlugin),
};

const importOrderRule = [
    'error',
    {
        groups: [['builtin', 'external'], ['internal', 'parent', 'sibling', 'index'], ['type']],
        pathGroups: [
            { pattern: '@/web/**', group: 'internal', position: 'before' },
            { pattern: '@/app/**', group: 'internal', position: 'before' },
            { pattern: '@/shared/**', group: 'internal', position: 'before' },
        ],
        pathGroupsExcludedImportTypes: ['builtin'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
    },
];

const noRestrictedImportsRule = [
    'error',
    {
        patterns: ['./*', '../*', '../../*', '../../../*', '../../../../*'],
    },
];
const rendererNoRestrictedImportsRule = [
    'error',
    {
        paths: [
            {
                name: '@/app/backend/runtime/contracts',
                message: 'Renderer code must import browser-safe runtime contracts from @/shared/contracts.',
            },
            {
                name: '@/app/backend/runtime/identity/entityIds',
                message: 'Renderer code must not import backend-only ID generation helpers.',
            },
        ],
        patterns: [
            {
                group: ['./*', '../*', '../../*', '../../../*', '../../../../*'],
            },
            {
                group: ['@/app/backend/runtime/contracts/**'],
                message: 'Renderer code must import browser-safe runtime contracts from @/shared/contracts.',
            },
            {
                group: ['@/app/backend/runtime/identity/**'],
                message: 'Renderer code must not import backend-only runtime identity helpers.',
            },
        ],
    },
];
const noSecretsRule = [
    'warn',
    {
        // Migration filenames look high-entropy to the rule but are deterministic versioned artifacts.
        ignoreContent: [/^\d{3}_[a-z0-9_]+\.sql$/i],
    },
];

const vitestGlobals = {
    afterAll: 'readonly',
    afterEach: 'readonly',
    beforeAll: 'readonly',
    beforeEach: 'readonly',
    describe: 'readonly',
    expect: 'readonly',
    it: 'readonly',
    test: 'readonly',
    vi: 'readonly',
};

function mergeRecommendedRules(configValue) {
    const configs = Array.isArray(configValue) ? configValue : configValue ? [configValue] : [];

    return configs.reduce((rules, config) => {
        return { ...rules, ...(config.rules ?? {}) };
    }, {});
}

const tanstackQueryRules = mergeRecommendedRules(
    queryPlugin.configs?.['flat/recommended'] ?? queryPlugin.configs?.recommended
);
const vitestRules = mergeRecommendedRules(vitestPlugin.configs?.recommended);

export default [
    globalIgnores([
        'dist',
        'dist-electron',
        'release',
        'eslint.config.js',
        'prettier.config.js',
        'electron-builder.json5',
        ...generatedGlobs,
    ]),

    js.configs.recommended,

    ...[...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.strictTypeChecked].map((config) => ({
        ...config,
        files: typeCheckedGlobs,
        languageOptions: {
            ...(config.languageOptions ?? {}),
            ...sharedTypeLanguageOptions,
            parserOptions: {
                ...(config.languageOptions?.parserOptions ?? {}),
                ...sharedTypeLanguageOptions.parserOptions,
            },
        },
    })),

    prettierConfig,

    {
        files: rendererGlobs,
        plugins: rendererPlugins,
        languageOptions: {
            ...sharedTypeLanguageOptions,
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: globals.browser,
        },
        settings: {
            react: { version: 'detect' },
            'import/resolver': {
                typescript: { project: ['tsconfig.renderer.json'] },
                node: true,
            },
        },
        rules: {
            'react/jsx-no-useless-fragment': 'warn',
            'react/jsx-key': ['error', { checkFragmentShorthand: true }],
            'react/no-unstable-nested-components': 'warn',
            'react-refresh/only-export-components': 'warn',
            'import/order': importOrderRule,
            'import/newline-after-import': 'warn',
            'import/no-unresolved': 'off',
            'no-restricted-imports': rendererNoRestrictedImportsRule,
            'no-secrets/no-secrets': noSecretsRule,
            'no-alert': 'error',
            'no-console': 'error',
            ...tanstackQueryRules,
            '@tanstack/query/exhaustive-deps': 'error',
            '@tanstack/query/no-unstable-deps': 'error',
        },
    },

    {
        files: nodeGlobs,
        plugins: nodePlugins,
        languageOptions: {
            ...sharedTypeLanguageOptions,
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: globals.node,
        },
        settings: {
            'import/resolver': {
                typescript: { project: ['tsconfig.node.json'] },
                node: true,
            },
        },
        rules: {
            'import/order': importOrderRule,
            'import/newline-after-import': 'warn',
            'import/no-unresolved': 'off',
            'no-restricted-imports': noRestrictedImportsRule,
            'no-secrets/no-secrets': noSecretsRule,
            'no-console': 'error',
            'n/no-missing-import': 'off',
            'n/no-process-exit': 'off',
            'security/detect-child-process': 'warn',
            'security/detect-non-literal-fs-filename': 'warn',
            'security/detect-non-literal-regexp': 'warn',
            'security/detect-unsafe-regex': 'warn',
            'no-empty': 'off',
            'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
        },
    },

    {
        files: nodeUntypedGlobs,
        plugins: nodePlugins,
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: globals.node,
        },
        settings: {
            'import/resolver': {
                node: true,
            },
        },
        rules: {
            'import/order': importOrderRule,
            'import/newline-after-import': 'warn',
            'import/no-unresolved': 'off',
            'no-restricted-imports': noRestrictedImportsRule,
            'no-secrets/no-secrets': noSecretsRule,
            'no-console': 'error',
            'n/no-missing-import': 'off',
            'n/no-process-exit': 'off',
            'security/detect-child-process': 'warn',
            'security/detect-non-literal-fs-filename': 'warn',
            'security/detect-non-literal-regexp': 'warn',
            'security/detect-unsafe-regex': 'warn',
            'no-empty': 'off',
            'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
        },
    },

    {
        files: neverthrowWorkflowGlobs,
        plugins: {
            neverthrow: fixupPluginRules(neverthrowPlugin),
        },
        rules: {
            'neverthrow/must-use-result': 'error',
        },
    },

    {
        files: processBridgeGlobs,
        rules: {
            'neverthrow/must-use-result': 'off',
        },
    },

    {
        files: ['scripts/**/*.ts'],
        rules: {
            'no-secrets/no-secrets': 'off',
            'security/detect-non-literal-fs-filename': 'off',
        },
    },
    {
        files: ['scripts/**/__tests__/**/*.ts', 'src/router.ts', 'src/splash/main.ts'],
        rules: {
            'no-restricted-imports': 'off',
        },
    },
    {
        files: ['vite.config.ts', 'electron/main/preload/buildConfig.ts'],
        rules: {
            'no-restricted-imports': 'off',
        },
    },

    {
        files: validatedFsAuthorityGlobs,
        rules: {
            'security/detect-non-literal-fs-filename': 'off',
        },
    },
    {
        files: validatedFsTestGlobs,
        rules: {
            'security/detect-non-literal-fs-filename': 'off',
        },
    },

    {
        files: testGlobs,
        plugins: {
            vitest: fixupPluginRules(vitestPlugin),
        },
        languageOptions: {
            ...sharedTypeLanguageOptions,
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.node, ...vitestGlobals },
        },
        rules: {
            ...vitestRules,
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            'vitest/no-disabled-tests': 'warn',
            'vitest/no-focused-tests': 'error',
        },
    },
];
