import { Readable } from 'node:stream'
import fs from 'node:fs/promises'
import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'
import isFile from '@aibulat/isfile'
import { cliOptions } from './types.js'

export function streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = []
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk))
        stream.on('error', reject)
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
}

export async function handle(options: cliOptions) {
    let str = ''

    if (options.file) {
        const exists = await isFile(options.file)
        if (!exists) {
            console.error('File not found:', options.file)
            process.exit(1)
        }

        //read file into str
        str = await fs.readFile(options.file, 'utf-8')
    }
    //read from stdin
    else {
        str = await streamToString(process.stdin)
    }

    marked.setOptions({
        // Define custom renderer.
        //
        // The cast bridges two hand-written type stubs that disagree:
        // @types/marked-terminal is stuck at 3.x (there is no 4.x or 5.x on npm,
        // and marked-terminal ships no types of its own), so its TerminalRenderer
        // does not structurally match the Renderer that @types/marked@4 expects —
        // its `options.renderer` is nullable, marked's is not. The two are
        // compatible at runtime; only the stubs are out of step.
        renderer: new TerminalRenderer() as unknown as Parameters<typeof marked.setOptions>[0]["renderer"],
    })

    // Show the parsed data
    const out = marked(str)
    console.log(out)
}
