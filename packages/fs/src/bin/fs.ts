#!/usr/bin/env -S node --no-warnings

import { Command, Option } from 'commander';
import { actionHelpChmod } from './actions/help-chmod.js';
import { actionLs } from './actions/ls.js';
import { actionHash } from './actions/hash.js';

const program = new Command();

const name = 'fs';
const description = 'fs utilities: ls, mkdir, etc';
const version = '0.0.2';

program.name(name).description(description).version(version);

program
    .command('help-chmod')
    .description('Show help on rwx')
    // .option('--format', 'Format', 'cli')
    .addOption(new Option('-f, --format <format>', 'format').choices(['cli', 'html', 'markdown']))
    .action(actionHelpChmod);

program
    .command('ls')
    .description('list directory entries')
    // .option('--format', 'Format', 'cli')
    .option('-d, --dir <dir>', 'show <dir>')
    .action(actionLs);

program
    .command('hashes')
    .description('show hashes. can be very resourse intensive')
    .option('-d, --dir <dir>', 'show hashes for files in <dir>')
    .action(actionHash);

program.parse();

/**
 * program
  .addOption(new Option('-s, --secret').hideHelp())
  .addOption(new Option('-t, --timeout <delay>', 'timeout in seconds').default(60, 'one minute'))
  .addOption(new Option('-d, --drink <size>', 'drink size').choices(['small', 'medium', 'large']))
  .addOption(new Option('-p, --port <number>', 'port number').env('PORT'))
  .addOption(new Option('--donate [amount]', 'optional donation in dollars').preset('20').argParser(parseFloat))
  .addOption(new Option('--disable-server', 'disables the server').conflicts('port'))
  .addOption(new Option('--free-drink', 'small drink included free ').implies({ drink: 'small' }));
 *
 */
