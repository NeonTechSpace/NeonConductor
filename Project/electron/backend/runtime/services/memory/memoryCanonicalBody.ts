import { createHash } from 'node:crypto';

import type {
    MemoryCanonicalBody,
    MemoryCanonicalBodySection,
    MemoryCanonicalBodySectionKind,
} from '@/app/backend/runtime/contracts';
import { memoryCanonicalBodySectionKinds } from '@/app/backend/runtime/contracts';

const canonicalSectionKindSet = new Set<MemoryCanonicalBodySectionKind>(memoryCanonicalBodySectionKinds);

function normalizeLine(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function slugifySectionId(value: string): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug.length > 0 ? slug : 'section';
}

function createStableSectionId(input: { kind: MemoryCanonicalBodySectionKind; heading: string; index: number }): string {
    const digest = createHash('sha256')
        .update(`${input.kind}\n${input.heading}\n${String(input.index)}`, 'utf8')
        .digest('hex')
        .slice(0, 8);
    return `${slugifySectionId(input.heading)}-${digest}`;
}

function normalizeSection(
    section: MemoryCanonicalBodySection,
    index: number,
    seenIds: Set<string>
): MemoryCanonicalBodySection | undefined {
    const kind = section.kind;
    if (!canonicalSectionKindSet.has(kind)) {
        return undefined;
    }

    const heading = normalizeLine(section.heading);
    const items = section.items.map(normalizeLine).filter((item) => item.length > 0);
    if (heading.length === 0 || items.length === 0) {
        return undefined;
    }

    const preferredId = normalizeLine(section.id).replace(/\s+/g, '-');
    let id = preferredId.length > 0 ? preferredId : createStableSectionId({ kind, heading, index });
    while (seenIds.has(id)) {
        id = `${id}-${String(index + 1)}`;
    }
    seenIds.add(id);

    return {
        id,
        kind,
        heading,
        items,
    };
}

export function normalizeMemoryCanonicalBody(body: MemoryCanonicalBody): MemoryCanonicalBody {
    const seenIds = new Set<string>();
    const sections = body.sections
        .map((section, index) => normalizeSection(section, index, seenIds))
        .filter((section): section is MemoryCanonicalBodySection => section !== undefined);

    if (sections.length === 0) {
        return createMemoryCanonicalBodyFromMarkdown('');
    }

    return {
        formatVersion: 1,
        sections,
    };
}

export function createMemoryCanonicalBodyFromMarkdown(markdown: string): MemoryCanonicalBody {
    const normalized = markdown.replace(/\r\n?/g, '\n').trim();
    const items = normalized
        .split(/\n{2,}/)
        .map((block) =>
            block
                .split('\n')
                .map((line) => line.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '').trim())
                .filter((line) => line.length > 0)
                .join(' ')
        )
        .map(normalizeLine)
        .filter((item) => item.length > 0);

    return {
        formatVersion: 1,
        sections: [
            {
                id: 'note-body',
                kind: 'note',
                heading: 'Memory Body',
                items: items.length > 0 ? items : ['No memory details recorded.'],
            },
        ],
    };
}

export function renderMemoryCanonicalBodyMarkdown(body: MemoryCanonicalBody): string {
    return normalizeMemoryCanonicalBody(body).sections
        .map((section) => [`## ${section.heading}`, '', ...section.items.map((item) => `- ${item}`)].join('\n'))
        .join('\n\n')
        .trim();
}

export function resolveMemoryCanonicalBody(input: {
    canonicalBody?: MemoryCanonicalBody;
    bodyMarkdown: string;
}): MemoryCanonicalBody {
    return input.canonicalBody
        ? normalizeMemoryCanonicalBody(input.canonicalBody)
        : createMemoryCanonicalBodyFromMarkdown(input.bodyMarkdown);
}
