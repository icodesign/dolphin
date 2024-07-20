import fs from 'node:fs';
import path from 'node:path';

import {
  XliffVersion,
  parseXliffPath,
  stringifyXliff1,
  stringifyXliff2,
} from '../../xliff/index.js';
import { convertV2toV1 } from '../../xliff/utils.js';
import { Xliff } from '../../xliff/xliff-spec.js';
import { ImportMerger, MergeConfig } from '../index.js';

export class XliffMerger implements ImportMerger {
  async merge(xliff: Xliff, config: MergeConfig): Promise<void> {
    const filePath = config.targetLanguage.to;
    const sourcePath = config.sourceLanguage.path;
    // make sure output parent folder exists if not create it
    const fileFolder = path.dirname(filePath);
    if (!fs.existsSync(fileFolder)) {
      await fs.promises.mkdir(fileFolder, { recursive: true });
    }

    if (xliff.elements.length === 0) {
      await fs.promises.writeFile(filePath, '');
      return;
    }

    const doc = await parseXliffPath(sourcePath);
    if (doc.version === XliffVersion.V2) {
      const xml = stringifyXliff2(xliff);
      await fs.promises.writeFile(filePath, xml);
    } else {
      const file = convertV2toV1(xliff);
      const xml = stringifyXliff1(file);
      await fs.promises.writeFile(filePath, xml);
    }
  }
}
