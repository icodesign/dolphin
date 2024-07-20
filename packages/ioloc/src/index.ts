import { LocalizationConfig, LocalizationFormat } from '@repo/base/config';
import fs from 'node:fs';
import path from 'node:path';

import { BasicExporter, ExportConfig, ExportParser } from './export/index.js';
import { JsonParser } from './export/parser/json.js';
import { AppleStringsParser } from './export/parser/strings.js';
import { TextParser } from './export/parser/text.js';
import { XliffParser } from './export/parser/xliff.js';
import { XlocParser } from './export/parser/xloc.js';
import { BasicImporter, ImportConfig, ImportMerger } from './import/index.js';
import { JsonMerger } from './import/merger/json.js';
import { AppleStringsMerger } from './import/merger/strings.js';
import { TextMerger } from './import/merger/text.js';
import { XliffMerger } from './import/merger/xliff.js';
import { XcodeImportLocalizations } from './xcode.js';

export * from './utils.js';

export type ExportLocalizationsResult = {
  bundlePath: string;
};

export interface ExportLocalizations {
  export(): Promise<ExportLocalizationsResult>;
}

export async function exportLocalizationBundle({
  config,
  baseLanguage,
  baseFolder,
  outputFolder,
}: {
  config: LocalizationConfig;
  baseLanguage: string;
  baseFolder: string;
  outputFolder: string;
}): Promise<ExportLocalizationsResult> {
  const format = config.format;
  if (!('languages' in config)) {
    throw new Error(
      `languages is required for ${format} format in the configuration`,
    );
  }
  let bundlePath = config.path.replace('${LANGUAGE}', baseLanguage);
  if (!path.isAbsolute(bundlePath)) {
    bundlePath = path.join(baseFolder, bundlePath);
  }
  let exportConfig: ExportConfig = {
    sourceLanguage: {
      code: baseLanguage,
      path: bundlePath,
    },
    targetLanguages: config.languages.map((language: string) => {
      let bundlePath = config.path.replace('${LANGUAGE}', language);
      if (!path.isAbsolute(bundlePath)) {
        bundlePath = path.join(baseFolder, bundlePath);
      }
      return {
        code: language,
        path: bundlePath,
      };
    }),
    basePath: baseFolder,
  };
  let parser: ExportParser;
  if (
    format === LocalizationFormat.XCODE ||
    format === LocalizationFormat.XCLOC
  ) {
    parser = new XlocParser();
  } else if (format === LocalizationFormat.TEXT) {
    parser = new TextParser();
  } else if (format === LocalizationFormat.STRINGS) {
    parser = new AppleStringsParser();
  } else if (format === LocalizationFormat.XLIFF) {
    parser = new XliffParser();
  } else if (format === LocalizationFormat.JSON) {
    parser = new JsonParser();
  } else {
    throw new Error(
      `Unsupported bundle format: ${format}. Please contact us to add support for this format.`,
    );
  }
  let exporter = new BasicExporter({
    config: exportConfig,
    parser: parser,
    outputFolder,
  });
  return await exporter.export();
}

export interface ImportLocalizationsResult {
  code: number;
}

export interface ImportLocalizations {
  import(localizationBundlePath: string): Promise<ImportLocalizationsResult>;
}

export async function importLocalizationBundle({
  config,
  localizationBundlePath,
  baseLanguage,
  baseFolder,
}: {
  config: LocalizationConfig;
  localizationBundlePath: string;
  baseLanguage: string;
  baseFolder: string;
}): Promise<ImportLocalizationsResult> {
  if (!('languages' in config)) {
    throw new Error(
      `languages is required for ${config.format} format in the configuration`,
    );
  }
  let importBundlePath = localizationBundlePath;
  if (!path.isAbsolute(importBundlePath)) {
    importBundlePath = path.join(baseFolder, importBundlePath);
  }
  let sourcePath = config.path.replace('${LANGUAGE}', baseLanguage);
  if (!path.isAbsolute(sourcePath)) {
    sourcePath = path.join(baseFolder, sourcePath);
  }
  let importConfig: ImportConfig = {
    sourceLanguage: {
      code: baseLanguage,
      path: sourcePath,
    },
    targetLanguages: config.languages.map((language: string) => {
      let targetBundlePath = config.path.replace('${LANGUAGE}', language);
      if (!path.isAbsolute(targetBundlePath)) {
        targetBundlePath = path.join(baseFolder, targetBundlePath);
      }
      return {
        code: language,
        from: path.join(importBundlePath, `${language}.xliff`),
        to: targetBundlePath,
      };
    }),
  };
  let merger: ImportMerger;
  if (
    config.format === LocalizationFormat.XCODE ||
    config.format === LocalizationFormat.XCLOC
  ) {
    const importLocalizations = new XcodeImportLocalizations(
      config,
      baseFolder,
    );
    const result = await importLocalizations.import(importBundlePath);
    return result;
  } else if (config.format === LocalizationFormat.TEXT) {
    merger = new TextMerger();
  } else if (config.format === LocalizationFormat.STRINGS) {
    merger = new AppleStringsMerger();
  } else if (config.format === LocalizationFormat.XLIFF) {
    merger = new XliffMerger();
  } else if (config.format === LocalizationFormat.JSON) {
    merger = new JsonMerger();
  } else {
    throw new Error(`Unsupported budnle format: ${config.format}`);
  }
  const importer = new BasicImporter({ config: importConfig, merger });
  const result = await importer.import();
  return result;
}

export async function replaceBundle(bundlePath: string, other: string) {
  await fs.promises.cp(other, bundlePath, { recursive: true });
}
