import { LocalizationConfig, LocalizationFormat } from '@repo/base/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

import {
  exportLocalizationBundle,
  importLocalizationBundle,
  textHash,
} from '../src/index.js';

test.each([
  {
    bundleFormat: 'text',
    baseLanguage: 'en',
    baseFileExtension: 'txt',
    targetLanguages: ['zh', 'ja'],
    targetFileExtension: 'xliff',
  },
  {
    bundleFormat: 'strings',
    baseLanguage: 'en',
    baseFileExtension: 'strings',
    targetLanguages: ['zh'],
    targetFileExtension: 'xliff',
  },
  {
    bundleFormat: 'xliff',
    baseLanguage: 'en',
    baseFileExtension: 'xliff',
    targetLanguages: ['zh-Hans'],
    targetFileExtension: 'export.xliff',
  },
  {
    bundleFormat: 'json',
    baseLanguage: 'en',
    baseFileExtension: 'json',
    targetLanguages: ['zh'],
    targetFileExtension: 'xliff',
  },
])(
  'export $bundleFormat files from $baseLanguage to $targetLanguages',
  async ({
    bundleFormat,
    baseLanguage,
    baseFileExtension,
    targetLanguages,
    targetFileExtension,
  }) => {
    const targetFolder = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'dolphin-test-'),
    );
    const baseFolder = path.join(
      __dirname,
      `./examples/${bundleFormat}/export`,
    );
    const bundlePath = path.join(
      __dirname,
      `./examples/${bundleFormat}/export/$\{LANGUAGE\}.${baseFileExtension}`,
    );
    const sourcePath = bundlePath.replaceAll('${LANGUAGE}', baseLanguage);
    const fileId = textHash(sourcePath);
    const config: LocalizationConfig = {
      id: fileId,
      path: bundlePath,
      format: bundleFormat as LocalizationFormat,
      languages: targetLanguages,
    };
    await exportLocalizationBundle({
      config,
      baseLanguage: baseLanguage,
      baseFolder: baseFolder,
      outputFolder: targetFolder,
    });
    const exportedFiles = targetLanguages.map((language) =>
      path.join(targetFolder, `${language}.xliff`),
    );
    const expectedFileStrings = targetLanguages.map((language) => {
      const filePath = path.join(
        __dirname,
        `./examples/${bundleFormat}/export/`,
        `${language}.${targetFileExtension}`,
      );
      const fileString = fs.readFileSync(filePath, 'utf-8');
      const originalPath = bundlePath.replaceAll('${LANGUAGE}', language);
      return fileString
        .replaceAll('${ORIGINAL_PATH}', path.relative(baseFolder, originalPath))
        .replaceAll('${FILE_ID}', fileId);
    });
    for (let i = 0; i < exportedFiles.length; i++) {
      expect(fs.readFileSync(exportedFiles[i], 'utf-8')).toStrictEqual(
        expectedFileStrings[i],
      );
    }
  },
);

test.each([
  ['text', 'txt', 'en', ['zh', 'ja']],
  ['strings', 'strings', 'en', ['zh']],
  ['json', 'json', 'en', ['zh']],
])(
  'import %s(%s) files from %s to %j',
  async (bundleFormat, fileExtension, baseLanguage, targetLanguages) => {
    const targetFolder = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'dolphin-test-'),
    );
    const importBundlePath = path.join(
      __dirname,
      `./examples/${bundleFormat}/import`,
    );
    const config: LocalizationConfig = {
      id: importBundlePath,
      path: path.join(targetFolder, '${LANGUAGE}.txt'),
      format: bundleFormat as LocalizationFormat,
      languages: targetLanguages,
    };
    await importLocalizationBundle({
      config,
      localizationBundlePath: {
        bundlePath: importBundlePath,
        intermediateBundlePath: undefined,
      },
      baseLanguage,
      baseFolder: targetFolder,
    });
    const importedFiles = targetLanguages.map((language) =>
      path.join(targetFolder, `${language}.txt`),
    );
    const expectedFileStrings = targetLanguages.map((language) => {
      const filePath = path.join(
        __dirname,
        `./examples/${bundleFormat}/import/`,
        `${language}.${fileExtension}`,
      );
      const fileString = fs.readFileSync(filePath, 'utf-8');
      return fileString;
    });
    for (let i = 0; i < importedFiles.length; i++) {
      expect(fs.readFileSync(importedFiles[i], 'utf-8')).toStrictEqual(
        expectedFileStrings[i],
      );
    }
  },
);
