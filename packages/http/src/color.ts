import type { PrettyMode } from './args.ts';

export type Style = (text: string) => string;

export interface Styles {
    bold: Style;
    dim: Style;
    red: Style;
    green: Style;
    yellow: Style;
    blue: Style;
    magenta: Style;
    cyan: Style;
}

const identity: Style = (text) => text;

function sgr(open: number, close = 39): Style {
    const prefix = `[${open}m`;
    const suffix = `[${close}m`;
    return (text) => `${prefix}${text}${suffix}`;
}

const COLOURED: Styles = {
    bold: sgr(1, 22),
    dim: sgr(2, 22),
    red: sgr(31),
    green: sgr(32),
    yellow: sgr(33),
    blue: sgr(34),
    magenta: sgr(35),
    cyan: sgr(36),
};

const PLAIN: Styles = {
    bold: identity,
    dim: identity,
    red: identity,
    green: identity,
    yellow: identity,
    blue: identity,
    magenta: identity,
    cyan: identity,
};

export function createStyles(enabled: boolean): Styles {
    return enabled ? COLOURED : PLAIN;
}

export interface ColorEnvironment {
    isTTY: boolean;
    env: Record<string, string | undefined>;
}

/**
 * `--pretty` wins, then the NO_COLOR / FORCE_COLOR conventions, then TTY detection.
 * https://no-color.org treats any non-empty value as "disable".
 */
export function supportsColor(pretty: PrettyMode | undefined, { isTTY, env }: ColorEnvironment): boolean {
    if (pretty === 'none' || pretty === 'format') return false;
    if (pretty === 'all' || pretty === 'colors') return true;

    const noColor = env.NO_COLOR;
    if (noColor !== undefined && noColor !== '') return false;

    const forceColor = env.FORCE_COLOR;
    if (forceColor !== undefined) {
        if (forceColor === '0' || forceColor === 'false') return false;
        return true;
    }

    if (env.TERM === 'dumb') return false;

    return isTTY;
}

/** Whether structured bodies (JSON) should be re-indented. Orthogonal to colour. */
export function supportsFormatting(pretty: PrettyMode | undefined): boolean {
    return pretty !== 'none' && pretty !== 'colors';
}

const SGR_PATTERN = /\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
    return text.replace(SGR_PATTERN, '');
}
