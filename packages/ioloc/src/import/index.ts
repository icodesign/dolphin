import { logger } from '@repo/base/logger';
import fs from 'node:fs';

import { ImportLocalizations, ImportLocalizationsResult } from '../index.js';
import { parseXliff2Text } from '../xliff/index.js';
import { Xliff } from '../xliff/xliff-spec.js';

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
