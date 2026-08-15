import dotenv from 'dotenv'
import nodemailer from 'nodemailer'

dotenv.config()

const eml = `From: wdc@example.com
To: to@example.com,another@example.com
Subject: Queue Report
Content-Type: text/plain; charset=utf-8

Salam!`

const smtpOptions = {
    host: process.env.SMTP_HOST || 'localhost',
    port: 2525,
    secure: false,
    connectionTimeout: 1000,
    pool: false,
    maxConnections: 100,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || '',
    },
}

const transport = nodemailer.createTransport(smtpOptions)
// const verifyResults = await transport.verify()

async function run() {
    // const transport = nodemailer.createTransport(smtpOptions)

    const from = process.env.EMAIL_FROM || 'wdc@example.com'
    const toStr = process.env.EMAIL_TO || 'to@example.com'
    const to = toStr.split(/,/)

    const envelope = { from, to }
    const message = { envelope, raw: eml }

    console.log('sending email...')
    const res = await transport.sendMail(message)
    console.log('Result ', res)
}

setTimeout(run, 500)
setTimeout(run, 600)
setTimeout(run, 700)
