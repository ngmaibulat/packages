import dotenv from 'dotenv'
import { renderEmail } from './render.js'

dotenv.config()
const html = renderEmail('/var/queue/dir', 55, 'ls -la', 0)

// Log the generated HTML for testing purposes
console.log(html)
