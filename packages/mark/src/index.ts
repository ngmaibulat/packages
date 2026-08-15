#!/usr/bin/env -S node --no-warnings

import { Command, Option } from 'commander'
import { handle } from './lib.js'

const program = new Command()

const name = 'mark'
const description = 'cli markdown renderer'
const version = '0.0.1'

program.name(name).description(description).version(version)

program
    .command('render', { isDefault: true })
    .description('render markdown')
    .option('-f, --file <file>', 'render <file>')
    .action(handle)

program.parse()
