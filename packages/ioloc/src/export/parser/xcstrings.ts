import { logger } from '@repo/base/logger';
import fs from 'node:fs';
import path from 'node:path';

import { textHash } from '../../utils.js';
import { encodeXliffAttributeValue } from '../../xliff/index.js';
import { Unit, Xliff } from '../../xliff/xliff-spec.js';
import { ExportParser } from '../index.js';

export interface XCStringsFile {
  sourceLanguage: string;
  strings: {
    [key: string]: {
      extractionState?: string;
      comment?: string;
      localizations?: {
        [lang: string]: {
          stringUnit?: {
            state?: string;
            value?: string;
          };
          stringSet?: {
            state?: string;
            values?: string[];
          };
        };
      };
    };
  };
  version: string;
}

export class XCStringsParser implements ExportParser {
  async parse(
    filePath: string,
    language: string,
    sourceFilePath: string,
    sourceLanguage: string,
    basePath: string,
  ): Promise<Xliff> {
    const fileId = textHash(sourceFilePath);
    const xliffOriginalPath = path.relative(basePath, filePath);

    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    const xcstrings: XCStringsFile = parseXCStrings(fileContent);

    const targetElements: Unit[] = [];

    for (const [key, value] of Object.entries(xcstrings.strings)) {
      const unitElements: Unit['elements'] = [];
      if (!value.localizations) {
        unitElements.push({
          name: 'segment',
          type: 'element',
          attributes: {
            state: 'initial',
          },
          elements: [
            {
              name: 'source',
              type: 'element',
              elements: [
                {
                  type: 'text',
                  text: key,
                },
              ],
            },
          ],
        });
      } else {
        const sourceText =
          value.localizations[sourceLanguage]?.stringUnit?.value ||
          value.localizations[sourceLanguage]?.stringSet?.values?.[0] ||
          key;
        const targetText =
          (value.localizations &&
            value.localizations[language]?.stringUnit?.value) ||
          (value.localizations &&
            value.localizations[language]?.stringSet?.values?.[0]) ||
          '';
        const stringState =
          value.localizations[language]?.stringUnit?.state ||
          value.localizations[language]?.stringSet?.state;
        const state = stringState === 'translated' ? 'translated' : 'initial';

        if (value.comment) {
          unitElements.push({
            name: 'notes',
            type: 'element',
            elements: [
              {
                name: 'note',
                type: 'element',
                elements: [
                  {
                    type: 'text',
                    text: value.comment,
                  },
                ],
              },
            ],
          });
        }

        unitElements.push({
          name: 'segment',
          type: 'element',
          attributes: {
            state,
          },
          elements: [
            {
              name: 'source',
              type: 'element',
              elements: [
                {
                  type: 'text',
                  text: sourceText,
                },
              ],
            },
            {
              name: 'target',
              type: 'element',
              elements: [
                {
                  type: 'text',
                  text: targetText,
                },
              ],
            },
          ],
        });
      }

      targetElements.push({
        name: 'unit',
        type: 'element',
        attributes: {
          id: encodeXliffAttributeValue(key),
          extractionState: value.extractionState,
        },
        elements: unitElements,
      });
    }

    return {
      name: 'xliff',
      type: 'element',
      attributes: {
        version: '2.0',
        srcLang: sourceLanguage,
        trgLang: language,
      },
      elements: [
        {
          name: 'file',
          type: 'element',
          attributes: {
            id: fileId,
            original: xliffOriginalPath,
          },
          elements: targetElements,
        },
      ],
    };
  }
}

export function parseXCStrings(content: string): XCStringsFile {
  try {
    const parsed: XCStringsFile = JSON.parse(content);
    // Add validation logic here if needed
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse XCStrings file: ${error}`);
  }
}

// export function extractTranslations(
//   xcstrings: XCStringsFile,
// ): Record<string, Record<string, string>> {
//   const translations: Record<string, Record<string, string>> = {};

//   for (const [key, value] of Object.entries(xcstrings.strings)) {
//     for (const [lang, localization] of Object.entries(value.localizations)) {
//       if (!translations[lang]) {
//         translations[lang] = {};
//       }
//       translations[lang][key] = localization.stringUnit?.values[0] || '';
//     }
//   }

//   return translations;
// }

// export function createXCStringsFile(
//   translations: Record<string, Record<string, string>>,
//   sourceLanguage: string,
// ): XCStringsFile {
//   const xcstrings: XCStringsFile = {
//     sourceLanguage,
//     strings: {},
//     version: '1.0',
//   };

//   for (const [key, langValues] of Object.entries(
//     translations[sourceLanguage],
//   )) {
//     xcstrings.strings[key] = {
//       extractionState: 'manual',
//       localizations: {},
//     };

//     for (const lang of Object.keys(translations)) {
//       xcstrings.strings[key].localizations[lang] = {
//         stringUnit: {
//           state: lang === sourceLanguage ? 'translated' : 'new',
//           values: [translations[lang][key] || ''],
//         },
//       };
//     }
//   }

//   return xcstrings;
// }

// export function writeXCStringsFile(
//   filePath: string,
//   xcstrings: XCStringsFile,
// ): Promise<void> {
//   const content = JSON.stringify(xcstrings, null, 2);
//   return fs.promises.writeFile(filePath, content, 'utf-8');
// }
