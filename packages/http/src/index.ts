/**
 * Programmatic surface. The CLI is the primary interface; these exports exist so the
 * request-building and item-parsing logic can be reused without spawning a process.
 */
export { parseItem, parseItems, isBodyItem, type Item, type ItemKind } from './items.ts';
export {
    parseArgv,
    resolveUrl,
    SAFE_METHODS,
    SHORTCUT_METHODS,
    OPTIONAL_SHORTCUTS,
    type Options,
    type ParseContext,
    type ParseResult,
    type PrintSet,
    type PrettyMode,
    type ResolvedFlags,
} from './args.ts';
export {
    buildRequest,
    send,
    createDeadline,
    classifyAbort,
    type BuildDeps,
    type Deadline,
    type Hop,
    type Prepared,
    type RequestBody,
    type SendResult,
    type Timing,
} from './request.ts';
export { guessMime, isJsonType, isTextType, baseType } from './mime.ts';
export { formatJson, tryParseJson } from './json.ts';
export { createStyles, supportsColor, supportsFormatting, stripAnsi, type Styles } from './color.ts';
export { deriveDownloadFilename, sanitizeFilename, formatBytes } from './render.ts';
export { CliError, EXIT, formatError, type ExitCode } from './errors.ts';
export { run, main, type RunContext } from './cli.ts';
export { NAME, VERSION, USER_AGENT } from './version.ts';
