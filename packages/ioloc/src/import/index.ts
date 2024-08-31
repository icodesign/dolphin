import { logger } from '@repo/base/logger';
import fs from 'node:fs';
import path from 'node:path';

import {
  ImportLocalizations,
  ImportLocalizationsResult,
  LocalizationBundlePath,
} from '../index.js';
import { XcodeImportLocalizations } from '../xcode.js';
import { parseXliff2Text } from '../xliff/index.js';
import { Xliff } from '../xliff/xliff-spec.js';
import { XclocMerger } from './merger/xcloc.js';

export * from './merger/text.js';
export * from './merger/xliff.js';
export * from './merger/strings.js';
export * from './merger/xcloc.js';

export type ImportConfig = {
  sourceLanguage: ImportSourceLanguageConfig;
  targetLanguages: ImportLanguageConfig[];
};

export type MergeConfig = {
  sourceLanguage: ImportSourceLanguageConfig;
  targetLanguage: ImportLanguageConfig;
};

export type ImportSourceLanguageConfig = {
  code: string;
  path: string; // source file
};

export type ImportLanguageConfig = {
  code: string;
  from: string; // translated xliff file
  to: string; // target file
};

export interface ImportMerger {
  merge(xliff: Xliff, config: MergeConfig): Promise<void>;
}

export class BasicImporter implements ImportLocalizations {
  private config: ImportConfig;
  private merger: ImportMerger;

  constructor({
    config,
    merger,
  }: {
    config: ImportConfig;
    merger: ImportMerger;
  }) {
    this.config = config;
    this.merger = merger;
  }

  async import(): Promise<ImportLocalizationsResult> {
    for (const languageConfig of this.config.targetLanguages) {
      const translatedText = await fs.promises.readFile(
        languageConfig.from,
        'utf-8',
      );
      const target = parseXliff2Text(translatedText).elements[0];
      logger.info(
        `Merging translated ${languageConfig.from} to ${languageConfig.to}`,
      );
      await this.merger.merge(target, {
        sourceLanguage: this.config.sourceLanguage,
        targetLanguage: languageConfig,
      });
    }
    return {
      code: 0,
    };
  }
}

export class XcodeImporter implements ImportLocalizations {
  private config: ImportConfig;
  private localizationBundlePath: LocalizationBundlePath;
  private projectPath: string;
  private baseFolder: string;

  constructor({
    config,
    projectPath,
    baseFolder,
    localizationBundlePath,
  }: {
    config: ImportConfig;
    projectPath: string;
    baseFolder: string;
    localizationBundlePath: LocalizationBundlePath;
  }) {
    this.config = config;
    this.localizationBundlePath = localizationBundlePath;
    this.projectPath = projectPath;
    this.baseFolder = baseFolder;
  }

  async import(): Promise<ImportLocalizationsResult> {
    // Step 1: Use BasicImporter to localize strings to intermediateBundlePath
    const intermediateBundlePath =
      this.localizationBundlePath.intermediateBundlePath;
    if (!intermediateBundlePath) {
      throw new Error(
        'intermediateBundlePath is not set for importing xcode project',
      );
    }
    let importBundlePath = this.localizationBundlePath.bundlePath;
    if (!path.isAbsolute(importBundlePath)) {
      importBundlePath = path.join(this.baseFolder, importBundlePath);
    }
    const basicImporter = new BasicImporter({
      config: {
        sourceLanguage: {
          code: this.config.sourceLanguage.code,
          path: path.join(
            intermediateBundlePath,
            `${this.config.sourceLanguage.code}.xcloc`,
          ),
        },
        targetLanguages: this.config.targetLanguages.map((lang) => ({
          ...lang,
          to: path.join(intermediateBundlePath, `${lang.code}.xcloc`),
        })),
      },
      merger: new XclocMerger(),
    });

    const basicImportResult = await basicImporter.import();
    if (basicImportResult.code !== 0) {
      return basicImportResult;
    }

    // Step 2: Use XcodeImportLocalizations to import intermediateBundlePath to Xcode project
    const xcodeImporter = new XcodeImportLocalizations();

    const xcodeImportResult = await xcodeImporter.import({
      localizationBundlePath: intermediateBundlePath,
      projectPath: this.projectPath,
      baseFolder: this.baseFolder,
    });

    logger.info('Xcode import completed');
    return xcodeImportResult;
  }
}
