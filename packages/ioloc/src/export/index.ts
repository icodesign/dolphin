import { logger } from '@repo/base/logger';
import fs from 'node:fs';
import path from 'node:path';

import { ExportLocalizations, LocalizationBundlePath } from '../index.js';
import {
  createOutputFolderIfNeed,
  createTemporaryOutputFolder,
} from '../utils.js';
import { XcodeExportLocalizations } from '../xcode.js';
import { stringifyXliff2 } from '../xliff/index.js';
import { Xliff } from '../xliff/xliff-spec.js';
import { XliffParser } from './parser/xliff.js';
import { XlocParser } from './parser/xloc.js';

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
    outputFolder?: string;
  }) {
    this.config = config;
    this.parser = parser;
    this.outputFolder = outputFolder;
  }

  async export(): Promise<LocalizationBundlePath> {
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

export class XcodeExporter implements ExportLocalizations {
  private config: ExportConfig;
  private projectPath: string;
  private outputFolder?: string;

  constructor({
    config,
    projectPath,
    outputFolder,
  }: {
    config: ExportConfig;
    projectPath: string;
    outputFolder: string;
  }) {
    this.config = config;
    this.projectPath = projectPath;
    this.outputFolder = outputFolder;
  }

  async export(): Promise<LocalizationBundlePath> {
    // For xcode, we need export localizations first
    const xcodeOutputFolder = await createTemporaryOutputFolder();
    logger.info(`Exporting Xcode project to ${xcodeOutputFolder}`);
    const xcodeExporter = new XcodeExportLocalizations(
      this.projectPath,
      xcodeOutputFolder,
    );
    const result = await xcodeExporter.export();
    // const result = {
    //   bundlePath:
    //     '/var/folders/x3/d3jx55kn439_kdfysr655ld00000gn/T/dolphin-export-mjIgGq/',
    //   languages: ['en', 'zh-Hans', 'ko', 'ja'],
    // };
    logger.info(
      `Exported Xcode project at ${result.bundlePath}, languages: ${result.languages}`,
    );
    const exportConfig = {
      sourceLanguage: {
        code: this.config.sourceLanguage.code,
        path: path.join(
          result.bundlePath,
          `${this.config.sourceLanguage.code}.xcloc`,
        ),
      },
      targetLanguages: result.languages.map((language: string) => {
        let bundlePath = path.join(result.bundlePath, `${language}.xcloc`);
        if (!path.isAbsolute(bundlePath)) {
          bundlePath = path.join(this.config.basePath, bundlePath);
        }
        return {
          code: language,
          path: bundlePath,
        };
      }),
      basePath: this.config.basePath,
    };
    let basicExporter = new BasicExporter({
      config: exportConfig,
      parser: new XlocParser(),
      outputFolder: this.outputFolder,
    });
    const exportResult = await basicExporter.export();
    exportResult.intermediateBundlePath = result.bundlePath;
    return exportResult;
  }
}
