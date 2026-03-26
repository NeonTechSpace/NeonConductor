import { createHighlighter } from 'shiki';

export type MarkdownCodeTheme = 'light' | 'dark';

const SUPPORTED_LANGUAGES = [
    'typescript',
    'javascript',
    'tsx',
    'jsx',
    'json',
    'bash',
    'powershell',
    'diff',
    'markdown',
    'yaml',
    'text',
    'plaintext',
] as const;

const LANGUAGE_ALIASES: Record<string, (typeof SUPPORTED_LANGUAGES)[number]> = {
    cjs: 'javascript',
    js: 'javascript',
    jsx: 'jsx',
    jsonc: 'json',
    md: 'markdown',
    plaintext: 'plaintext',
    ps1: 'powershell',
    psm1: 'powershell',
    sh: 'bash',
    shell: 'bash',
    text: 'text',
    ts: 'typescript',
    tsx: 'tsx',
    yml: 'yaml',
};

let highlighterPromise: Promise<Awaited<ReturnType<typeof createHighlighter>>> | undefined;

function getHighlighter() {
    highlighterPromise ??= createHighlighter({
        themes: ['github-light-default', 'github-dark'],
        langs: [...SUPPORTED_LANGUAGES],
    });
    return highlighterPromise;
}

function normalizeLanguage(language: string | undefined): string | undefined {
    if (!language) {
        return undefined;
    }

    const normalized = language.trim().toLowerCase();
    if (normalized.length === 0) {
        return undefined;
    }

    return LANGUAGE_ALIASES[normalized] ?? normalized;
}

export async function highlightMarkdownCode(input: {
    code: string;
    language?: string;
    theme: MarkdownCodeTheme;
}): Promise<string | null> {
    const normalizedLanguage = normalizeLanguage(input.language);
    const language =
        normalizedLanguage && SUPPORTED_LANGUAGES.includes(normalizedLanguage as (typeof SUPPORTED_LANGUAGES)[number])
            ? normalizedLanguage
            : undefined;
    if (!language) {
        return null;
    }

    const highlighter = await getHighlighter();
    return highlighter.codeToHtml(input.code, {
        lang: language,
        theme: input.theme === 'dark' ? 'github-dark' : 'github-light-default',
    });
}
