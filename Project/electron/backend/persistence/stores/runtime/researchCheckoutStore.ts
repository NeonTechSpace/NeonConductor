import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { ResearchCheckoutRecord } from '@/app/backend/persistence/types';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';

import type {
    ResearchRepoLocator,
    RepoMutationGuardrail,
    RepoWorkflowState,
    RunResearchTarget,
} from '@/shared/contracts';

function parseRepoWorkflowStateJson(input: string): RepoWorkflowState {
    const parsed: unknown = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object') {
        throw new DataCorruptionError('Research checkout workflow state payload is invalid.');
    }

    return parsed as RepoWorkflowState;
}

function parseMutationGuardrailJson(input: string): RepoMutationGuardrail {
    const parsed: unknown = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object') {
        throw new DataCorruptionError('Research checkout mutation guardrail payload is invalid.');
    }

    return parsed as RepoMutationGuardrail;
}

function mapResearchCheckoutRecord(row: {
    id: string;
    profile_id: string;
    canonical_key: string;
    sanitized_url: string;
    repo_name: string;
    root_policy: ResearchCheckoutRecord['rootPolicy'];
    root_absolute_path: string;
    resolved_checkout_path: string;
    detected_vcs: ResearchCheckoutRecord['detectedVcs'];
    effective_vcs: ResearchCheckoutRecord['effectiveVcs'];
    checkout_action: ResearchCheckoutRecord['checkoutAction'];
    update_action: ResearchCheckoutRecord['updateAction'];
    target_switch_action: ResearchCheckoutRecord['targetSwitchAction'];
    repo_workflow_state_json: string;
    mutation_guardrail_json: string;
    last_checked_at: string;
    created_at: string;
    updated_at: string;
}): ResearchCheckoutRecord {
    const locator: ResearchRepoLocator = {
        canonicalKey: row.canonical_key,
        sanitizedUrl: row.sanitized_url,
        name: row.repo_name,
    };

    return {
        id: parseEntityId(row.id, 'research_checkout_records.id', 'rch'),
        profileId: row.profile_id,
        locator,
        rootPolicy: row.root_policy,
        rootAbsolutePath: row.root_absolute_path,
        resolvedCheckoutPath: row.resolved_checkout_path,
        checkoutAction: row.checkout_action,
        updateAction: row.update_action,
        targetSwitchAction: row.target_switch_action,
        detectedVcs: row.detected_vcs,
        effectiveVcs: row.effective_vcs,
        repoWorkflowState: parseRepoWorkflowStateJson(row.repo_workflow_state_json),
        mutationGuardrail: parseMutationGuardrailJson(row.mutation_guardrail_json),
        lastCheckedAt: row.last_checked_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class ResearchCheckoutStore {
    async getById(profileId: string, id: ResearchCheckoutRecord['id']): Promise<ResearchCheckoutRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('research_checkout_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', '=', id)
            .executeTakeFirst();

        return row ? mapResearchCheckoutRecord(row) : null;
    }

    async getByProfileAndLocator(input: {
        profileId: string;
        canonicalKey: string;
        rootAbsolutePath: string;
    }): Promise<ResearchCheckoutRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('research_checkout_records')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('canonical_key', '=', input.canonicalKey)
            .where('root_absolute_path', '=', input.rootAbsolutePath)
            .executeTakeFirst();

        return row ? mapResearchCheckoutRecord(row) : null;
    }

    async upsertFromResearchTarget(input: {
        profileId: string;
        researchTarget: RunResearchTarget;
    }): Promise<ResearchCheckoutRecord> {
        const { db } = getPersistence();
        const existing = await this.getByProfileAndLocator({
            profileId: input.profileId,
            canonicalKey: input.researchTarget.locator.canonicalKey,
            rootAbsolutePath: input.researchTarget.rootAbsolutePath,
        });
        const id = existing?.id ?? createEntityId('rch');
        const now = nowIso();
        const createdAt = existing?.createdAt ?? now;
        const row = await db
            .insertInto('research_checkout_records')
            .values({
                id,
                profile_id: input.profileId,
                canonical_key: input.researchTarget.locator.canonicalKey,
                sanitized_url: input.researchTarget.locator.sanitizedUrl,
                repo_name: input.researchTarget.locator.name,
                root_policy: input.researchTarget.rootPolicy,
                root_absolute_path: input.researchTarget.rootAbsolutePath,
                resolved_checkout_path: input.researchTarget.resolvedCheckoutPath,
                detected_vcs: input.researchTarget.detectedVcs,
                effective_vcs: input.researchTarget.effectiveVcs,
                checkout_action: input.researchTarget.checkoutAction,
                update_action: input.researchTarget.updateAction,
                target_switch_action: input.researchTarget.targetSwitchAction,
                repo_workflow_state_json: JSON.stringify(input.researchTarget.repoWorkflowState),
                mutation_guardrail_json: JSON.stringify(input.researchTarget.mutationGuardrail),
                last_checked_at: input.researchTarget.updatedAt,
                created_at: createdAt,
                updated_at: now,
            })
            .onConflict((oc) =>
                oc.columns(['profile_id', 'canonical_key', 'root_absolute_path']).doUpdateSet({
                    sanitized_url: input.researchTarget.locator.sanitizedUrl,
                    repo_name: input.researchTarget.locator.name,
                    root_policy: input.researchTarget.rootPolicy,
                    resolved_checkout_path: input.researchTarget.resolvedCheckoutPath,
                    detected_vcs: input.researchTarget.detectedVcs,
                    effective_vcs: input.researchTarget.effectiveVcs,
                    checkout_action: input.researchTarget.checkoutAction,
                    update_action: input.researchTarget.updateAction,
                    target_switch_action: input.researchTarget.targetSwitchAction,
                    repo_workflow_state_json: JSON.stringify(input.researchTarget.repoWorkflowState),
                    mutation_guardrail_json: JSON.stringify(input.researchTarget.mutationGuardrail),
                    last_checked_at: input.researchTarget.updatedAt,
                    updated_at: now,
                })
            )
            .returningAll()
            .executeTakeFirstOrThrow();

        return mapResearchCheckoutRecord(row);
    }
}

export const researchCheckoutStore = new ResearchCheckoutStore();
