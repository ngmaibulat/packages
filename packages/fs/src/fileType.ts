import { FileMagic, MagicFlags } from '@npcz/magic';

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const magicFile = require.resolve('@npcz/magic/dist/magic.mgc');
FileMagic.magicFile = magicFile;

// We can only use MAGIC_PRESERVE_ATIME on operating systems that support
// it and that includes OS X for example. It's a good practice as we don't
// want to change the last access time because we are just checking the file
// contents type

if (process.platform === 'darwin' || process.platform === 'linux') {
    FileMagic.defaultFlags = MagicFlags.MAGIC_PRESERVE_ATIME;
}

const instance = await FileMagic.getInstance();

export function getFileType(file: string): string {
    //instance.detect(file, instance.flags | MagicFlags.MAGIC_MIME)
    const res = instance.detect(file);
    return res;
}
