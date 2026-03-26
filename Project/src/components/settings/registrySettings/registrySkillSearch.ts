import type { SkillfileDefinitionRecord } from '@/app/backend/persistence/types';

function matchesRegistrySearch(skillfile: SkillfileDefinitionRecord, query: string): boolean {
    const haystacks = [skillfile.name, skillfile.assetKey, skillfile.description ?? '', ...(skillfile.tags ?? [])].map(
        (value) => value.toLowerCase()
    );

    return haystacks.some((value) => value.includes(query));
}

export function filterResolvedSkillfiles(
    skillfiles: SkillfileDefinitionRecord[],
    query: string
): SkillfileDefinitionRecord[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
        return [];
    }

    return skillfiles.filter((skillfile) => matchesRegistrySearch(skillfile, normalizedQuery));
}
