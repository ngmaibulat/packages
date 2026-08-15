import child_process from 'node:child_process'

import dotenv from 'dotenv'
import color from '@colors/colors'
import { countDir } from '@aibulat/fs'
import { MIN_SECONDS } from './config.js'
import { renderEmail } from './render.js'
import { sendEml } from './smtp.js'

dotenv.config()

export function sleep(ms: number) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms)
    })
}

export function getInterval() {
    let tm = parseInt(process.env.INTERVAL || `${MIN_SECONDS}`)

    if (tm < MIN_SECONDS) {
        tm = MIN_SECONDS
    }

    tm *= 1000 //convert seconds to milliseconds
    return tm
}

export function getThreshold() {
    let threshold = parseInt(process.env.THRESHOLD || `0`)
    return threshold
}

export function getTime() {
    const dt = new Date()
    const msg = dt.toTimeString()
    return msg
}

export async function exec(cmd: string, args: string[]): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = child_process.spawn(cmd, args, { stdio: 'inherit' })

        child.on('error', (err) => {
            reject(err)
        })

        child.on('close', (code) => {
            //check return code
            if (code === null) {
                reject()
                return
            }

            resolve(code)
        })
    })
}

export async function run() {
    console.log('')
    const tm = getTime()
    const threshold = getThreshold()

    const dir = process.env.DIR || `.`
    const res = await countDir(dir)

    let msg: string = `[${tm}] dir=${dir} threshold=${threshold} count=${res}\n`
    let shouldExec = false

    if (res > threshold) {
        msg = color.red(msg)
        shouldExec = true
    } else {
        msg = color.green(msg)
    }

    process.stdout.write(msg)

    if (shouldExec) {
        // const program = process.env.EXEC || 'ls'
        // const args = ['-la']
        // {{dir}} {{count}}

        let execStr = process.env.EXEC || 'ls -la'
        execStr = execStr.replace('{{dir}}', dir)
        execStr = execStr.replace('{{count}}', res.toString())
        const execArr = execStr.split(/\s+/)

        const program = execArr[0]
        const args = execArr.slice(1)
        let retcode = 0

        try {
            retcode = await exec(program, args)
            const execmsg = color.green(
                `exec="${execStr}" retcode=${retcode}\n`
            )
            process.stdout.write(execmsg)
        } catch (err) {
            console.error(`Error executing: "${execStr}"`)
        }

        const eml = renderEmail(dir, res, execStr, retcode)
        const from = process.env.EMAIL_FROM || 'wdc@example.com'
        const toStr = process.env.EMAIL_TO || 'to@example.com'
        const to = toStr.split(/,/)

        try {
            const sent = await sendEml(eml, from, to)
        } catch (err: any) {
            console.error('Error sending email')
            console.error(err)
        }
    }
}
