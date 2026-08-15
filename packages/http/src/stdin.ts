import readline from 'node:readline';

/**
 * Buffer piped stdin in full.
 *
 * Streaming it into `fetch` would require `duplex: 'half'`, which drops Content-Length in
 * favour of chunked encoding and makes the body unreplayable across redirects. Large
 * uploads should use `--file` or an `@` item, which stay lazy via `fs.openAsBlob`.
 */
export async function readStdin(): Promise<Buffer | null> {
    if (process.stdin.isTTY) return null;

    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }

    return Buffer.concat(chunks);
}

/** Ask for a password on the terminal without echoing it. */
export async function promptPassword(user: string): Promise<string> {
    const input = process.stdin;
    const output = process.stderr;

    const rl = readline.createInterface({ input, output, terminal: true });

    const wasRaw = input.isRaw === true;
    if (input.isTTY && !wasRaw) input.setRawMode(true);

    try {
        output.write(`password for ${user}: `);

        const answer = await new Promise<string>((resolve) => {
            let value = '';

            const onData = (data: Buffer): void => {
                const text = data.toString('utf8');

                for (const ch of text) {
                    if (ch === '\r' || ch === '\n') {
                        input.off('data', onData);
                        output.write('\n');
                        resolve(value);
                        return;
                    }
                    if (ch === '') {
                        // Ctrl-C
                        input.off('data', onData);
                        output.write('\n');
                        process.exit(130);
                    }
                    if (ch === '' || ch === '\b') {
                        value = value.slice(0, -1);
                        continue;
                    }
                    value += ch;
                }
            };

            input.on('data', onData);
        });

        return answer;
    } finally {
        if (input.isTTY && !wasRaw) input.setRawMode(false);
        rl.close();
    }
}
