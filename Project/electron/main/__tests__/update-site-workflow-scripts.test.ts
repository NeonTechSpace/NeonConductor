import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type PublishOutput = {
    channel: string;
    manifests: Array<{ name: string; content: string }>;
    pages: Array<{ path: string; content: string }>;
};

type HelperOutput = {
    rewritten: string;
    assets: string[];
    version: string | null;
    hasLatestManifestLink: boolean;
    hasReleaseTagLink: boolean;
};

const publishScriptPath = fileURLToPath(
    new URL('../../../../.github/scripts/publish-update-site.mjs', import.meta.url)
);
const validateScriptPath = fileURLToPath(
    new URL('../../../../.github/scripts/validate-update-metadata.mjs', import.meta.url)
);
const updateSiteLibUrl = new URL('../../../../.github/scripts/update-site-lib.mjs', import.meta.url).href;
const mockHttpsRequestModuleUrl = new URL('./fixtures/mock-github-https-request.mjs', import.meta.url).href;

const sampleManifest = `version: 1.2.3
files:
  - url: NeonConductor.exe
path: ./artifacts/NeonConductor.exe
`;

function runNodeScript(args: string[], input: string, env: Record<string, string> = {}) {
    return spawnSync(process.execPath, args, {
        input,
        encoding: 'utf8',
        env: {
            ...process.env,
            ...env,
        },
    });
}

function runJsonModule(code: string, env: Record<string, string> = {}) {
    const result = runNodeScript(['--input-type=module', '-e', code], '', env);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    return JSON.parse(result.stdout) as unknown;
}

describe('update site workflow helpers', () => {
    it('rewrites release URLs, extracts referenced assets, and renders channel pages', () => {
        const result = runJsonModule(
            `
                const lib = await import(process.env.UPDATE_SITE_LIB_URL);
                const source = process.env.SAMPLE_MANIFEST;
                const rewritten = lib.rewriteManifestSource(
                  source,
                  (value) => lib.makeReleaseAssetUrl(
                    'NeonTechSpace',
                    'NeonConductor',
                    'v1.2.3',
                    value.replace('./artifacts/', ''),
                  ),
                );

                process.stdout.write(JSON.stringify({
                  rewritten,
                  assets: Array.from(lib.extractReferencedAssetNames(source)).sort(),
                  version: lib.extractManifestVersion(source),
                  hasLatestManifestLink: lib.createChannelIndexHtml({
                    channel: 'stable',
                    files: [{ name: 'latest.yml', version: '1.2.3' }],
                    owner: 'NeonTechSpace',
                    repo: 'NeonConductor',
                  }).includes('latest.yml'),
                  hasReleaseTagLink: lib.createChannelIndexHtml({
                    channel: 'stable',
                    files: [{ name: 'latest.yml', version: '1.2.3' }],
                    owner: 'NeonTechSpace',
                    repo: 'NeonConductor',
                  }).includes('/releases/tag/v1.2.3'),
                }));
            `,
            {
                UPDATE_SITE_LIB_URL: updateSiteLibUrl,
                SAMPLE_MANIFEST: sampleManifest,
            }
        ) as HelperOutput;

        expect(result.rewritten).toContain(
            'https://github.com/NeonTechSpace/NeonConductor/releases/download/v1.2.3/NeonConductor.exe'
        );
        expect(result.assets).toEqual(['NeonConductor.exe']);
        expect(result.version).toBe('1.2.3');
        expect(result.hasLatestManifestLink).toBe(true);
        expect(result.hasReleaseTagLink).toBe(true);
    });
});

describe('publish-update-site.mjs', () => {
    it('renders rewritten manifests and site pages from stdin payload', () => {
        const payload = {
            channel: 'stable',
            owner: 'NeonTechSpace',
            repo: 'NeonConductor',
            tagName: 'v1.2.3',
            inputManifests: [{ name: 'latest.yml', content: sampleManifest }],
            existingChannels: {
                stable: [],
                beta: [{ name: 'beta.yml', content: 'version: 1.1.0\n' }],
                alpha: [],
            },
        };

        const result = runNodeScript([publishScriptPath], JSON.stringify(payload));

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');

        const parsed = JSON.parse(result.stdout) as PublishOutput;
        expect(parsed.channel).toBe('stable');
        expect(parsed.manifests).toHaveLength(1);
        expect(parsed.manifests[0]?.content).toContain(
            'https://github.com/NeonTechSpace/NeonConductor/releases/download/v1.2.3/NeonConductor.exe'
        );
        expect(parsed.pages.map((page) => page.path)).toEqual(
            expect.arrayContaining(['.nojekyll', '404.html', 'updates/stable/index.html', 'updates/beta/index.html'])
        );
        const betaPageContainsManifest =
            parsed.pages.find((page) => page.path === 'updates/beta/index.html')?.content.includes('beta.yml') ?? false;
        expect(betaPageContainsManifest).toBe(true);
    });
});

describe('validate-update-metadata.mjs', () => {
    it('accepts manifests when release assets match', () => {
        const result = runNodeScript(
            ['--import', mockHttpsRequestModuleUrl, validateScriptPath],
            JSON.stringify([{ name: 'latest.yml', content: sampleManifest }]),
            {
                MOCK_RELEASE_ASSETS_JSON: JSON.stringify(['NeonConductor.exe']),
                RELEASE_ID: '123',
                TAG_NAME: 'v1.2.3',
                REPO_OWNER: 'NeonTechSpace',
                REPO_NAME: 'NeonConductor',
            }
        );

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Validated updater metadata against uploaded release assets for v1.2.3.');
    });

    it('fails when manifest references are missing from the release', () => {
        const result = runNodeScript(
            ['--import', mockHttpsRequestModuleUrl, validateScriptPath],
            JSON.stringify([{ name: 'latest.yml', content: sampleManifest }]),
            {
                MOCK_RELEASE_ASSETS_JSON: JSON.stringify([]),
                RELEASE_ID: '123',
                TAG_NAME: 'v1.2.3',
                REPO_OWNER: 'NeonTechSpace',
                REPO_NAME: 'NeonConductor',
            }
        );

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Updater metadata references missing release assets for v1.2.3:');
        expect(result.stderr).toContain('latest.yml: NeonConductor.exe');
    });
});
