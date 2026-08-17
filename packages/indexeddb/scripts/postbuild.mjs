// Two gates on the build output, run from tsdown's onSuccess. Both are claims
// this package makes in its README and CHANGELOG, and a claim nothing checks
// is a claim that quietly stops being true.
//
// 1. The low-level bundle, dist/index.js, is byte-identical to the recorded
//    digest. The `./nexie` entry shares this package precisely because it
//    cannot change the `.` entry: the two source graphs are disjoint, and
//    tsdown's unconditional splitting would otherwise emit a shared chunk that
//    dist/index.js has to import. A change to the digest is therefore either a
//    deliberate change to the low-level API or a leak from the Nexie graph --
//    and only a human can tell which, so it has to be recorded on purpose:
//
//        UPDATE_BUNDLE_DIGEST=1 pnpm run build
//
// 2. dist/nexie.js carries the manifest version, not the '0.0.0-src' fallback:
//    the tsdown `define` substituting __NEXIE_VERSION__ is what makes
//    `Nexie.semVer` true, and it is easy to break without noticing.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const digestFile = path.join(root, 'low-level-bundle.sha256');

const fail = (message) => {
    console.error(`postbuild: ${message}`);
    process.exit(1);
};

// --- 1. the low-level bundle -------------------------------------------------

if (existsSync(path.join(dist, 'chunks'))) {
    fail(
        'dist/chunks/ exists. The two entries share a module, which means the ' +
            'Nexie graph imports something from the low-level graph (or vice ' +
            'versa) -- see the "Nexie" section of the repo CLAUDE.md.',
    );
}

const bundle = readFileSync(path.join(dist, 'index.js'));
const actual = createHash('sha256').update(bundle).digest('hex');
const recorded = existsSync(digestFile)
    ? readFileSync(digestFile, 'utf8').trim()
    : null;

if (process.env.UPDATE_BUNDLE_DIGEST) {
    writeFileSync(digestFile, `${actual}\n`);
    console.log(`postbuild: recorded dist/index.js digest ${actual}`);
} else if (recorded === null) {
    fail(
        `${path.basename(digestFile)} is missing. Record the current low-level ` +
            'bundle with UPDATE_BUNDLE_DIGEST=1 pnpm run build.',
    );
} else if (recorded !== actual) {
    fail(
        `dist/index.js changed (sha256 ${actual}, recorded ${recorded}). ` +
            'If the low-level API changed on purpose, re-record it with ' +
            'UPDATE_BUNDLE_DIGEST=1 pnpm run build and say so in the CHANGELOG. ' +
            'If it did not, something in the Nexie graph leaked into the ' +
            'low-level bundle.',
    );
}

// --- 2. the Nexie version -----------------------------------------------------

const { version } = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const nexie = readFileSync(path.join(dist, 'nexie.js'), 'utf8');
if (!nexie.includes(`"${version}"`) || nexie.includes('0.0.0-src')) {
    fail(
        `dist/nexie.js does not carry the manifest version ${version}: the ` +
            '__NEXIE_VERSION__ define in tsdown.config.ts is not being applied.',
    );
}
