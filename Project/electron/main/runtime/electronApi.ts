import * as electronModule from 'electron';

import { resolveElectronRuntimeValue, type ElectronRuntimeApi } from '@/app/main/runtime/electronRuntimeResolver';

type AnyFunction = (...args: unknown[]) => unknown;
type AnyConstructor = new (...args: unknown[]) => object;

function createLazyElectronExport<K extends keyof ElectronRuntimeApi>(key: K): ElectronRuntimeApi[K] {
    const resolveTarget = (): object => {
        const target = resolveElectronRuntimeValue(key, electronModule);
        if (typeof target !== 'object' && typeof target !== 'function') {
            throw new Error(`Electron main-process API export "${key}" is not an object or function.`);
        }

        return target;
    };

    function proxyTarget(): undefined {
        return undefined;
    }
    const proxy = new Proxy(proxyTarget, {
        apply(_target, thisArg, argArray): unknown {
            const result: unknown = Reflect.apply(resolveTarget() as AnyFunction, thisArg, argArray);
            return result;
        },
        construct(_target, argArray, newTarget): object {
            const instance: unknown = Reflect.construct(resolveTarget() as AnyConstructor, argArray, newTarget);
            if ((typeof instance !== 'object' && typeof instance !== 'function') || instance === null) {
                throw new Error(`Electron main-process API export "${key}" did not construct an object.`);
            }

            return instance;
        },
        get(_target, property, receiver): unknown {
            const target = resolveTarget();
            const result: unknown = Reflect.get(target, property, receiver);
            if (typeof result === 'function') {
                return result.bind(target);
            }

            return result;
        },
        getPrototypeOf() {
            return Reflect.getPrototypeOf(resolveTarget());
        },
        has(_target, property) {
            return Reflect.has(resolveTarget(), property);
        },
        ownKeys() {
            return Reflect.ownKeys(resolveTarget());
        },
        set(_target, property, value, receiver) {
            return Reflect.set(resolveTarget(), property, value, receiver);
        },
    });

    return proxy as unknown as ElectronRuntimeApi[K];
}

export const app = createLazyElectronExport('app');
export const BrowserWindow = createLazyElectronExport('BrowserWindow');
export const Menu = createLazyElectronExport('Menu');
export const dialog = createLazyElectronExport('dialog');
export const ipcMain = createLazyElectronExport('ipcMain');
export const protocol = createLazyElectronExport('protocol');
export const session = createLazyElectronExport('session');
export const shell = createLazyElectronExport('shell');
export const WebContentsView = createLazyElectronExport('WebContentsView');

export type {
    BrowserWindow as BrowserWindowType,
    Input,
    OpenDialogOptions,
    WebContentsView as WebContentsViewType,
} from 'electron';
