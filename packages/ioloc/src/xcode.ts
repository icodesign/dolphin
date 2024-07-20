import { XcodeProject } from '@bacons/xcode';
import { CommonLocalizationConfig } from '@repo/base/config';
import { logger } from '@repo/base/logger';
import child_process from 'child_process';
import fs from 'node:fs';
import path from 'node:path';

import { ExportLocalizations, ImportLocalizations } from './index.js';
import { createOutputFolderIfNeed } from './utils.js';

const XcodeCommonArgs =
  '-disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile -skipPackageUpdates';

export type ExportOptions = {
  // The base language for translation. By default, it's using default localization language of the project. Normally you don't need provide this option.
  baseLanguage?: string;
};

export type ExportResult = {
  bundlePath: string;
};

export type ImportOptions = {};

export type ImportResult = {
  code: number;
};

export class XcodeExportLocalizations implements ExportLocalizations {
  constructor(
    private config: CommonLocalizationConfig,
    private baseFolder: string,
    private outputFolder?: string,
  ) {}

  async export(): Promise<ExportResult> {
    // check if xcodebuild command is available
    try {
      child_process.execSync('/usr/bin/xcodebuild');
    } catch (e) {
      throw new Error(
        'xcodebuild command is not available. Make sure you have Xcode installed.',
      );
    }

    const outputFolder = await createOutputFolderIfNeed(this.outputFolder);

    const projectPath = path.isAbsolute(this.config.path)
      ? this.config.path
      : path.join(this.baseFolder, this.config.path);
    // get all known regions
    const xcodeProject = XcodeProject.open(
      path.join(projectPath, 'project.pbxproj'),
    );
    const developmentRegion = xcodeProject.rootObject.props.developmentRegion;
    const knownRegions = xcodeProject.rootObject.props.knownRegions;
    logger.info(`Found known regions: ${knownRegions.join(', ')}`);

    // run exportLocaizations command
    let exportRegions: string[] = [];
    let command = `/usr/bin/xcodebuild -exportLocalizations -project ${projectPath} -localizationPath ${outputFolder} ${XcodeCommonArgs}`;
    for (const region of knownRegions) {
      if (region === 'Base') {
        // skip base region
        logger.info(`Skipping base region`);
        continue;
      }
      command += ` -exportLanguage ${region}`;
      exportRegions.push(region);
    }
    logger.info(`Running command: ${command}`);
    const result = await exec(command);
    if (result.code !== 0) {
      throw new Error(
        `xcodebuild exportLocalizations command failed with code: ${result.code}`,
      );
    }

    // check if we get all the xcloc files
    const xclocPaths = (
      await fs.promises.readdir(outputFolder, { withFileTypes: true })
    )
      .filter(
        (direntory) =>
          direntory.isDirectory() && direntory.name.endsWith('.xcloc'),
      )
      .map((dirent) => dirent.name)
      .sort();
    const expectedFiles = exportRegions
      .map((region) => `${region}.xcloc`)
      .sort();
    if (
      xclocPaths.length !== expectedFiles.length ||
      !xclocPaths.every((value, index) => value === expectedFiles[index])
    ) {
      throw new Error(
        `Failed to export all xcloc files, expected: ${expectedFiles
          .sort()
          .join(', ')}, found: ${xclocPaths.sort().join(', ')}`,
      );
    }
    return {
      bundlePath: outputFolder,
    };
  }
}

export class XcodeImportLocalizations implements ImportLocalizations {
  constructor(
    private config: CommonLocalizationConfig,
    private baseFolder: string,
  ) {}
  async import(localizationBundlePath: string): Promise<ImportResult> {
    // check if xcodebuild command is available
    try {
      child_process.execSync('/usr/bin/xcodebuild');
    } catch (e) {
      throw new Error(
        'xcodebuild command is not available. Make sure you have Xcode installed.',
      );
    }

    const projectPath = path.isAbsolute(this.config.path)
      ? this.config.path
      : path.join(this.baseFolder, this.config.path);
    // run importLocaizations command
    const xclocPaths = (
      await fs.promises.readdir(localizationBundlePath, { withFileTypes: true })
    )
      .filter(
        (direntory) =>
          direntory.isDirectory() && direntory.name.endsWith('.xcloc'),
      )
      .map((dirent) => path.join(localizationBundlePath, dirent.name))
      .sort();
    logger.info(`Found xcloc files: ${xclocPaths.join(', ')}`);
    for (const xclocPath of xclocPaths) {
      const command = `/usr/bin/xcodebuild -importLocalizations -project ${projectPath} -localizationPath ${xclocPath} -mergeImport ${XcodeCommonArgs}`;
      logger.info(`Running command: ${command}`);
      const result = await exec(command);
      if (result.code !== 0) {
        throw new Error(
          `xcodebuild importLocalizations command failed with code: ${result.code}`,
        );
      }
    }
    return {
      code: 0,
    };
  }
}

async function exec(command: string) {
  const commands = command.split(' ');
  if (!commands[0]) {
    throw new Error(`Invalid command: ${command}`);
  }
  let child = child_process.spawn(commands[0], commands.slice(1));
  let error = '';
  for await (const chunk of child.stderr) {
    error += chunk;
  }
  logger.error(error);
  const exitCode = await new Promise((resolve, reject) => {
    child.on('close', resolve);
  });
  return {
    code: exitCode,
  };
}
