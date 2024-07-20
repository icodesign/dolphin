import { logger } from '@repo/base/logger';
import fs from 'node:fs';
import path from 'node:path';

import { Xliff } from '../../xliff/xliff-spec.js';
import { ImportMerger, MergeConfig } from '../index.js';
import { XliffMerger } from './xliff.js';

export class XclocMerger implements ImportMerger {
  async merge(xliff: Xliff, config: MergeConfig): Promise<void> {
    const filePath = config.targetLanguage.to;
    const language = config.targetLanguage.code;
    // For xcloc files, we need to parse the [lang].xliff file inside the "Localized Contents" folder.
    // For example, if the xcloc file is at "en.xcloc", then we need to parse "en.xcloc/Localized Contents/en.xliff".
    const xliffFilePath = path.join(
      filePath,
      `Localized Contents/${language}.xliff`,
    );
    if (!fs.existsSync(xliffFilePath)) {
      // copy source bundle path to target bundle path
      const sourcePath = config.sourceLanguage.path;
      const targetPath = config.targetLanguage.to;
      logger.info(`Copying source bundle from ${sourcePath} to ${targetPath}`);
      await fs.promises.cp(sourcePath, targetPath, { recursive: true });
    }
    const merger = new XliffMerger();
    const xliffConfig: MergeConfig = {
      sourceLanguage: {
        code: config.sourceLanguage.code,
        path: path.join(
          config.sourceLanguage.path,
          `Localized Contents/${config.sourceLanguage.code}.xliff`,
        ),
      },
      targetLanguage: {
        code: config.targetLanguage.code,
        from: config.targetLanguage.from,
        to: path.join(
          config.targetLanguage.to,
          `Localized Contents/${config.targetLanguage.code}.xliff`,
        ),
      },
    };
    merger.merge(xliff, xliffConfig);
  }
}
