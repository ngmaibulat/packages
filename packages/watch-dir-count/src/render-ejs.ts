import fs from 'node:fs'

import dotenv from 'dotenv'
import ejs from 'ejs'

// Replace directoryName and numberOfFiles with actual values
const directory = 'directory'
const numFiles = 10
const templatePath = 'templates/default.html'

// Read the email template file
const template = fs.readFileSync(templatePath, 'utf8')

// Render the template with the directoryName and numberOfFiles values
const html = ejs.render(template, { directory, numFiles })

// Log the generated HTML for testing purposes
console.log(html)
