import {
    registryListResolvedInputSchema,
    registryReadSkillBodyInputSchema,
    registryRefreshInputSchema,
    registrySearchRulesInputSchema,
    registrySearchSkillsInputSchema,
} from '@/app/backend/runtime/contracts';
import {
    listResolvedRegistry,
    readSkillBody,
    refreshRegistry,
    searchResolvedRulesets,
    searchResolvedSkillfiles,
} from '@/app/backend/runtime/services/registry/service';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const registryRouter = router({
    refresh: publicProcedure.input(registryRefreshInputSchema).mutation(async ({ input }) => {
        return refreshRegistry(input);
    }),
    listResolved: publicProcedure.input(registryListResolvedInputSchema).query(async ({ input }) => {
        return listResolvedRegistry(input);
    }),
    searchSkills: publicProcedure.input(registrySearchSkillsInputSchema).query(async ({ input }) => {
        return {
            skillfiles: await searchResolvedSkillfiles(input),
        };
    }),
    searchRules: publicProcedure.input(registrySearchRulesInputSchema).query(async ({ input }) => {
        return {
            rulesets: await searchResolvedRulesets(input),
        };
    }),
    readSkillBody: publicProcedure.input(registryReadSkillBodyInputSchema).query(async ({ input }) => {
        return readSkillBody(input);
    }),
});
