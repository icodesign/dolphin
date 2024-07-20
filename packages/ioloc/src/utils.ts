import { logger } from '@repo/base/logger';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { join } from 'node:path';

export function textHash(text: string): string {
  const hash = createHash('sha256').update(text).digest('hex');
  return hash;
}

export async function createTemporaryOutputFolder() {
  const outputFolder = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `dolphin-export-`),
  );
  return outputFolder;
}

export async function createOutputFolderIfNeed(
  folder?: string,
): Promise<string> {
  var outputFolder = folder;
  if (!outputFolder) {
    // create temporary output folder for bundle file
    outputFolder = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'dolphin-export-'),
    );
    logger.info(`Created temporary folder: ${outputFolder} as output folder`);
  }

  // make sure valid output folder exists
  try {
    if (!(await fs.promises.stat(outputFolder)).isDirectory()) {
      throw new Error(`${outputFolder} is not a directory.`);
    }
  } catch (e) {
    // check if is ENOENT error
    if ((e as any).code === 'ENOENT') {
      logger.info(`${outputFolder} does not exist. Try creating it.`);
      await fs.promises.mkdir(outputFolder, { recursive: true });
    } else {
      throw e;
    }
  }
  return outputFolder;
}

export enum LocalizationCatalogFormat {
  xcloc = 'xcloc',
  xliff = 'xliff',
}

export type LocalizationCatalog = {
  format: LocalizationCatalogFormat;
  path: string;
};

export async function detectLocalizationCatalogs(
  path: string,
): Promise<LocalizationCatalog[]> {
  const bundles: LocalizationCatalog[] = [];
  bundles.push(...(await detectLocalizationCatalog(path)));

  // only check the top level directory
  const childItems = await readdir(path, { withFileTypes: true });
  for (const child of childItems) {
    bundles.push(...(await detectLocalizationCatalog(join(path, child.name))));
  }
  return bundles;
}

async function detectLocalizationCatalog(
  path: string,
): Promise<LocalizationCatalog[]> {
  if (path.endsWith('.xcloc')) {
    return [
      {
        format: LocalizationCatalogFormat.xcloc,
        path: path,
      },
    ];
  } else if (path.endsWith('.xliff')) {
    return [
      {
        format: LocalizationCatalogFormat.xliff,
        path: path,
      },
    ];
  }
  return [];
}
