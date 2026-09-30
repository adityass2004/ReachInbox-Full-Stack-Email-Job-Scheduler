const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RecipientSummary {
    rawCount: number;
    validCount: number;
    duplicateCount: number;
    invalidCount: number;
    recipients: string[];
}

export function parseRecipientInput(input: string): RecipientSummary {
    const tokens = input
        .split(/[\s,;]+/)
        .map((token) => token.replace(/^[<"'([{]+|[>"')\]}]+$/g, '').trim())
        .filter((token) => token.includes('@'));
    const seen = new Set<string>();
    const recipients: string[] = [];
    let duplicateCount = 0;
    let invalidCount = 0;

    for (const token of tokens) {
        const normalized = token.toLowerCase();
        if (!emailPattern.test(normalized)) {
            invalidCount++;
        } else if (seen.has(normalized)) {
            duplicateCount++;
        } else {
            seen.add(normalized);
            recipients.push(normalized);
        }
    }

    return {
        rawCount: tokens.length,
        validCount: recipients.length,
        duplicateCount,
        invalidCount,
        recipients,
    };
}