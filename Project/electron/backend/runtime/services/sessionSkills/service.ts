import { sessionAttachedSkillStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import type { SkillfileDefinitionRecord } from '@/app/backend/persistence/types';
import type {
    SessionAttachedSkillsResult,
    SessionGetAttachedSkillsInput,
    SessionSetAttachedSkillsInput,
} from '@/app/backend/runtime/contracts';
import { resolveSkillfilesByAssetKeys } from '@/app/backend/runtime/services/registry/service';
import {
    errSessionSkills,
    forwardSessionSkillsError,
    missingSessionError,
    missingSessionThreadError,
    okSessionSkills,
    type SessionSkillsResult,
} from '@/app/backend/runtime/services/sessionSkills/errors';

async function resolveSessionWorkspace(input: {
    profileId: string;
    sessionId: SessionGetAttachedSkillsInput['sessionId'];
}): Promise<SessionSkillsResult<string | undefined>> {
    const sessionStatus = await sessionStore.status(input.profileId, input.sessionId);
    if (!sessionStatus.found) {
        return missingSessionError(input.sessionId);
    }

    const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
    if (!sessionThread) {
        return missingSessionThreadError(input.sessionId);
    }

    return okSessionSkills(sessionThread.workspaceFingerprint);
}

function mapAttachedSkillsResult(input: {
    sessionId: SessionGetAttachedSkillsInput['sessionId'];
    skillfiles: SkillfileDefinitionRecord[];
    missingAssetKeys: string[];
}): SessionAttachedSkillsResult {
    return {
        sessionId: input.sessionId,
        skillfiles: input.skillfiles,
        ...(input.missingAssetKeys.length > 0 ? { missingAssetKeys: input.missingAssetKeys } : {}),
    };
}

export async function getAttachedSkills(
    input: SessionGetAttachedSkillsInput
): Promise<SessionSkillsResult<SessionAttachedSkillsResult>> {
    const workspaceFingerprintResult = await resolveSessionWorkspace(input);
    if (workspaceFingerprintResult.isErr()) {
        return forwardSessionSkillsError(workspaceFingerprintResult.error);
    }

    const workspaceFingerprint = workspaceFingerprintResult.value;
    const attachedSkills = await sessionAttachedSkillStore.listBySession(input.profileId, input.sessionId);
    const resolved = await resolveSkillfilesByAssetKeys({
        profileId: input.profileId,
        assetKeys: attachedSkills.map((skill) => skill.assetKey),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    });

    return okSessionSkills(
        mapAttachedSkillsResult({
            sessionId: input.sessionId,
            skillfiles: resolved.skillfiles,
            missingAssetKeys: resolved.missingAssetKeys,
        })
    );
}

export async function setAttachedSkills(
    input: SessionSetAttachedSkillsInput
): Promise<SessionSkillsResult<SessionAttachedSkillsResult>> {
    const workspaceFingerprintResult = await resolveSessionWorkspace(input);
    if (workspaceFingerprintResult.isErr()) {
        return forwardSessionSkillsError(workspaceFingerprintResult.error);
    }

    const workspaceFingerprint = workspaceFingerprintResult.value;
    const resolved = await resolveSkillfilesByAssetKeys({
        profileId: input.profileId,
        assetKeys: input.assetKeys,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    });

    if (resolved.missingAssetKeys.length > 0) {
        const label = resolved.missingAssetKeys.length === 1 ? 'skill' : 'skills';
        return errSessionSkills(
            'invalid_payload',
            `Cannot attach unresolved ${label}: ${resolved.missingAssetKeys.map((assetKey) => `"${assetKey}"`).join(', ')}.`,
            {
                sessionId: input.sessionId,
                missingAssetKeys: resolved.missingAssetKeys,
            }
        );
    }

    await sessionAttachedSkillStore.replaceForSession({
        profileId: input.profileId,
        sessionId: input.sessionId,
        assetKeys: resolved.skillfiles.map((skillfile) => skillfile.assetKey),
    });

    return okSessionSkills(
        mapAttachedSkillsResult({
            sessionId: input.sessionId,
            skillfiles: resolved.skillfiles,
            missingAssetKeys: [],
        })
    );
}
