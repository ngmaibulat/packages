import path from 'node:path';
import cliTable from 'cli-table3';
import color from '@colors/colors';
import type { HorizontalAlignment } from 'cli-table3';

import { isDir } from '../../dir.js';
import { lsDirEx } from '../../dir.js';
import { hashMD5, hashSHA256 } from '../../index.js';
import type { FileStat, DirContents } from '../../index.js';
import type { LsOptions, HashResults } from '../types.js';

import { formatDate } from '../date.js';

export function formatTable(data: HashResults[]): string {
    const alignRight: HorizontalAlignment = 'right';
    const alignLeft: HorizontalAlignment = 'left';
    //make footer
    const len = data.length;
    const footer = [
        { colSpan: 2, content: 'Total', hAlign: alignRight },
        { content: len.toString(), hAlign: alignLeft },
        { content: '' },
    ];

    const table = new cliTable({
        head: [
            // { content: 'foo', hAlign: 'center' },
            color.green('Name'),
            color.green('Type'),
            color.green('MD5'),
            color.green('SHA256'),
        ],
        colWidths: [20, 20, 36, 70],
    });

    for (const row of data) {
        const arr = [
            color.yellow(row.filename),
            color.yellow(row.filetype),
            color.yellow(row.md5),
            color.yellow(row.sha256),
        ];
        //@ts-ignore
        table.push(arr);
    }

    table.push(footer);

    return table.toString();
}

export async function calcHashes(dirname: string, data: DirContents): Promise<HashResults[]> {
    const results: HashResults[] = [];

    for (const row of data.files) {
        const rpath = path.resolve(dirname, row.filename);
        const md5 = await hashMD5(rpath);
        const sha256 = await hashSHA256(rpath);

        const item = {
            filename: row.filename,
            filetype: row.filetype || '',
            md5: md5,
            sha256: sha256,
        };
        results.push(item);
    }

    return results;
}

export async function actionHash(options: LsOptions) {
    let dirname = '.';

    if (options.dir) {
        const found = await isDir(options.dir);
        if (!found) {
            console.error('Directory not found: ', options.dir);
            process.exit(1);
        }

        dirname = options.dir;
    }

    const data = await lsDirEx(dirname);
    const hashes = await calcHashes(dirname, data);
    const out = formatTable(hashes);
    console.log(out);
}
