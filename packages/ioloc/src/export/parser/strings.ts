import fs from 'node:fs';
import path from 'node:path';

import { DotStringsItem, DotStringsParser } from '../../common/dotstrings.js';
import { textHash } from '../../utils.js';
import {
  Notes,
  Segment,
  Source,
  Target,
  Unit,
  Xliff,
} from '../../xliff/xliff-spec.js';
import { ExportParser } from '../index.js';

export class AppleStringsParser implements ExportParser {
  async parse(
    filePath: string,
    language: string,
    sourceFilePath: string,
    sourceLanguage: string,
    basePath: string,
  ): Promise<Xliff> {
    const fileId = textHash(sourceFilePath);
    const xliffOriginalPath = path.relative(basePath, filePath);
    let targets: DotStringsItem[] = [];
    if (!fs.existsSync(filePath)) {
      targets = [];
    } else {
      const targetText = await fs.promises.readFile(filePath, 'utf-8');
      const parser = new DotStringsParser(false);
      parser.onItem((item) => {
        targets.push(item);
      });
      parser.feed(targetText);
    }
    const sourceText = await fs.promises.readFile(sourceFilePath, 'utf-8');
    let sources: DotStringsItem[] = [];
    const parser = new DotStringsParser(false);
    parser.onItem((item) => {
      sources.push(item);
    });
    parser.feed(sourceText);
    let targetElements = [];
    for (const source of sources) {
      const key = source.key;
      if (!key) {
        continue;
      }
      const targetContent = targets.find((t) => t.key === key);
      const target = targetContent?.value;

      let unitElements: (Notes | Segment)[] = [];
      if (source.comment) {
        // for (const comment of source.comment) {
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
                  text: source.comment,
                },
              ],
            },
          ],
        });
        // }
      }
      const state = target ? 'translated' : 'initial';
      const segmentElements: [Source] | [Source, Target] = [
        {
          name: 'source',
          type: 'element',
          elements: [
            {
              type: 'text',
              text: source.value || '',
            },
          ],
        },
        {
          name: 'target',
          type: 'element',
          elements: [
            {
              type: 'text',
              text: target || source.value || '',
            },
          ],
        },
      ];
      unitElements.push({
        name: 'segment',
        type: 'element',
        attributes: {
          state: state,
        },
        elements: segmentElements,
      });
      const element: Unit = {
        name: 'unit',
        type: 'element',
        attributes: {
          id: key,
        },
        elements: unitElements,
      };
      targetElements.push(element);
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
