import { isDir, lsDir, countDir } from './dir.js';
import { moveFile } from './ops.js';
import { hashMD5, hashSHA256 } from './hash.js';
import { readFile, readFileAsString } from './read.js';
import { getFileType } from './fileType.js';

// Type-only: the bundler needs the `type` modifier to know these erase. `tsc`
// alone did not care, which is why the old build tolerated a value re-export.
import type { UserData, FileStat, DirContents } from './types.js';

export {
    isDir,
    lsDir,
    countDir,
    moveFile,
    hashMD5,
    hashSHA256,
    readFile,
    readFileAsString,
    getFileType,
};

export type { UserData, FileStat, DirContents };
