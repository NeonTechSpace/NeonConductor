import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('vendored Node packaging', () => {
    it('wires platform packaging scripts through vendored Node fetch commands', () => {
        const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };

        expect(packageJson.scripts['build:win']).toContain('pnpm run vendor:node:win &&');
        expect(packageJson.scripts['build:mac']).toContain('pnpm run vendor:node:mac &&');
        expect(packageJson.scripts['build:mac:arm64']).toContain('pnpm run vendor:node:mac:arm64 &&');
        expect(packageJson.scripts['build:mac:x64']).toContain('pnpm run vendor:node:mac:x64 &&');
        expect(packageJson.scripts['build:linux']).toContain('pnpm run vendor:node:linux &&');
    });

    it('packages the platform-specific vendored Node executable into Electron resources', () => {
        const electronBuilderConfig = readFileSync(path.resolve(__dirname, '../electron-builder.json5'), 'utf8');

        expect(electronBuilderConfig).toContain("from: 'vendor/node/win32-${arch}/node.exe'");
        expect(electronBuilderConfig).toContain("to: 'vendor/node/win32-${arch}/node.exe'");
        expect(electronBuilderConfig).toContain("from: 'vendor/node/darwin-${arch}/node'");
        expect(electronBuilderConfig).toContain("to: 'vendor/node/darwin-${arch}/node'");
        expect(electronBuilderConfig).toContain("from: 'vendor/node/linux-${arch}/node'");
        expect(electronBuilderConfig).toContain("to: 'vendor/node/linux-${arch}/node'");
    });
});
