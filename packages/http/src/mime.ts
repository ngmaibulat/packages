import path from 'node:path';

const BY_EXTENSION: Record<string, string> = {
    '.json': 'application/json',
    '.ndjson': 'application/x-ndjson',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.tsv': 'text/tab-separated-values',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.ts': 'text/plain',
    '.xml': 'application/xml',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',
    '.toml': 'application/toml',
    '.graphql': 'application/graphql',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.tar': 'application/x-tar',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.wasm': 'application/wasm',
};

export const OCTET_STREAM = 'application/octet-stream';

export function guessMime(filePath: string): string {
    return BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? OCTET_STREAM;
}

/** Strip parameters: `application/json; charset=utf-8` -> `application/json`. */
export function baseType(contentType: string | null | undefined): string {
    if (!contentType) return '';
    return (contentType.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * Matches `application/json`, `text/json`, and every `+json` structured suffix
 * (`application/problem+json`, `application/vnd.api+json`, ...). The 0.0.x code compared
 * the whole header for equality, so anything with a charset fell through to the text path.
 */
export function isJsonType(contentType: string | null | undefined): boolean {
    const base = baseType(contentType);
    return base === 'application/json' || base === 'text/json' || base.endsWith('+json');
}

const TEXTUAL = new Set([
    'application/xml',
    'application/xhtml+xml',
    'application/javascript',
    'application/ecmascript',
    'application/x-www-form-urlencoded',
    'application/graphql',
    'application/yaml',
    'application/toml',
    'application/x-ndjson',
    'application/x-sh',
    'image/svg+xml',
]);

export function isTextType(contentType: string | null | undefined): boolean {
    const base = baseType(contentType);
    if (base === '') return false;
    return base.startsWith('text/') || base.endsWith('+xml') || isJsonType(base) || TEXTUAL.has(base);
}
