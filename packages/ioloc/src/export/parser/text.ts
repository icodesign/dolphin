import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { textHash } from '../../utils.js';
import { Xliff } from '../../xliff/xliff-spec.js';
import { ExportParser } from '../index.js';

export class TextParser implements ExportParser {
  async parse(
    filePath: string,
    language: string,
    sourceFilePath: string,
    sourceLanguage: string,
    basePath: string,
  ): Promise<Xliff> {
    const fileId = textHash(sourceFilePath);
    const xliffOriginalPath = path.relative(basePath, filePath);
    let targetText = '';
    if (fs.existsSync(filePath)) {
      targetText = await fs.promises.readFile(filePath, 'utf-8');
    }
    const sourceText = await fs.promises.readFile(sourceFilePath, 'utf-8');
    const state = targetText !== '' ? 'translated' : 'initial';
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
          elements: [
            {
              name: 'unit',
              type: 'element',
              attributes: {
                id: fileId,
              },
              elements: [
                {
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
                },
              ],
            },
          ],
        },
      ],
    };
  }
}

export function keyOfText(filepath: string, text: string): string {
  const hash = createHash('sha256').update(text).digest('hex');
  return `${path.basename(filepath)}_${hash.substring(0, 8)}`;
}
