function decodeUtf8Strict(buffer: Buffer): string | undefined {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
        return undefined;
    }
}

function countMatches(text: string, pattern: RegExp): number {
    return text.match(pattern)?.length ?? 0;
}

function countControlCharacters(text: string): number {
    let total = 0;
    for (const character of text) {
        const codePoint = character.codePointAt(0);
        if (codePoint === undefined) {
            continue;
        }

        if (
            (codePoint >= 0x0000 && codePoint <= 0x0008) ||
            codePoint === 0x000b ||
            codePoint === 0x000c ||
            (codePoint >= 0x000e && codePoint <= 0x001f) ||
            (codePoint >= 0x007f && codePoint <= 0x009f)
        ) {
            total += 1;
        }
    }

    return total;
}

function decodeLegacyText(buffer: Buffer, encoding: 'windows-1252' | 'windows-1251' | 'ibm866'): string {
    return new TextDecoder(encoding).decode(buffer);
}

function scoreDecodedText(text: string, encoding: 'windows-1252' | 'windows-1251' | 'ibm866'): number {
    const replacementPenalty = countMatches(text, /\uFFFD/gu) * 12;
    const controlPenalty = countControlCharacters(text) * 8;
    const printableReward = countMatches(text, /[\p{L}\p{N}\p{P}\p{S}\s]/gu);
    const cyrillicReward =
        encoding === 'windows-1251' || encoding === 'ibm866' ? countMatches(text, /[\u0400-\u04FF]/gu) * 3 : 0;
    const punctuationReward =
        encoding === 'windows-1252' && /[A-Za-z]/u.test(text)
            ? countMatches(text, /[“”‘’–—™]/gu) * 4
            : 0;

    return printableReward + cyrillicReward + punctuationReward - replacementPenalty - controlPenalty;
}

function decodeWindowsBuffer(buffer: Buffer): string {
    const strictUtf8 = decodeUtf8Strict(buffer);
    if (strictUtf8 !== undefined) {
        return strictUtf8;
    }

    const lossyUtf8 = buffer.toString('utf8');
    const lossyUtf8Score = scoreDecodedText(lossyUtf8, 'windows-1252');
    const candidates = (['windows-1252', 'windows-1251', 'ibm866'] as const).map((encoding) => {
        const text = decodeLegacyText(buffer, encoding);
        return {
            encoding,
            text,
            score: scoreDecodedText(text, encoding),
        };
    });
    const bestCandidate = candidates.sort((left, right) => right.score - left.score)[0];
    if (!bestCandidate || bestCandidate.score < lossyUtf8Score + 4) {
        return lossyUtf8;
    }

    return bestCandidate.text;
}

export function decodeCommandOutput(buffer: Buffer, platform: NodeJS.Platform): string {
    if (platform !== 'win32') {
        return buffer.toString('utf8');
    }

    return decodeWindowsBuffer(buffer);
}
