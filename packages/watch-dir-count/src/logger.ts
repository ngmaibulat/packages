import pino from 'pino'
import { readJson } from '@aibulat/json'
import type { Logger as MailLogger } from 'nodemailer/lib/shared'

/**
 * `log.cfg.json` keeps its bunyan-shaped schema on purpose: this is a published
 * CLI and its users already have these files. The translation is mechanical
 * because bunyan's level names *and* numbers are identical to pino's
 * (trace=10 .. fatal=60).
 */
type StreamCfg = {
    level?: pino.Level | number
    path?: string
    type?: string
}

type LogCfg = {
    name?: string
    level?: pino.Level | number
    streams?: StreamCfg[]
}

function toLevel(level: StreamCfg['level'], fallback: pino.Level): pino.Level {
    if (level === undefined) {
        return fallback
    }

    if (typeof level === 'number') {
        const label = pino.levels.labels[level]

        if (!label) {
            throw new Error(`log.cfg.json: unknown level ${level}`)
        }

        return label as pino.Level
    }

    return level
}

const config = await readJson<LogCfg>('log.cfg.json')
const defaultLevel = toLevel(config.level, 'info')
const configured = config.streams?.length ? config.streams : [{}]

const streams = configured.map((s) => {
    if (s.type === 'rotating-file') {
        // bunyan implemented rotation through its optional `mv` dependency,
        // which is the whole reason this package moved off bunyan. Fail loudly
        // rather than silently write a file that never rotates.
        throw new Error(
            'log.cfg.json: "rotating-file" streams are not supported; use logrotate'
        )
    }

    return {
        level: toLevel(s.level, defaultLevel),
        // mkdir is deliberately new behaviour. bunyan died with ENOENT when the
        // directory named in `path` did not exist, which is why the README used
        // to open with `mkdir log`.
        stream: s.path
            ? pino.destination({ dest: s.path, mkdir: true, sync: true })
            : pino.destination({ dest: 1, sync: true }),
    }
})

// With multistream the logger's own level filters records *before* the streams
// are consulted, so it has to sit at the most verbose of them - otherwise the
// quietest stream silently decides what every other one gets.
const minLevel = streams.reduce(
    (lo, s) =>
        pino.levels.values[s.level] < pino.levels.values[lo] ? s.level : lo,
    streams[0].level
)

export const logger = pino(
    {
        name: config.name,
        level: minLevel,
        // bunyan wrote an ISO string; keep the field readable rather than
        // switching every existing log reader over to epoch milliseconds.
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(streams)
)

/**
 * nodemailer's `Logger` type wants `level` as a *method*; pino exposes it as a
 * string property. bunyan happened to satisfy the former, which is why the old
 * logger could be passed straight through. Adapt rather than cast.
 */
const bind =
    (level: pino.Level) =>
    (...params: any[]) => {
        ;(logger[level] as (...p: any[]) => void)(...params)
    }

export const mailLogger: MailLogger = {
    level: (level) => {
        logger.level = level
    },
    trace: bind('trace'),
    debug: bind('debug'),
    info: bind('info'),
    warn: bind('warn'),
    error: bind('error'),
    fatal: bind('fatal'),
}
