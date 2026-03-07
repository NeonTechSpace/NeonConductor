export interface RichContentInlineSegment {
    kind: 'text' | 'inline_code';
    text: string;
}

export interface RichContentToken {
    kind: 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'operator';
    text: string;
}

export interface RichContentCodeLine {
    lineNumber: number;
    tokens: RichContentToken[];
}

export interface RichContentParagraphBlock {
    kind: 'paragraph';
    text: string;
    segments: RichContentInlineSegment[];
}

export interface RichContentHeadingBlock {
    kind: 'heading';
    level: 1 | 2 | 3;
    text: string;
    segments: RichContentInlineSegment[];
}

export interface RichContentListBlock {
    kind: 'list';
    items: Array<{
        text: string;
        segments: RichContentInlineSegment[];
    }>;
}

export interface RichContentCodeBlock {
    kind: 'code';
    code: string;
    language?: string;
    lines: RichContentCodeLine[];
}

export type RichContentBlock =
    | RichContentParagraphBlock
    | RichContentHeadingBlock
    | RichContentListBlock
    | RichContentCodeBlock;

const KEYWORDS_BY_LANGUAGE: Record<string, Set<string>> = {
    javascript: new Set([
        'async',
        'await',
        'break',
        'case',
        'catch',
        'class',
        'const',
        'continue',
        'default',
        'delete',
        'else',
        'export',
        'extends',
        'false',
        'finally',
        'for',
        'from',
        'function',
        'if',
        'import',
        'in',
        'let',
        'new',
        'null',
        'return',
        'switch',
        'throw',
        'true',
        'try',
        'typeof',
        'undefined',
        'var',
        'while',
        'yield',
    ]),
    typescript: new Set([
        'as',
        'declare',
        'enum',
        'implements',
        'interface',
        'keyof',
        'namespace',
        'private',
        'protected',
        'public',
        'readonly',
        'satisfies',
        'type',
    ]),
    json: new Set(['false', 'null', 'true']),
    bash: new Set(['case', 'do', 'done', 'elif', 'else', 'esac', 'fi', 'for', 'if', 'in', 'then', 'while']),
    powershell: new Set([
        'begin',
        'class',
        'elseif',
        'else',
        'end',
        'foreach',
        'function',
        'if',
        'param',
        'process',
        'return',
        'switch',
        'throw',
        'trap',
        'try',
        'while',
    ]),
    markdown: new Set([]),
};

const LANGUAGE_ALIASES: Record<string, string> = {
    cjs: 'javascript',
    js: 'javascript',
    jsx: 'javascript',
    jsonc: 'json',
    md: 'markdown',
    ps1: 'powershell',
    psm1: 'powershell',
    sh: 'bash',
    shell: 'bash',
    ts: 'typescript',
    tsx: 'typescript',
};

const OPERATOR_PATTERN = /^(=>|===|!==|==|!=|<=|>=|\+\+|--|&&|\|\||[{}[\]().,:;<>+\-*/=%!?|&])$/;
const NUMBER_PATTERN = /^(0x[\da-f]+|\d+(?:\.\d+)?)$/i;
const DEFAULT_JAVASCRIPT_KEYWORDS: Set<string> = KEYWORDS_BY_LANGUAGE['javascript'] ?? new Set<string>();
const TYPESCRIPT_KEYWORDS: Set<string> = KEYWORDS_BY_LANGUAGE['typescript'] ?? new Set<string>();

function normalizeLanguage(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) {
        return undefined;
    }

    return LANGUAGE_ALIASES[normalized] ?? normalized;
}

function getKeywordSet(language: string | undefined): Set<string> {
    if (!language) {
        return DEFAULT_JAVASCRIPT_KEYWORDS;
    }

    if (language === 'typescript') {
        return new Set([...DEFAULT_JAVASCRIPT_KEYWORDS, ...TYPESCRIPT_KEYWORDS]);
    }

    return KEYWORDS_BY_LANGUAGE[language] ?? DEFAULT_JAVASCRIPT_KEYWORDS;
}

function readCommentStart(line: string, language: string | undefined): number {
    if (language === 'bash' || language === 'powershell') {
        return line.indexOf('#');
    }

    return line.indexOf('//');
}

function tokenizeTextSegment(text: string, keywordSet: Set<string>): RichContentToken[] {
    const tokens: RichContentToken[] = [];
    const parts = text.split(/(\b|\s+)/);

    for (const part of parts) {
        if (part.length === 0) {
            continue;
        }

        if (NUMBER_PATTERN.test(part)) {
            tokens.push({ kind: 'number', text: part });
            continue;
        }

        if (OPERATOR_PATTERN.test(part)) {
            tokens.push({ kind: 'operator', text: part });
            continue;
        }

        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(part) && keywordSet.has(part)) {
            tokens.push({ kind: 'keyword', text: part });
            continue;
        }

        tokens.push({ kind: 'plain', text: part });
    }

    return tokens;
}

