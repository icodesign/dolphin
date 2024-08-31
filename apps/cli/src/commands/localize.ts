import { consoleLogger, logDirectory, logger } from '@repo/base/logger';
import spinner from '@repo/base/spinner';
import chalk from 'chalk';
import { Arguments, ArgumentsCamelCase, Argv, CommandModule } from 'yargs';

import {
  exportLocalizations,
  formattedDuration,
  importLocalizations,
  loadConfig,
  translateLocalizations,
} from './core.js';

interface CmdArgs extends Arguments {
  config?: string;
}

const cmd: CommandModule<{}, CmdArgs> = {
  command: 'localize',
  describe:
    'Automatically localize the project, including exporting, translating and importing localization strings.',
  builder: (yargs: Argv<{}>) => {
    return yargs.options({
      config: {
        alias: 'c',
        describe:
          'Path to the config file. Will search dolphin.y[a]ml under root path if not specified',
        type: 'string',
      },
    });
  },
  handler: async (args: ArgumentsCamelCase<CmdArgs>) => {
    try {
      await handleLocalizeCommand(args);
    } catch (e) {
      spinner.fail(
        chalk.red(`Failed to localize strings: ${(e as Error).stack}`),
      );
      process.exit(1);
    }
  },
};

export default cmd;

async function handleLocalizeCommand(args: CmdArgs) {
  logger.info('\n\n\n\n\n');
  logger.info('===================================');
  logger.info('============= Localize ============');
  logger.info('===================================');
  consoleLogger.info(
    chalk.gray(
      `Full logs directory: ${logDirectory}, check out for details if needed\n`,
    ),
  );
  var initialStartTime = performance.now();
  if (!args.config) {
    spinner.fail(chalk.red('Config file path is not specified'));
    return;
  }
  const config = await loadConfig({
    path: args.config,
  });
  const translationBundle = await exportLocalizations(config);
  await translateLocalizations({
    baseOutputFolder: translationBundle.baseOutputFolder,
    config,
  });
  await importLocalizations({
    config,
    translationBundle,
  });
  const duration = formattedDuration(performance.now() - initialStartTime);
  spinner
    .next(chalk.green(`Done (Total ${duration})`))
    .succeed(undefined, { logging: false });
}
