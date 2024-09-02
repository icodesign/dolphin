import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

import { XCStringsParser } from '../src/export/parser/xcstrings.js';
import { XCStringsMerger } from '../src/import/merger/xcstrings.js';
import { createTemporaryOutputFolder } from '../src/utils.js';
import {
  encodeXliffAttributeValue,
  parseXliff2Text,
} from '../src/xliff/index.js';
import { Text, Xliff } from '../src/xliff/xliff-spec.js';

const testDataDir = path.join(__dirname, 'examples', 'xcstrings');

test('XCStringsParser - parse xcstrings file', async () => {
  const parser = new XCStringsParser();
  const filePath = path.join(testDataDir, 'Localizable.xcstrings');
  const sourceFilePath = filePath;
  const language = 'es';
  const sourceLanguage = 'en';
  const basePath = testDataDir;

  const result = await parser.parse(
    filePath,
    language,
    sourceFilePath,
    sourceLanguage,
    basePath,
  );

  expect(result).toBeDefined();
  expect(result.name).toBe('xliff');
  expect(result.attributes?.version).toBe('2.0');
  expect(result.attributes?.srcLang).toBe(sourceLanguage);
  expect(result.attributes?.trgLang).toBe(language);

  const fileElement = result.elements?.[0];
  expect(fileElement?.name).toBe('file');
  expect(fileElement?.attributes?.id).toBeDefined();
  expect(fileElement?.attributes?.original).toBe('Localizable.xcstrings');

  const units = fileElement?.elements?.filter((el) => el.name === 'unit') ?? [];
  expect(units.length).toBeGreaterThan(0);

  // Check a specific unit
  const helloUnit = units.find(
    (unit) => unit.attributes?.id === encodeXliffAttributeValue('Hello, %@!'),
  );
  expect(helloUnit).toBeDefined();
  const segment = helloUnit?.elements?.find((el) => el.name === 'segment');
  expect(
    (
      segment?.elements?.find((el) => el.name === 'source')
        ?.elements?.[0] as Text
    ).text,
  ).toBe('Hello, source %@!');
  expect(
    (
      segment?.elements?.find((el) => el.name === 'target')
        ?.elements?.[0] as Text
    ).text,
  ).toBe('Hello, target %@!');
});

test('XCStringsMerger - merge xliff into xcstrings', async () => {
  const merger = new XCStringsMerger();
  const xliffPath = path.join(testDataDir, 'es.xliff');
  const xliffContent = await fs.promises.readFile(xliffPath, 'utf-8');
  const xliff = parseXliff2Text(xliffContent);
  const sourceXCStringsPath = path.join(testDataDir, 'Localizable.xcstrings');

  const temporaryOutputFolder = await createTemporaryOutputFolder();
  const targetXCStringsPath = path.join(
    temporaryOutputFolder,
    'Localizable_merged.xcstrings',
  );

  await fs.promises.copyFile(sourceXCStringsPath, targetXCStringsPath);

  await merger.merge(xliff.elements[0], {
    sourceLanguage: { code: 'en', path: sourceXCStringsPath },
    targetLanguage: { code: 'es', from: xliffPath, to: targetXCStringsPath },
  });

  const mergedContent = await fs.promises.readFile(
    targetXCStringsPath,
    'utf-8',
  );
  const mergedXCStrings = JSON.parse(mergedContent);

  expect(mergedXCStrings.version).toBe('1.0');
  expect(mergedXCStrings.sourceLanguage).toBe('en');
  expect(Object.keys(mergedXCStrings.strings).length).toBeGreaterThan(0);

  // Check a specific translation
  expect(
    mergedXCStrings.strings['Hello, %@!'].localizations.es.stringUnit.value,
  ).toBe('¡Hola, %@!');

  // Clean up
  await fs.promises.unlink(targetXCStringsPath);
});
