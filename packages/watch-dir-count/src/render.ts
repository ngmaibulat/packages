import fs from 'node:fs'
import path from 'node:path'
import handlebars from 'handlebars'

/**
 * Locate the bundled `templates/` directory.
 *
 * The default template used to be resolved as './templates/default.eml', which
 * only worked when the process happened to be started from the package root.
 * Installed as a global CLI it never was, and the read threw ENOENT.
 *
 * Walk up from this module instead. The walk (rather than a fixed '../templates')
 * is deliberate: tsdown splits code unconditionally, so this module lands in
 * dist/ in one build and dist/chunks/ in another, and a hardcoded depth silently
 * points at the wrong place.
 */
function templatesDir(): string {
    let dir = import.meta.dirname

    while (true) {
        const candidate = path.join(dir, 'templates')

        if (fs.existsSync(candidate)) {
            return candidate
        }

        const parent = path.dirname(dir)

        if (parent === dir) {
            throw new Error('could not locate the templates directory')
        }

        dir = parent
    }
}

export function renderEmail(
    directory: string,
    numFiles: number,
    execStr: string,
    retcode: number
): string {
    //use env vars
    const templatePath =
        process.env.EMAIL_TEMPLATE || path.join(templatesDir(), 'default.eml')
    const from = process.env.EMAIL_FROM || 'wdc@example.com'
    const to = process.env.EMAIL_TO || 'to@example.com'
    const subject = process.env.EMAIL_SUBJECT || 'Queue Report'

    const date = new Date().toTimeString()

    // Read the email template file
    const template = fs.readFileSync(templatePath, 'utf8')

    // Compile the template using Handlebars
    const compiledTemplate = handlebars.compile(template)

    // Render the template with the directoryName and numberOfFiles values
    const html = compiledTemplate({
        from,
        to,
        subject,
        directory,
        numFiles,
        date,
        execStr,
        retcode,
    })

    return html
}
