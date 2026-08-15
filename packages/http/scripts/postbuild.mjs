// tsc preserves the shebang but not the executable bit. Fix that, and fail loudly
// if a bin ever loses its shebang -- a bin without one is broken on every platform.
import { chmod, open, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const binDir = path.join(root, 'dist', 'bin');

const SHEBANG = '#!/usr/bin/env node';

const files = (await readdir(binDir)).filter((f) => f.endsWith('.js'));

if (files.length === 0) {
    console.error(`postbuild: no bins found in ${binDir}`);
    process.exit(1);
}

for (const file of files) {
    const full = path.join(binDir, file);

    const fh = await open(full, 'r');
    const { buffer } = await fh.read(Buffer.alloc(SHEBANG.length), 0, SHEBANG.length, 0);
    await fh.close();

    if (buffer.toString('utf8') !== SHEBANG) {
        console.error(`postbuild: ${path.relative(root, full)} is missing the '${SHEBANG}' shebang`);
        process.exit(1);
    }

    await chmod(full, 0o755);
}

console.log(`postbuild: ${files.length} bins verified and made executable`);
