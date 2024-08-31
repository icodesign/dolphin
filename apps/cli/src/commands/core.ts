import { Config, LocalizationFormat, parseConfig } from '@repo/base/config';
import { consoleLogger, logger } from '@repo/base/logger';
import spinner from '@repo/base/spinner';
import { createTemporaryOutputFolder, replaceBundle } from '@repo/ioloc';
import {
  LocalizationBundlePath,
  exportLocalizationBundle,
  importLocalizationBundle,
  textHash,
} from '@repo/ioloc';
import { mergeBundles, translateBundle } from '@repo/translate';
import chalk from 'chalk';
import path from 'node:path';

export async function loadConfig({ path }: { path?: string }) {
  var startTime = performance.now();
  spinner.update('Loading config').start();
  const config = await parseConfig(path);
  var duration = formattedDuration(performance.now() - startTime);
  spinner.succeed(chalk.green(`Configuration loaded (${duration})`));
  consoleLogger.info(
    chalk.gray(
      `${JSON.stringify(
        config,
        (key, value) => {
          if (key === 'apiUrl') {
            return undefined;
          } else {
            return value;
          }
        },
        2,
      )}\n`,
    ),
  );
  return config;
}

export async function exportLocalizations(config: Config) {
  var startTime = performance.now();
  const message =
    config.localizations.filter((x) => x.format === LocalizationFormat.XCODE)
      .length > 0
      ? `Exporting localizations (Xcode project may take a while)`
      : 'Exporting localizations';
  spinner.update(message).start();
  const baseFolder = path.dirname(config.path);
  var exportedResults: LocalizationBundlePath[] = [];
  let baseOutputFolder = config.exportFolder || '.dolphin';
  if (!path.isAbsolute(baseOutputFolder)) {
    baseOutputFolder = path.join(baseFolder, baseOutputFolder);
  }
  const temporaryOutputFolder = await createTemporaryOutputFolder();
  for (const localizationConfig of config.localizations) {
    // export to temporary folder first and then merge into baseOutputFolder
    let outputFolder = path.join(
      temporaryOutputFolder,
      localizationFolder(localizationConfig.id),
    );
    const exportResult = await exportLocalizationBundle({
      config: localizationConfig,
      baseLanguage: config.baseLanguage,
      baseFolder,
      outputFolder,
    });
    exportedResults.push(exportResult);
  }
  const bundlePaths = exportedResults.map((result) => result.bundlePath);
  logger.info(`Merging previous translations...`);
  await mergeBundles(temporaryOutputFolder, baseOutputFolder);
  logger.info(
    `Base output folder: ${baseOutputFolder}, temporary output folder: ${temporaryOutputFolder}`,
  );
  await replaceBundle(baseOutputFolder, temporaryOutputFolder);
  const duration = formattedDuration(performance.now() - startTime);
  spinner.succeed(
    chalk.green(
      `${exportedResults.length} localization bundles exported (${duration})`,
    ),
  );
  consoleLogger.info(chalk.gray(`${JSON.stringify(bundlePaths, null, 2)}\n`));
  logger.info(
    `Exported ${
      exportedResults.length
    } localization bundles at ${exportedResults
      .map((result) => result.bundlePath)
      .join(', ')}`,
  );
  return {
    baseOutputFolder,
    intermediateBundlePaths: exportedResults.map(
      (x) => x.intermediateBundlePath,
    ),
  };
}

export async function translateLocalizations({
  baseOutputFolder,
  config,
}: {
  baseOutputFolder: string;
  config: Config;
}) {
  const startTime = performance.now();
  spinner.update('Translating localizations', {
    logging: false,
  });
  logger.info(`Translating localization bundle at ${baseOutputFolder}`);
  const translationResult = await translateBundle(
    baseOutputFolder,
    config,
    spinner,
  );
  const translated = translationResult.mergedStrings;
  const translatedCount = Object.keys(translated).length;
  if (translatedCount === 0) {
    spinner.succeed(chalk.green('No string needs to be translated\n'));
    return;
  }
  const duration = formattedDuration(performance.now() - startTime);
  spinner.succeed(
    chalk.green(
      `Finished translation process for ${translatedCount} strings (${duration})`,
    ),
  );
  logger.log({
    console: true,
    level: 'info',
    message: chalk.gray(
      `${JSON.stringify(translationResult.additionalInfo, null, 2)}\n`,
    ),
  });
  logger.info(`Finished translating localization bundle`);
}

export async function importLocalizations({
  config,
  translationBundle,
}: {
  config: Config;
  translationBundle: {
    baseOutputFolder: string;
    intermediateBundlePaths: (string | undefined)[];
  };
}) {
  const startTime = performance.now();
  const containsXcodeFormat =
    config.localizations.filter((x) => x.format === LocalizationFormat.XCODE)
      .length > 0;
  let message = 'Merging translations';
  if (containsXcodeFormat) {
    message += ' (Xcode project may take a while)';
  }
  spinner.next(message).start();
  logger.info(`Merging localization bundles...`);
  for (var index = 0; index < config.localizations.length; index++) {
    const localizationConfig = config.localizations[index];
    const bundlePath = path.join(
      translationBundle.baseOutputFolder,
      localizationFolder(localizationConfig.id),
    );
    await importLocalizationBundle({
      config: localizationConfig,
      localizationBundlePath: {
        bundlePath,
        intermediateBundlePath:
          translationBundle.intermediateBundlePaths[index],
      },
      baseLanguage: config.baseLanguage,
      baseFolder: path.dirname(config.path),
    });
  }
  const duration = formattedDuration(performance.now() - startTime);
  spinner.succeed(chalk.green(`Translations merged (${duration})\n`));
}

export function formattedDuration(duration: number) {
  if (duration < 1000) {
    return `${duration.toFixed(2)}ms`;
  } else {
    return `${(duration / 1000).toFixed(2)}s`;
  }
}

function localizationFolder(id: string) {
  return textHash(id).slice(0, 8);
}
