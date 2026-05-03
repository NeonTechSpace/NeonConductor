import path from 'node:path';

import { settingsStore } from '@/app/backend/persistence/stores';
import { isJsonRecord, nowIso } from '@/app/backend/persistence/stores/shared/utils';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

import type { ResearchCheckoutRootSettings, RuntimeSetResearchCheckoutRootSettingsInput } from '@/shared/contracts';

const RESEARCH_CHECKOUT_ROOT_SETTINGS_KEY = 'research_checkout_root_settings';

function isResearchCheckoutRootSettings(value: unknown): value is ResearchCheckoutRootSettings {
    if (!isJsonRecord(value)) {
        return false;
    }

    if (typeof value.profileId !== 'string' || typeof value.updatedAt !== 'string') {
        return false;
    }

    if (value.policy === 'os_temp' || value.policy === 'current_workspace') {
        return value.customAbsolutePath === undefined;
    }

    return value.policy === 'custom_path' && typeof value.customAbsolutePath === 'string';
}

function normalizeCustomAbsolutePath(input: string): OperationalResult<string> {
    const trimmed = input.trim();
    if (!trimmed) {
        return errOp('invalid_input', 'Custom repo-research checkout root must be a non-empty absolute path.');
    }

    if (!path.isAbsolute(trimmed)) {
        return errOp('invalid_input', 'Custom repo-research checkout root must be an absolute path.');
    }

    return okOp(path.resolve(trimmed));
}

export async function getResearchCheckoutRootSettings(profileId: string): Promise<ResearchCheckoutRootSettings> {
    const stored = await settingsStore.getJsonOptional(
        profileId,
        RESEARCH_CHECKOUT_ROOT_SETTINGS_KEY,
        isResearchCheckoutRootSettings
    );

    return (
        stored ?? {
            profileId,
            policy: 'os_temp',
            updatedAt: nowIso(),
        }
    );
}

export async function setResearchCheckoutRootSettings(
    input: RuntimeSetResearchCheckoutRootSettingsInput
): Promise<OperationalResult<ResearchCheckoutRootSettings>> {
    const updatedAt = nowIso();
    const nextResult: OperationalResult<ResearchCheckoutRootSettings> = (() => {
        if (input.policy !== 'custom_path') {
            return okOp({
                profileId: input.profileId,
                policy: input.policy,
                updatedAt,
            } satisfies ResearchCheckoutRootSettings);
        }

        const resolvedCustomPath = normalizeCustomAbsolutePath(input.customAbsolutePath ?? '');
        if (resolvedCustomPath.isErr()) {
            return errOp(resolvedCustomPath.error.code, resolvedCustomPath.error.message);
        }

        return okOp({
            profileId: input.profileId,
            policy: input.policy,
            customAbsolutePath: resolvedCustomPath.value,
            updatedAt,
        } satisfies ResearchCheckoutRootSettings);
    })();

    if (nextResult.isErr()) {
        return errOp(nextResult.error.code, nextResult.error.message);
    }

    await settingsStore.setJson(input.profileId, RESEARCH_CHECKOUT_ROOT_SETTINGS_KEY, {
        profileId: nextResult.value.profileId,
        policy: nextResult.value.policy,
        ...(nextResult.value.customAbsolutePath ? { customAbsolutePath: nextResult.value.customAbsolutePath } : {}),
        updatedAt: nextResult.value.updatedAt,
    });
    return okOp(nextResult.value);
}
