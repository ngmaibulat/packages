import cliTable from 'cli-table3';
import color from '@colors/colors';
import type { HelpChmodOptions } from '../types.js';

export function helpChmod() {
    const table = new cliTable({
        head: [color.green('String'), color.green('Binary'), color.green('Decimal')],
        colWidths: [20, 20, 20],
    });

    table.push(['rwx', '111', '7']);
    table.push(['rw-', '110', '6']);
    table.push(['r-x', '101', '5']);
    table.push(['r--', '100', '4']);
    table.push(['-wx', '011', '3']);
    table.push(['-w-', '010', '2']);
    table.push(['--x', '001', '1']);
    table.push(['---', '000', '0']);

    return table.toString();
}

export function helpChmodMarkdown() {
    //create markdown

    const out = `
| String   | Binary   | Decimal |
|----------|----------|---------|
| rwx      | 111      | 7       |
| rw-      | 110      | 6       |
| r-x      | 101      | 5       |
| r--      | 100      | 4       |
| -wx      | 011      | 3       |
| -w-      | 010      | 2       |
| --x      | 001      | 1       |
| ---      | 000      | 0       |
`;

    return out;
}

export function helpChmodHtml() {
    const out = `
<table>
    <tr>
        <td>rwx</td> <td>111</td> <td>7</td>
        <td>rw-</td> <td>110</td> <td>6</td>
        <td>r-x</td> <td>101</td> <td>5</td>
        <td>r--</td> <td>100</td> <td>4</td>
        <td>-wx</td> <td>011</td> <td>3</td>
        <td>-w-</td> <td>010</td> <td>2</td>
        <td>--x</td> <td>001</td> <td>1</td>
        <td>---</td> <td>000</td> <td>0</td>
    </tr>
</table>
`;

    return out;
}

export async function actionHelpChmod(options: HelpChmodOptions) {
    if (!options.format) {
        options.format = 'cli';
    }

    if (options.format == 'cli') {
        const msg = helpChmod();
        console.log(msg);
    }
    //html
    else if (options.format == 'html') {
        const msg = helpChmodHtml();
        console.log(msg);
    }
    //markdown
    else if (options.format == 'markdown') {
        const msg = helpChmodMarkdown();
        console.log(msg);
    }
    //wtf
    else {
        throw new Error('Unsupported format in actionHelpChmod()');
    }
}
