import { FLAGS, type FlagGroup, type FlagSpec } from './flags.ts';
import { OPTIONAL_SHORTCUTS, SHORTCUT_METHODS } from './args.ts';

const GROUP_TITLES: Record<FlagGroup, string> = {
    body: 'Request body',
    auth: 'Authentication',
    output: 'Output',
    network: 'Network',
    meta: 'Meta',
};

const GROUP_ORDER: FlagGroup[] = ['body', 'auth', 'output', 'network', 'meta'];

function flagUsage(name: string, spec: FlagSpec): string {
    const short = spec.short === undefined ? '    ' : `-${spec.short}, `;
    const value = spec.valueName === undefined ? '' : ` ${spec.valueName}`;
    return `  ${short}--${name}${value}`;
}

function renderFlags(): string {
    const entries = Object.entries(FLAGS as Record<string, FlagSpec>).filter(([, spec]) => spec.hidden !== true);

    const width = Math.max(...entries.map(([name, spec]) => flagUsage(name, spec).length));

    const sections: string[] = [];

    for (const group of GROUP_ORDER) {
        const inGroup = entries.filter(([, spec]) => spec.group === group);
        if (inGroup.length === 0) continue;

        const lines = inGroup.map(([name, spec]) => `${flagUsage(name, spec).padEnd(width)}  ${spec.description}`);
        sections.push(`${GROUP_TITLES[group]}:\n${lines.join('\n')}`);
    }

    return sections.join('\n\n');
}

export function renderHelp(invokedAs: string, fixedMethod: string | undefined): string {
    const usage =
        fixedMethod === undefined
            ? `Usage: ${invokedAs} [METHOD] URL [ITEM...] [OPTIONS]`
            : `Usage: ${invokedAs} URL [ITEM...] [OPTIONS]`;

    const shortcuts = SHORTCUT_METHODS.map((m) =>
        (OPTIONAL_SHORTCUTS as readonly string[]).includes(m) ? `${m}*` : m,
    ).join(' ');

    return `${usage}

An HTTPie-style HTTP client with a shortcut command per method.

Request items (order does not matter, repeat as needed):
  Name:value        request header      Authorization:'Bearer tok'
  Name:             remove a default header
  Name;             send a header with an empty value
  name==value       URL query parameter q==search  page==2
  name=value        body field, string  name=Alice
  name:=value       body field, raw JSON  age:=30  tags:='["a","b"]'
  name=@path        body field, string read from a file
  name:=@path       body field, JSON read from a file
  name@path         file upload (forces multipart)

  Prefix a separator with \\ to include it in a name: 'weird\\:key=value'.

${renderFlags()}

Method shortcuts:
  ${shortcuts}
  * head and patch would shadow system commands, so they are not installed by
    default. Use 'httpc head URL', or run 'httpc link head patch' to opt in.

Exit codes:
  0 response received   1 network/file error   2 usage error   3 timeout
  4 too many redirects  5/6/7 4xx/5xx/3xx with --check-status

Examples:
  get example.com/api q==search Authorization:'Bearer tok'
  post example.com/users name=Alice age:=30
  post example.com/upload avatar@photo.png caption='hi'
  query example.com/search filter=active limit:=10
  echo '{"a":1}' | post example.com/things
`;
}
