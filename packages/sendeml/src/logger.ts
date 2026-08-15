import path from "node:path";
import winston from "winston";

const logDir = process.env.LOG_DIR || "./log";
const logLevel = process.env.LOG_LEVEL || "info";
const pathAll = path.resolve(logDir, "all.log");
const pathErr = path.resolve(logDir, "error.log");

const defaultFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

const cliJsonFormat = winston.format.combine(
    winston.format.prettyPrint({ depth: 4, colorize: true }),
    winston.format.timestamp(),
    winston.format.json()
);

const cliFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.cli(),
    winston.format.printf((info) => {
        return `${info.timestamp} ${info.level}: ${info.message}`;
    })
);

export const logger = winston.createLogger({
    level: logLevel,
    // format: winston.format.json(),
    format: defaultFormat,
    // defaultMeta: { service: "user-service" },
    transports: [
        //
        // - Write all logs with importance level of `error` or less to `error.log`
        // - Write all logs with importance level of `info` or less to `combined.log`
        //
        new winston.transports.File({ filename: pathErr, level: "error" }),
        new winston.transports.File({ filename: pathAll }),
    ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.LOG_CLI) {
    const transport = new winston.transports.Console({
        level: "debug",
        format: cliJsonFormat,
    });

    logger.add(transport);
}

// winston.add(winston.transports.Console, {'timestamp':true,'colorize':true);
