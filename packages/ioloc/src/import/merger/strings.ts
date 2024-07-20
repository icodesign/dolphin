import { logger } from '@repo/base/logger';
import fs from 'node:fs';
import path from 'node:path';
import { js2xml } from 'xml-js';

import { DotStringsItem, DotStringsParser } from '../../common/dotstrings.js';
import i18nStringsFiles from '../../common/i18nstrings.js';
import { elementAsText } from '../../xliff/utils.js';
import { Notes, Segment, Target, Unit, Xliff } from '../../xliff/xliff-spec.js';
import { ImportMerger, MergeConfig } from '../index.js';

export class AppleStringsMerger implements ImportMerger {
  async merge(xliff: Xliff, config: MergeConfig): Promise<void> {
    const filePath = config.targetLanguage.to;
    // make sure output parent folder exists if not create it
    const fileFolder = path.dirname(filePath);
    if (!fs.existsSync(fileFolder)) {
      await fs.promises.mkdir(fileFolder, { recursive: true });
    }

    const file = xliff.elements[0];
    if (!file) {
      logger.warn(`No xliff file element in ${filePath}`);
      await fs.promises.writeFile(filePath, '');
      return;
    }

    const units = file.elements.filter((e) => e.name === 'unit') as Unit[];
    if (units.length === 0) {
      logger.warn(`No unit element in ${filePath}`);
      await fs.promises.writeFile(filePath, '');
      return;
    }
    let fileEntities: DotStringsItem[] = [];
    for (const unit of units) {
      const segment = (unit.elements || []).find(
        (e) => e.name === 'segment',
      ) as Segment | undefined;
      if (!segment) {
        logger.warn(
          `No segment in ${filePath} for unit ${JSON.stringify(unit)}`,
        );
        continue;
      }
      if (segment.attributes?.state === 'initial') {
        logger.warn(
          `Segment <${JSON.stringify(segment)}> state is initial in ${filePath}, skip merging`,
        );
        await fs.promises.writeFile(filePath, '');
        return;
      }
      const target = (segment.elements || []).find(
        (e) => e.name === 'target',
      ) as Target | undefined;
      let targetText = '';
      if (target) {
        targetText = elementAsText(target);
      }
      const notes = (unit.elements || []).filter(
        (e) => e.name === 'notes',
      ) as Notes[];
      const comments = notes.flatMap((note) => {
        return note.elements.flatMap((e) => {
          return e.elements.map((e) => e.text);
        });
      });
      const item = new DotStringsItem(
        comments[0],
        unit.attributes.id,
        targetText,
      );
      fileEntities.push(item);
    }
    let output: string[] = [];
    for (const entity of fileEntities) {
      output.push(entity.toString());
    }
    await fs.promises.writeFile(filePath, output.join('\n\n'));
  }
}
