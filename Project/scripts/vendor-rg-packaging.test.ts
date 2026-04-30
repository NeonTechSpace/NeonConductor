import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('vendored ripgrep packaging', () => {
    it('wires platform packaging scripts through vendored ripgrep fetch commands', () => {
        const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };

        expect(packageJson.scripts['build:win']).toContain('pnpm run vendor:rg:win &&');
        expect(packageJson.scripts['build:mac']).toContain('pnpm run vendor:rg:mac &&');
        expect(packageJson.scripts['build:mac:arm64']).toContain('pnpm run vendor:rg:mac:arm64 &&');
        expect(packageJson.scripts['build:mac:x64']).toContain('pnpm run vendor:rg:mac:x64 &&');
        expect(packageJson.scripts['build:linux']).toContain('pnpm run vendor:rg:linux &&');
    });

    it('packages the platform-specific vendored ripgrep binary into Electron resources', () => {
        const electronBuilderConfig = readFileSync(path.resolve(__dirname, '../electron-builder.json5'), 'utf8');

        expect(electronBuilderConfig).toContain("from: 'vendor/rg/win32-${arch}/rg.exe'");
        expect(electronBuilderConfig).toContain("to: 'vendor/rg/win32-${arch}/rg.exe'");
        expect(electronBuilderConfig).toContain("from: 'vendor/rg/darwin-${arch}/rg'");
        expect(electronBuilderConfig).toContain("to: 'vendor/rg/darwin-${arch}/rg'");
        expect(electronBuilderConfig).toContain("from: 'vendor/rg/linux-${arch}/rg'");
        expect(electronBuilderConfig).toContain("to: 'vendor/rg/linux-${arch}/rg'");
    });
});