function tokenizeCodeLine(line: string, language: string | undefined): RichContentToken[] {
    const commentStart = readCommentStart(line, language);
    const content = commentStart >= 0 ? line.slice(0, commentStart) : line;
    const comment = commentStart >= 0 ? line.slice(commentStart) : '';
    const keywordSet = getKeywordSet(language);
    const tokens: RichContentToken[] = [];
    const pattern = /("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`)/g;

    let lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
        const matched = match[0];
        const index = match.index;

        if (index > lastIndex) {
            tokens.push(...tokenizeTextSegment(content.slice(lastIndex, index), keywordSet));
        }

        tokens.push({ kind: 'string', text: matched });
        lastIndex = index + matched.length;
    }

    if (lastIndex < content.length) {
        tokens.push(...tokenizeTextSegment(content.slice(lastIndex), keywordSet));
    }

    if (comment.length > 0) {
        tokens.push({ kind: 'comment', text: comment });
    }

    return tokens.length > 0 ? tokens : [{ kind: 'plain', text: '' }];
}

function tokenizeCodeBlock(code: string, language: string | undefined): RichContentCodeLine[] {
    return code.split('\n').map((line, index) => ({
        lineNumber: index + 1,
        tokens: tokenizeCodeLine(line, language),
    }));
}

function parseInlineSegments(text: string): RichContentInlineSegment[] {
    const segments: RichContentInlineSegment[] = [];
    let cursor = 0;

    while (cursor < text.length) {
        const opening = text.indexOf('`', cursor);
        if (opening < 0) {
            segments.push({ kind: 'text', text: text.slice(cursor) });
            break;
        }

        if (opening > cursor) {
            segments.push({ kind: 'text', text: text.slice(cursor, opening) });
        }

        const closing = text.indexOf('`', opening + 1);
        if (closing < 0) {
            segments.push({ kind: 'text', text: text.slice(opening) });
            break;
        }

        const inlineCode = text.slice(opening + 1, closing);
        if (inlineCode.length > 0) {
            segments.push({ kind: 'inline_code', text: inlineCode });
        }
        cursor = closing + 1;
    }

    return segments.filter((segment) => segment.text.length > 0);
}

function createParagraphBlock(lines: string[]): RichContentParagraphBlock | undefined {
    const text = lines.join('\n').trim();
    if (text.length === 0) {
        return undefined;
    }

    return {
        kind: 'paragraph',
        text,
        segments: parseInlineSegments(text),
    };
}

function createListBlock(items: string[]): RichContentListBlock | undefined {
    const normalizedItems = items.map((item) => item.trim()).filter((item) => item.length > 0);
    if (normalizedItems.length === 0) {
        return undefined;
    }

    return {
        kind: 'list',
        items: normalizedItems.map((text) => ({
            text,
            segments: parseInlineSegments(text),
        })),
    };
}

function buildTextBlocks(text: string): RichContentBlock[] {
    const blocks: RichContentBlock[] = [];
    const lines = text.split('\n');
    const paragraphLines: string[] = [];
    const listItems: string[] = [];

    function flushParagraph() {
        const paragraph = createParagraphBlock(paragraphLines);
        if (paragraph) {
            blocks.push(paragraph);
        }
        paragraphLines.length = 0;
    }

    function flushList() {
        const list = createListBlock(listItems);
        if (list) {
            blocks.push(list);
        }
        listItems.length = 0;
    }

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        if (trimmed.length === 0) {
            flushParagraph();
            flushList();
            continue;
        }

        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            flushList();
            const prefix = headingMatch[1];
            const headingText = headingMatch[2];
            if (!prefix || !headingText) {
                continue;
            }
            blocks.push({
                kind: 'heading',
                level: Math.min(prefix.length, 3) as 1 | 2 | 3,
                text: headingText.trim(),
                segments: parseInlineSegments(headingText.trim()),
            });
            continue;
        }

        const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
        if (listMatch) {
            flushParagraph();
            const listItemText = listMatch[1];
            if (!listItemText) {
                continue;
            }
            listItems.push(listItemText);
            continue;
        }

        flushList();
        paragraphLines.push(line);
    }

    flushParagraph();
    flushList();
    return blocks;
}

export function parseRichContentBlocks(text: string): RichContentBlock[] {
    const normalized = text.replace(/\r\n?/g, '\n').trim();
    if (normalized.length === 0) {
        return [];
    }

    const blocks: RichContentBlock[] = [];
    const lines = normalized.split('\n');
    const pendingText: string[] = [];
    let index = 0;

    function flushPendingText() {
        if (pendingText.length === 0) {
            return;
        }

        blocks.push(...buildTextBlocks(pendingText.join('\n')));
        pendingText.length = 0;
    }

    while (index < lines.length) {
        const line = lines[index] ?? '';
        const fenceMatch = line.match(/^```([\w-]+)?\s*$/);
        if (!fenceMatch) {
            pendingText.push(line);
            index += 1;
            continue;
        }

        flushPendingText();
        const language = normalizeLanguage(fenceMatch[1]);
        index += 1;
        const codeLines: string[] = [];

        while (index < lines.length && !/^```\s*$/.test(lines[index] ?? '')) {
            codeLines.push(lines[index] ?? '');
            index += 1;
        }

        const code = codeLines.join('\n');
        blocks.push({
            kind: 'code',
            code,
            ...(language ? { language } : {}),
            lines: tokenizeCodeBlock(code, language),
        });

        if (index < lines.length && /^```\s*$/.test(lines[index] ?? '')) {
            index += 1;
        }
    }

    flushPendingText();
    return blocks;
}
