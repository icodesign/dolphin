import input from '@inquirer/input';
import select from '@inquirer/select';
import {
  Config,
  LLMProviderConfigSchema,
  LLMTranslatorConfigSchema,
  TranslatorConfig,
} from '@repo/base/config';
import { logger } from '@repo/base/logger';
import { Spinner } from '@repo/base/spinner';
import { Xliff, parseXliff2Path } from '@repo/ioloc/xliff';
import chalk from 'chalk';
import fetch from 'node-fetch';
import fs from 'node:fs';
import path from 'node:path';

import {
  LOCALITION_REVIEW_SUBSTATE_DECLINED,
  LOCALITION_REVIEW_SUBSTATE_REFINE_NEEDED,
  LOCALIZATION_STATE_FINAL,
  LOCALIZATION_STATE_REVIEWED,
  LocalizationEntity,
  LocalizationEntityDictionary,
  convertXliffsToEntities,
  mergePreviousTranslatedXliff,
  writeTranslatedStringsToExistingFile,
} from './entity.js';
import { DolphinAPITranslator } from './translator/dolphin/index.js';
import { Translator } from './translator/index.js';

export enum TranslationMode {
  AUTOMATIC = 'automatic', // No user interaction needed. The program will find the most suitable translation for each string.
  INTERACTIVE = 'interactive', // Ask user for confirmation for each string translation.
}

// Example bundle structure:
// - bundlePath
// | - abcd1234
// |   | - en.xliff
// |   | - zh-Hans.xliff
// | - efgh5678
//     | - ja.xliff
export async function translateBundle(
  bundlePath: string,
  config: Config,
  spinner?: Spinner,
): Promise<{
  mergedStrings: LocalizationEntityDictionary;
  additionalInfo: any;
}> {
  const subfolders = await fs.promises.readdir(bundlePath, {
    withFileTypes: true,
  });
  const subfolderNames = subfolders
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
  let xliffFilePaths: string[] = [];
  for (const subfolderName of subfolderNames) {
    const subfolder = path.join(bundlePath, subfolderName);
    const xliffFiles = await fs.promises.readdir(subfolder, {
      withFileTypes: true,
    });
    const xliffFileNames = xliffFiles
      .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.xliff'))
      .map((dirent) => dirent.name);
    xliffFilePaths.push(
      ...xliffFileNames.map((fileName) => path.join(subfolder, fileName)),
    );
  }
  var xliffs: Xliff[] = [];
  for (const xliffFilePath of xliffFilePaths) {
    const doc = await parseXliff2Path(xliffFilePath);
    const extracted = doc.elements;
    xliffs.push(...extracted);
  }
  logger.info(`Merging ${xliffs.length} parsed files`);
  const mergedStrings = convertXliffsToEntities(xliffs);
  const count = Object.keys(mergedStrings).length;
  spinner?.succeed(chalk.green(`${count} strings to be translated\n`));
  if (count === 0) {
    logger.info(`No strings found, skipping translation`);
    return {
      mergedStrings: {},
      additionalInfo: {},
    };
  }
  logger.info(`Strings to be translated: ${JSON.stringify(mergedStrings)}`);
  const res = await translateStrings(
    mergedStrings,
    config,
    spinner,
    // mode,
    // baseLanguage
  );
  await mergeTranslatedFile(
    xliffFilePaths,
    res.mergedStrings,
    config.translator,
  );
  return res;
}

export async function mergeBundles(
  bundlePath: string,
  previousBundlePath: string,
) {
  if (!fs.existsSync(previousBundlePath)) {
    logger.info(
      `No previous bundle found at ${previousBundlePath}. No need to merge.`,
    );
    return;
  }
  const subfolders = await fs.promises.readdir(bundlePath, {
    withFileTypes: true,
  });
  const subfolderNames = subfolders
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
  logger.info(`Found subfolders: ${subfolderNames} under ${bundlePath}`);
  for (const subfolderName of subfolderNames) {
    const subfolder = path.join(bundlePath, subfolderName);
    const xliffFiles = await fs.promises.readdir(subfolder, {
      withFileTypes: true,
    });
    const xliffFileNames = xliffFiles
      .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.xliff'))
      .map((dirent) => dirent.name);
    logger.info(`Found xliff files: ${xliffFileNames} under ${subfolderName}`);
    for (const xliffFileName of xliffFileNames) {
      const xliffFilePath = path.join(subfolder, xliffFileName);
      const previousXliffFilePath = path.join(
        path.join(previousBundlePath, subfolderName),
        xliffFileName,
      );
      if (!fs.existsSync(previousXliffFilePath)) {
        logger.info(
          `No previous xliff file found at ${previousXliffFilePath}. Skip merging.`,
        );
      }
      await mergePreviousTranslatedXliff(xliffFilePath, previousXliffFilePath);
    }
  }
}

