import fs from 'node:fs';
import path from 'node:path';

import { textHash } from '../../utils.js';
import { Unit, Xliff } from '../../xliff/xliff-spec.js';
import { ExportParser } from '../index.js';

export class JsonParser implements ExportParser {
  async parse(
    filePath: string,
    language: string,
    sourceFilePath: string,
    sourceLanguage: string,
    basePath: string,
  ): Promise<Xliff> {
    const fileId = textHash(sourceFilePath);
    const xliffOriginalPath = path.relative(basePath, filePath);
    let targets: any;
    if (!fs.existsSync(filePath)) {
      targets = {};
    } else {
      const targetText = await fs.promises.readFile(filePath, 'utf-8');
      targets = JSON.parse(targetText);
    }
    const sourceText = await fs.promises.readFile(sourceFilePath, 'utf-8');
    let sources = JSON.parse(sourceText);
    let targetElements: Unit[] = [];
    // dfs sources till leaf nodes (not a object) and update if same key found in targets
    const dfs = (source: any, target: any, keys: string[]) => {
      for (let key in source) {
        const currentKeys = [...keys, key];
        if (typeof source[key] === 'object') {
          dfs(source[key], target[key], currentKeys);
        } else {
          const state = target && target[key] ? 'translated' : 'initial';
          const targetText =
            target && target[key] ? target[key] : source[key] || '';
          targetElements.push({
            name: 'unit',
            type: 'element',
            attributes: {
              id: currentKeys.map((x) => encodeURIComponent(x)).join('/'),
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
                        text: source[key],
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
          });
        }
      }
    };
    dfs(sources, targets, []);
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
