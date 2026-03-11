export type SettingsSection = 'kilo' | 'providers' | 'profiles' | 'context' | 'agents';

export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = ['kilo', 'providers', 'profiles', 'context', 'agents'];

export function getNextSettingsSection(input: {
    currentSection: SettingsSection;
    key: string;
    sections?: ReadonlyArray<SettingsSection>;
}): SettingsSection | undefined {
    const sections = input.sections ?? SETTINGS_SECTIONS;
    const currentIndex = sections.indexOf(input.currentSection);
    if (currentIndex < 0) {
        return undefined;
    }

    if (input.key === 'ArrowDown') {
        return sections[(currentIndex + 1) % sections.length];
    }

    if (input.key === 'ArrowUp') {
        return sections[(currentIndex - 1 + sections.length) % sections.length];
    }

    if (input.key === 'Home') {
        return sections[0];
    }

    if (input.key === 'End') {
        return sections[sections.length - 1];
    }

    return undefined;
}
