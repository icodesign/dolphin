import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export enum LocalizationCatalogFormat {
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
  if (path.endsWith('.xliff')) {
    return [
      {
        format: LocalizationCatalogFormat.xliff,
        path: path,
      },
    ];
  }
  return [];
}
