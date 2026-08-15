import type { Styles } from './color.ts';

/**
 * Pretty-print parsed JSON, optionally coloured.
 *
 * This walks the *parsed value* rather than running a regex over `JSON.stringify`
 * output: a regex cannot tell a brace inside a string value from a structural one,
 * so it mis-colours any payload containing JSON-ish text.
 *
 * With `styles === null` the output is byte-identical to `JSON.stringify(value, null, indent)`.
 */
export function formatJson(value: unknown, styles: Styles | null, indent = 2): string {
    const pad = ' '.repeat(indent);

    const paint = {
        key: styles ? styles.blue : null,
        string: styles ? styles.green : null,
        number: styles ? styles.cyan : null,
        literal: styles ? styles.magenta : null,
        punctuation: styles ? styles.dim : null,
    };

    const apply = (style: ((text: string) => string) | null, text: string): string => (style ? style(text) : text);

    const punctuate = (text: string): string => apply(paint.punctuation, text);

    const walk = (node: unknown, depth: number): string => {
        if (node === null) return apply(paint.literal, 'null');

        switch (typeof node) {
            case 'boolean':
                return apply(paint.literal, String(node));
            case 'number':
                // JSON.stringify turns non-finite numbers into null; match that.
                return Number.isFinite(node) ? apply(paint.number, String(node)) : apply(paint.literal, 'null');
            case 'string':
                return apply(paint.string, JSON.stringify(node));
            case 'bigint':
                return apply(paint.number, String(node));
            default:
                break;
        }

        if (Array.isArray(node)) {
            if (node.length === 0) return punctuate('[]');

            const inner = pad.repeat(depth + 1);
            const parts = node.map((entry) => `${inner}${walk(entry, depth + 1)}`);
            return `${punctuate('[')}\n${parts.join(punctuate(',') + '\n')}\n${pad.repeat(depth)}${punctuate(']')}`;
        }

        if (typeof node === 'object') {
            // Mirror JSON.stringify: skip undefined, functions, and symbols.
            const entries = Object.entries(node as Record<string, unknown>).filter(
                ([, entry]) => typeof entry !== 'undefined' && typeof entry !== 'function' && typeof entry !== 'symbol',
            );

            if (entries.length === 0) return punctuate('{}');

            const inner = pad.repeat(depth + 1);
            const parts = entries.map(
                ([key, entry]) =>
                    `${inner}${apply(paint.key, JSON.stringify(key))}${punctuate(':')} ${walk(entry, depth + 1)}`,
            );
            return `${punctuate('{')}\n${parts.join(punctuate(',') + '\n')}\n${pad.repeat(depth)}${punctuate('}')}`;
        }

        return apply(paint.literal, 'null');
    };

    return walk(value, 0);
}

/**
 * Parse for display. Returns `undefined` when the text is not JSON after all, so the
 * caller can fall back to showing it verbatim instead of swallowing a malformed body.
 */
export function tryParseJson(text: string): { value: unknown } | undefined {
    try {
        return { value: JSON.parse(text) as unknown };
    } catch {
        return undefined;
    }
}
