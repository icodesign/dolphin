import { logger } from '@repo/base/logger';
import fs from 'node:fs';
import path from 'node:path';

import { ExportLocalizations, ExportLocalizationsResult } from '../index.js';
import { createOutputFolderIfNeed } from '../utils.js';
import { stringifyXliff2 } from '../xliff/index.js';
import { Xliff } from '../xliff/xliff-spec.js';

export * from './parser/text.js';
export * from './parser/strings.js';
export * from './parser/xliff.js';
export * from './parser/xloc.js';

export interface ExportParser {
  parse(
    filePath: string,
    language: string,
    sourceFilePath: string,
    sourceLanguage: string,
    basePath: string,
  ): Promise<Xliff>;
}

export type ExportConfig = {
  sourceLanguage: ExportLanguageConfig;
  targetLanguages: ExportLanguageConfig[];
  basePath: string;
};

export type ExportLanguageConfig = {
  code: string;
  path: string;
};

export class BasicExporter implements ExportLocalizations {
  private config: ExportConfig;
  private outputFolder?: string;
  private parser: ExportParser;
  constructor({
    config,
    parser,
    outputFolder,
  }: {
    config: ExportConfig;
    parser: ExportParser;
    outputFolder: string;
  }) {
    this.config = config;
    this.parser = parser;
    this.outputFolder = outputFolder;
  }

  async export(): Promise<ExportLocalizationsResult> {
    let sourcePath = this.config.sourceLanguage.path;
    const outputFolder = await createOutputFolderIfNeed(this.outputFolder);
    for (const langConfig of this.config.targetLanguages) {
      const language = langConfig.code;
      const targetPath = langConfig.path;
      logger.info(`Reading target text from ${targetPath}`);
      const target = await this.parser.parse(
        targetPath,
        language,
        sourcePath,
        this.config.sourceLanguage.code,
        this.config.basePath,
      );
      const str = stringifyXliff2(target);
      const xliffPath = path.join(outputFolder, `${language}.xliff`);
      await fs.promises.writeFile(xliffPath, str);
    }
    return {
      bundlePath: outputFolder,
    };
  }
}
