import { logger } from '@repo/base/logger';
import fs from 'node:fs';
import path from 'node:path';

import { elementAsText } from '../../xliff/utils.js';
import { Segment, Target, Unit, Xliff } from '../../xliff/xliff-spec.js';
import { ImportMerger, MergeConfig } from '../index.js';

export class TextMerger implements ImportMerger {
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

    const unit = file.elements.find((e) => e.name === 'unit') as
      | Unit
      | undefined;
    if (!unit) {
      logger.warn(`No unit element in ${filePath}`);
      await fs.promises.writeFile(filePath, '');
      return;
    }
    const segment = (unit.elements || []).find((e) => e.name === 'segment') as
      | Segment
      | undefined;
    if (!segment) {
      logger.warn(`No segment in ${filePath} for unit ${JSON.stringify(unit)}`);
      await fs.promises.writeFile(filePath, '');
      return;
    }
    if (segment.attributes?.state === 'initial') {
      logger.warn(
        `Segment <${JSON.stringify(segment)}> state is initial in ${filePath}, skip merging`,
      );
      await fs.promises.writeFile(filePath, '');
      return;
    }
    const target = (segment.elements || []).find((e) => e.name === 'target') as
      | Target
      | undefined;
    if (!target) {
      logger.warn(`No target in ${filePath}`);
      await fs.promises.writeFile(filePath, '');
      return;
    }
    const targetText = elementAsText(target);
    await fs.promises.writeFile(filePath, targetText);
  }
}
