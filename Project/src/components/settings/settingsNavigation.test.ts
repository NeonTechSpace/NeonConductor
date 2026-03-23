import { describe, expect, it } from 'vitest';

import {
    getSettingsRouteSearch,
    getDefaultSettingsSelection,
    parseSettingsRouteSearch,
    resolveSettingsSelectionFromRouteSearch,
} from '@/web/components/settings/settingsNavigation';

describe('settingsNavigation route search', () => {
    it('falls back to the documented default selection when route search is missing', () => {
        expect(resolveSettingsSelectionFromRouteSearch({})).toEqual(getDefaultSettingsSelection('kilo'));
    });

    it('keeps a valid settings route selection', () => {
        expect(
            resolveSettingsSelectionFromRouteSearch({
                section: 'profiles',
                subsection: 'execution',
            })
        ).toEqual({
            section: 'profiles',
            subsection: 'execution',
        });
    });

    it('falls back to the section default when the subsection is invalid', () => {
        expect(
            resolveSettingsSelectionFromRouteSearch({
                section: 'context',
                subsection: 'not-real',
            })
        ).toEqual(getDefaultSettingsSelection('context'));
    });

    it('parses only known primary sections from raw route search input', () => {
        expect(
            parseSettingsRouteSearch({
                section: 'providers',
                subsection: 'openai',
            })
        ).toEqual({
            section: 'providers',
            subsection: 'openai',
        });

        expect(
            parseSettingsRouteSearch({
                section: 'bad',
                subsection: 'openai',
            })
        ).toEqual({
            subsection: 'openai',
        });
    });

    it('serializes a concrete settings selection back into route search state', () => {
        expect(
            getSettingsRouteSearch({
                section: 'providers',
                subsection: 'kilo',
            })
        ).toEqual({
            section: 'providers',
            subsection: 'kilo',
        });
    });
});
