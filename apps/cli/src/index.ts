import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { commands } from './commands/index.js';

// process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'
// process.env['NODE_NO_WARNINGS'] = '1'
// process.removeAllListeners('warning')

const parser = yargs(hideBin(process.argv))
  .command(commands)
  .version('0.1.0')
  .help()
  .alias('help', 'h');

(async () => {
  await parser.argv;
})();
