import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import { launchElectron, resolveLaunchElectronArgs, resolveLaunchElectronEnv } from '@/scripts/launch-electron';

describe('launch-electron', () => {
    it('removes inherited Electron Node-mode from the launch environment', () => {
        const launchEnv = resolveLaunchElectronEnv({
            ELECTRON_RUN_AS_NODE: '1',
            PATH: 'C:\\Tools',
            OPENAI_API_KEY: 'preserved',
        });

        expect(launchEnv.ELECTRON_RUN_AS_NODE).toBeUndefined();
        expect(launchEnv.PATH).toBe('C:\\Tools');
        expect(launchEnv.OPENAI_API_KEY).toBe('preserved');
    });

    it('launches the app root and forwards extra Electron arguments', () => {
        expect(resolveLaunchElectronArgs(['--trace-warnings'])).toEqual(['.', '--trace-warnings']);
    });

    it('forwards the spawned Electron exit code', async () => {
        const child = new EventEmitter();
        const launchResult = launchElectron({
            argv: ['--trace-warnings'],
            cwd: 'C:\\Project',
            env: {
                ELECTRON_RUN_AS_NODE: '1',
                PATH: 'C:\\Tools',
            },
            spawnElectron(command, args, options) {
                expect(command).toMatch(/electron/i);
                expect(args).toEqual(['.', '--trace-warnings']);
                expect(options.cwd).toBe('C:\\Project');
                expect(options.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
                expect(options.env.PATH).toBe('C:\\Tools');
                expect(options.stdio).toBe('inherit');
                return child as never;
            },
        });

        child.emit('exit', 7, null);

        await expect(launchResult).resolves.toBe(7);
    });
});
