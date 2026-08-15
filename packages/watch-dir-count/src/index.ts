#!/usr/bin/env -S node --no-warnings

import { run, getInterval, sleep } from './lib.js'

// setInterval(run, getInterval())

const interval = getInterval()

while (true) {
    await run()
    await sleep(interval)
}

// for (let i = 0; i < 9; i++) {
//     await run()
//     await sleep(interval)
// }