async function translateStrings(
  mergedStrings: LocalizationEntityDictionary,
  config: Config,
  spinner?: Spinner,
  // mode: TranslationMode,
  // sourceLanguage?: string
): Promise<{
  mergedStrings: LocalizationEntityDictionary;
  additionalInfo: any;
}> {
  logger.info(`Localizer config: ${JSON.stringify(config)}`);
  let translator: Translator;
  const agent = config.translator.agent;
  if (agent === 'api') {
    const remoteConfig = await fetchApiConfig({
      baseUrl: config.translator.baseUrl,
    });
    translator = new DolphinAPITranslator(
      config.translator.baseUrl,
      remoteConfig.provider,
      remoteConfig.maxOutputTokens,
      remoteConfig.buffer,
      remoteConfig.maxRetry,
    );
  } else {
    throw new Error(
      `The translator agent: ${config.translator.agent} is not supported`,
    );
  }

  var remainings = Object.values(mergedStrings);
  var reviewed: LocalizationEntity[] = [];
  while (remainings.length > 0) {
    const total = remainings.length;
    logger.info(`Translating ${total} strings with ${agent}...`);
    spinner?.update(`[0%] Translating with ${agent}...`, {
      logging: false,
    });
    const translations = await translator.translate(
      remainings,
      config,
      (progress) => {
        spinner?.update(
          `[${(progress * 100).toFixed(2)}%] Translating with ${agent}...`,
          {
            logging: false,
          },
        );
      },
    );
    const untranslated = translations.filter(
      (e) => e.untranslatedLanguages.length > 0,
    );
    logger.info(`Translated ${translations.length} strings`);
    remainings = [];

    if (spinner) {
      let message = chalk.green('Translation finished ');
      if (untranslated.length > 0) {
        message += chalk.yellow(
          `(⚠️ ${untranslated.length}/${translations.length} strings were not translated)`,
        );
      } else {
        message += chalk.green(`(${translations.length} strings)`);
      }
      spinner.succeed(`${message}\n`);
    }

    if (config.translator.mode === TranslationMode.INTERACTIVE) {
      var approved = 0;
      var declined = 0;
      var refineNeeded = 0;
      for (const entity of translations) {
        if (entity.needsReview) {
          logger.info(
            `Skip reviewing ${entity.key} because all target languages are skipped.`,
          );
          continue;
        }
        var message = `[${
          reviewed.length + 1
        }/${total}] [Interactive Mode] Reviewing translation:\n`;
        if (config.globalContext) {
          message += `[Context]:\n${config.globalContext}\n\n`;
        }
        message += `${chalk.yellow(`${entity.source.code} (Source)`)}\n${
          entity.source.value
        }\n\n`;
        const notes = entity.allNotes;
        if (notes.length > 0) {
          message += `Notes:\n`;
          for (const note of notes) {
            message += `• ${note}\n`;
          }
          message += `\n`;
        }
        for (const lang in entity.target) {
          const target = entity.target[lang]!;
          if (target.state === LOCALIZATION_STATE_FINAL) {
            message += `${chalk.green(lang)} (Skipped)\n${target.value}\n\n`;
          } else {
            message += `${chalk.red(lang)}\n${target.value}\n\n`;
          }
        }
        const reviewResult = await select(
          {
            message: message,
            choices: [
              {
                name: 'Approve',
                value: 'approved',
                description: 'Approve the translation',
              },
              {
                name: 'Retry with Suggestions',
                value: LOCALITION_REVIEW_SUBSTATE_REFINE_NEEDED,
                description:
                  'Type in suggestions and it will be translated again afterwards',
              },
              {
                name: 'Decline',
                value: LOCALITION_REVIEW_SUBSTATE_DECLINED,
                description: 'The translation will be discarded',
              },
            ],
          },
          {
            clearPromptOnDone: true,
          },
        );
        if (reviewResult === 'approved') {
          entity.updateState(LOCALIZATION_STATE_FINAL);
          reviewed.push(entity);
          approved += 1;
        } else if (reviewResult === LOCALITION_REVIEW_SUBSTATE_DECLINED) {
          entity.updateState(LOCALIZATION_STATE_REVIEWED, reviewResult);
          reviewed.push(entity);
          declined += 1;
        } else if (reviewResult === LOCALITION_REVIEW_SUBSTATE_REFINE_NEEDED) {
          // ask for suggestions
          const auditSuggestion = await input(
            {
              message:
                'Enter suggestion to help the translator refine the translation:',
            },
            {
              clearPromptOnDone: true,
            },
          );
          entity.updateState(LOCALIZATION_STATE_REVIEWED, reviewResult);
          entity.addNotes([auditSuggestion]);
          remainings.push(entity);
          refineNeeded += 1;
        }
      }

      if (spinner) {
        spinner.succeed(
          chalk.green(
            `Review done: ${approved} approved, ${declined} declined, ${refineNeeded} refine needed.\n`,
          ),
        );
      }
    } else {
      reviewed.push(...translations);
    }

    for (const entity of reviewed) {
      if (entity.isFinal) {
        mergedStrings[entity.key] = entity;
      }
    }
  }

  logger.info(`Translated file: ${JSON.stringify(mergedStrings)}`);
  return {
    mergedStrings,
    additionalInfo: translator.additionalInfo(),
  };
}

async function mergeTranslatedFile(
  xliffFilePaths: string[],
  translatedStrings: LocalizationEntityDictionary,
  translator: TranslatorConfig,
) {
  logger.info(`Merging translated file...`);
  for (const filePath of xliffFilePaths) {
    await writeTranslatedStringsToExistingFile(translatedStrings, filePath);
  }
}

async function fetchApiConfig({ baseUrl }: { baseUrl: string }) {
  const url = new URL(baseUrl);
  url.pathname += url.pathname.endsWith('/') ? 'config' : '/config';
  logger.info(`Fetching translator config from ${url}`);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (response.status < 200 || response.status >= 400) {
    try {
      const json = await response.json();
      throw new Error(
        `Failed to fetch translator config: ${
          response.status
        }, body: ${JSON.stringify(json)}`,
      );
    } catch (error) {
      throw new Error(
        `Failed to fetch translator config: ${response.status}, body: ${error}`,
      );
    }
  }
  const responseJson = await response.json();
  const configResult = LLMProviderConfigSchema.safeParse(responseJson);
  if (!configResult.success) {
    throw new Error(`Failed to parse localizer config: ${configResult.error}`);
  }
  return configResult.data;
}
