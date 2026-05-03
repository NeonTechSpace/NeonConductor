import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { workspaceIconService, workspaceIconTesting } from '@/app/backend/runtime/services/workspaceIcons/service';

const temporaryRoots: string[] = [];

function createTempWorkspace(): string {
    const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-workspace-icon-'));
    temporaryRoots.push(workspaceRoot);
    return workspaceRoot;
}

function writeWorkspaceFile(workspaceRoot: string, relativePath: string, content: string | Uint8Array): void {
    const absolutePath = path.join(workspaceRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
}

function writeSafeSvg(workspaceRoot: string, relativePath: string): void {
    writeWorkspaceFile(
        workspaceRoot,
        relativePath,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16"/></svg>'
    );
}

describe('workspaceIconService', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    afterEach(() => {
        for (const temporaryRoot of temporaryRoots.splice(0)) {
            rmSync(temporaryRoot, { recursive: true, force: true });
        }
    });

    it('detects well-known .ico workspace icons before other sources', async () => {
        const workspaceRoot = createTempWorkspace();
        writeWorkspaceFile(workspaceRoot, 'favicon.ico', Uint8Array.from([0, 1, 2, 3]));
        writeSafeSvg(workspaceRoot, 'icon.svg');

        await expect(workspaceIconTesting.detectWorkspaceIcon(workspaceRoot)).resolves.toEqual({
            sourceKind: 'well_known_file',
            relativePath: 'favicon.ico',
        });
    });

    it('detects local HTML and manifest icon references when well-known files are absent', async () => {
        const htmlWorkspaceRoot = createTempWorkspace();
        writeSafeSvg(htmlWorkspaceRoot, 'assets/app-icon.svg');
        writeWorkspaceFile(htmlWorkspaceRoot, 'index.html', '<link rel="shortcut icon" href="/assets/app-icon.svg">');

        await expect(workspaceIconTesting.detectWorkspaceIcon(htmlWorkspaceRoot)).resolves.toEqual({
            sourceKind: 'html_link',
            relativePath: 'assets/app-icon.svg',
        });

        const manifestWorkspaceRoot = createTempWorkspace();
        writeWorkspaceFile(manifestWorkspaceRoot, 'public-icon.png', Uint8Array.from([7, 8, 9]));
        writeWorkspaceFile(
            manifestWorkspaceRoot,
            'manifest.json',
            JSON.stringify({ icons: [{ src: 'public-icon.png', sizes: '64x64' }] })
        );

        await expect(workspaceIconTesting.detectWorkspaceIcon(manifestWorkspaceRoot)).resolves.toEqual({
            sourceKind: 'manifest_icon',
            relativePath: 'public-icon.png',
        });
    });

    it('fails closed for remote references, out-of-root references, and unsafe SVG content', async () => {
        const workspaceRoot = createTempWorkspace();
        writeWorkspaceFile(workspaceRoot, 'index.html', '<link rel="icon" href="https://example.com/favicon.ico">');
        writeWorkspaceFile(workspaceRoot, 'manifest.json', JSON.stringify({ icons: [{ src: '../outside.png' }] }));
        writeWorkspaceFile(workspaceRoot, 'favicon.svg', '<svg><script>alert("x")</script></svg>');

        await expect(workspaceIconTesting.detectWorkspaceIcon(workspaceRoot)).resolves.toBeNull();
    });

    it('keeps manual override ahead of detected icons and restores detected state when cleared', async () => {
        const profileId = getDefaultProfileId();
        const workspaceRoot = createTempWorkspace();
        const manualIconPath = path.join(createTempWorkspace(), 'manual.png');
        writeFileSync(manualIconPath, Uint8Array.from([10, 11, 12]));

        const registered = await workspaceIconService.registerWorkspaceRoot({
            profileId,
            absolutePath: workspaceRoot,
            label: 'Workspace Icon Test',
        });
        expect(registered.workspaceRoot.workspaceIconSummary.kind).toBe('fallback');

        const manual = await workspaceIconService.patchWorkspaceRoot({
            profileId,
            workspaceFingerprint: registered.workspaceRoot.fingerprint,
            iconAction: {
                kind: 'set_manual',
                sourceAbsolutePath: manualIconPath,
            },
        });
        expect(manual.isOk()).toBe(true);
        if (manual.isErr()) {
            throw new Error(manual.error.message);
        }
        expect(manual.value.workspaceRoot.workspaceIconSummary.kind).toBe('manual');
        await expect(
            workspaceIconService.resolveIconPayload({
                profileId,
                workspaceFingerprint: registered.workspaceRoot.fingerprint,
            })
        ).resolves.toMatchObject({ mimeType: 'image/png' });

        writeWorkspaceFile(workspaceRoot, 'favicon.png', Uint8Array.from([20, 21, 22]));
        const refreshed = await workspaceIconService.patchWorkspaceRoot({
            profileId,
            workspaceFingerprint: registered.workspaceRoot.fingerprint,
            iconAction: {
                kind: 'refresh_detected',
            },
        });
        expect(refreshed.isOk()).toBe(true);
        if (refreshed.isErr()) {
            throw new Error(refreshed.error.message);
        }
        expect(refreshed.value.workspaceRoot.workspaceIconSummary.kind).toBe('manual');

        const cleared = await workspaceIconService.patchWorkspaceRoot({
            profileId,
            workspaceFingerprint: registered.workspaceRoot.fingerprint,
            iconAction: {
                kind: 'clear_manual',
            },
        });
        expect(cleared.isOk()).toBe(true);
        if (cleared.isErr()) {
            throw new Error(cleared.error.message);
        }
        expect(cleared.value.workspaceRoot.workspaceIconSummary).toMatchObject({
            kind: 'detected',
            sourceKind: 'well_known_file',
            detectedRelativePath: 'favicon.png',
        });
    });
});
