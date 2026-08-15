import { getSmtpTransport } from './smtp-transport.js'

export async function sendEml(eml: string, from: string, to: string[]) {
    return sendEmlEx(eml, from, to)
}

export async function sendEmlEx(
    eml: string,
    from: string,
    to: string[],
    filename: string = ''
) {
    const envelope = { from, to }
    const message = { envelope, raw: eml }
    const toStr = to.join(',')

    // send email

    try {
        const transport = getSmtpTransport()
        const res = await transport.sendMail(message)
        // console.log(res)
        // logger.info(res);
        return true
    } catch (err: any) {
        //
        //ECONNREFUSED
        console.log(err)

        if (err.code == 'ESOCKET') {
            // logger.error(`SMTP connection error: ${err.address} ${err.port}`);
            return false
        }

        // EENVELOPE
        else if (err.code == 'EENVELOPE') {
            const command = err.command
            const response = err.response
            const responseCode = err.responseCode

            const msg = `SMTP error: ${filename} ${from} ${toStr} ${command} ${responseCode} ${response}`
            // logger.error(msg);

            return false
        }

        //Unexpected socket close
        else if (err.message == 'Unexpected socket close') {
            //Unexpected socket close
            const msg = `SMTP error: ${err.message} ${filename} ${from} ${toStr}`
            // logger.error(msg);
            return false
        }

        //Catch other hard bounces
        else if (err.responseCode && err.responseCode >= 500) {
            const command = err.command
            const response = err.response
            const responseCode = err.responseCode

            const msg = `SMTP error/Hard Bounce: ${filename} ${from} ${toStr} ${command} ${responseCode} ${response}`
            // logger.error(msg);

            return false
        }

        //Other errors
        else {
            console.log(JSON.parse(JSON.stringify(err)))
            console.log(err)
            return false
        }
    }
}
