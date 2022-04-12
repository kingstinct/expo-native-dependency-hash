#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import {
  red, green, yellow, bold,
} from 'chalk';

type Module = {
  name: string,
  path: string,
  version: string,
  isNative: boolean
};

export const getModuleIdentity = (m: Module) => `${m.name}@${m.version}`;

export const hasNativeVersion = async (path: string) => {
  const parts = await readdir(path);
  return parts.includes('ios') || parts.includes('android');
};

export const getVersion = async (path: string) => {
  const pkg = await readFile(`${path}/package.json`, 'utf8');
  const pkgJson = JSON.parse(pkg) as { version: string };
  return pkgJson.version;
};

export const getHashFromFile = async (filePath: string, verbose: boolean) => {
  if (verbose) console.info(`reading file at: ${filePath}`);
  try {
    const prev = await readFile(filePath, 'utf8');
    const prevHash = prev.split('\n')[0];

    return prevHash;
  } catch (e) {
    if (verbose) {
      console.error(e);
    }
    return null;
  }
};

export const getHashFromPackage = async (
  packageJsonPath: string,
  packageJsonProp: string,
  verbose: boolean,
) => {
  if (verbose) console.info(`reading package.json at: ${packageJsonPath}`);
  try {
    const prev = await readFile(packageJsonPath, 'utf8');
    const prevJson = JSON.parse(prev) as { [key: string]: string };
    const prevHash = prevJson[packageJsonProp];

    return prevHash;
  } catch (e) {
    if (verbose) {
      console.error(e);
    }
    return null;
  }
};

type ExpoAppJson = {
  expo: {
    version: string | undefined,
    ios: {
      buildNumber: string | undefined
    } | undefined,
    android: {
      versionCode: string | undefined
    } | undefined
  }
};

const deletePropsFromAppJson = ['web', 'owner', 'description'];

export const getModules = async (rootDir = '.') => {
  const dir = `${rootDir}/node_modules`;

  try {
    const modules = await readdir(dir);

    // check that node_modules exists
    // run npm / yarn check

    const allModules = (await Promise.all(modules.map<Promise<Module[]>>(async (m) => {
      if (!m.startsWith('.')) {
        if (m.startsWith('@')) {
          const submodules = await readdir(`${dir}/${m}`);
          const allSubmodules = await Promise.all(submodules.map<Promise<Module>>(async (s) => {
            const path = `${dir}/${m}/${s}`;

            return {
              isNative: await hasNativeVersion(path),
              name: `${m}/${s}`,
              path,
              version: await getVersion(path),
            };
          }));
          return allSubmodules;
        }
        const path = `${dir}/${m}`;
        return [{
          isNative: await hasNativeVersion(path),
          name: m,
          path,
          version: await getVersion(path),
        }] as Module[];
      }
      return [];
    }))).flatMap((m) => m);

    allModules.sort((a, b) => a.name.localeCompare(b.name));

    return allModules;
  } catch (e) {
    console.log(red(`Have you installed your packages? "${dir}" does not seem like a valid node_modules folder (${e as string})`));
    return process.exit(1);
  }
};

export const getCurrentHash = async (rootDir = '.', verbose = false, includeBuildNumbers = false, includeVersionNumber = false) => {
  const appJsonPath = `${rootDir}/app.json`;

  let appJsonContent = '';

  try {
    const appJsonStr = await readFile(appJsonPath, 'utf-8');
    const appJson = JSON.parse(appJsonStr) as ExpoAppJson;

    if (verbose) {
      console.log('found app.json, including it in hash');
    }

    deletePropsFromAppJson.forEach((prop) => {
      delete appJson.expo[prop];
    });

    if (!includeBuildNumbers) {
      delete appJson.expo.ios?.buildNumber;
      delete appJson.expo.android?.versionCode;
    }

    if (!includeVersionNumber) {
      delete appJson.expo.version;
    }

    appJsonContent = JSON.stringify(appJson);
  } catch (e) {
    if (verbose) {
      console.log(e);
    }
  }

  const allModules = await getModules(rootDir);

  const nativeModules = allModules.filter((m) => m.isNative);
  const nativeModuleIdentities = nativeModules.map(getModuleIdentity);
  if (verbose) {
    console.log(`Found ${nativeModules.length} native modules (${allModules.length} total):\n${nativeModuleIdentities.join('\n')}`);
  }
  const stringToHashFrom = nativeModuleIdentities.join(',') + appJsonContent;

  if (verbose) {
    console.log(`Generating hash from string: ${stringToHashFrom}`);
  }

  const hash = createHash('md5').update(stringToHashFrom).digest('hex');

  return hash;
};

type BuildProfile = {
  releaseChannel: string;
  cache?: {
    key?: string
  }
};

export async function generate(
  {
    rootDir,
    verbose,
    filePath, easJsonPath,
    packageJsonPath,
    packageJsonProperty,
    includeBuildNumbers,
    includeVersionNumber,
  }: {
    rootDir: string;
    verbose: boolean;
    filePath: string | null;
    easJsonPath: string | null;
    packageJsonPath: string | null;
    packageJsonProperty: string;
    includeBuildNumbers: boolean;
    includeVersionNumber: boolean;
  },
) {
  const hash = await getCurrentHash(rootDir, verbose, includeBuildNumbers, includeVersionNumber);
  console.log(bold(`rn-native-hash: ${hash}`));

  if (filePath) {
    const prevHash = await getHashFromFile(filePath, verbose);
    if (!prevHash) {
      console.info(green(`Saving to "${filePath}"`));
      await writeFile(filePath, hash);
    } else if (prevHash !== hash) {
      console.warn(yellow(`Updating "${filePath}" (was ${prevHash})`));
      await writeFile(filePath, hash);
    } else {
      console.warn(green(`Up to date: "${filePath}"`));
    }
  }
  if (easJsonPath) {
    const propName = 'build';
    const prev = await readFile(easJsonPath, 'utf8');
    const prevJson = JSON.parse(prev) as { version: string; build: Record<string, BuildProfile> };
    console.info(`Updating "${easJsonPath}"`);
    Object.keys(prevJson[propName]).forEach((buildProfile) => {
      const prevReleaseChannel = (prevJson[propName][buildProfile]).releaseChannel;

      const newReleaseChannel = `${hash}-${buildProfile}`;
      (prevJson[propName][buildProfile]).releaseChannel = newReleaseChannel;
      if (prevJson[propName][buildProfile].cache?.key) {
        prevJson[propName][buildProfile].cache!.key = newReleaseChannel;
      }

      if (!prevReleaseChannel) {
        console.info(green(`Saving for profile ${buildProfile}`));
      } else if (prevReleaseChannel !== newReleaseChannel) {
        console.warn(yellow(`Updating for profile ${buildProfile} (was ${prevReleaseChannel})`));
      } else {
        console.warn(green(`Up to date; profile ${buildProfile}`));
      }
    });
    await writeFile(easJsonPath, `${JSON.stringify(prevJson, null, 2)}\n`);
  }

  if (packageJsonPath) {
    const prev = await readFile(packageJsonPath, 'utf8');
    const prevJson = JSON.parse(prev) as { version: string; };
    if (!prevJson[packageJsonProperty]) {
      console.info(green(`Saving to "${packageJsonPath}"`));
      await writeFile(packageJsonPath, JSON.stringify({
        ...prevJson,
        [packageJsonProperty]: hash,
      }, null, 2));
    } else if (prevJson[packageJsonProperty] !== hash) {
      console.warn(yellow(`Updating "${packageJsonPath}" (was ${prevJson[packageJsonProperty] as string})`));
      await writeFile(packageJsonPath, JSON.stringify({
        ...prevJson,
        [packageJsonProperty]: hash,
      }, null, 2));
    } else {
      console.warn(green(`Up to date: "${packageJsonPath}"`));
    }
  }

  if (!packageJsonPath && !filePath && !easJsonPath) {
    console.log(yellow('Nothing saved, use --file or --package-json or --eas to specify where you want to save the hash'));
  }
}

export async function verify(
  {
    verbose,
    rootDir,
    filePath,
    packageJsonPath,
    easJsonPath,
    packageJsonProp,
    includeBuildNumbers,
    includeVersionNumber,
  }: {
    verbose: boolean;
    rootDir: string;
    filePath: string | null;
    packageJsonPath: string | null;
    easJsonPath: string | null;
    packageJsonProp: string;
    includeBuildNumbers: boolean;
    includeVersionNumber: boolean;
  },
) {
  if (verbose) { console.info(`getting depenency hash for native dependencies in: ${rootDir}`); }
  const hash = await getCurrentHash(rootDir, verbose, includeBuildNumbers, includeVersionNumber);
  console.log(bold(`rn-native-hash: ${hash}`));
  let valueExists = false;
  let hasChanged = false;

  if (filePath) {
    const prevHashFile = await getHashFromFile(filePath, verbose);

    if (prevHashFile) {
      valueExists = true;

      if (prevHashFile !== hash) {
        hasChanged = true;
        console.log(red(`hash has changed in ${filePath}! (${prevHashFile})`));
      }
    }
  }

  if (packageJsonPath) {
    const prevHash = await getHashFromPackage(packageJsonPath, packageJsonProp, verbose);

    if (prevHash) {
      valueExists = true;
      if (prevHash !== hash) {
        hasChanged = true;
        console.log(red(`hash has changed in ${packageJsonPath}! (${prevHash})`));
      }
    }
  }

  if (easJsonPath) {
    try {
      const propName = 'build';
      const prev = await readFile(easJsonPath, 'utf8');
      const prevJson = JSON.parse(prev) as { version: string; build: Record<string, BuildProfile> };

      Object.keys(prevJson[propName]).forEach((buildProfile) => {
        const prevReleaseChannel = prevJson[propName][buildProfile].releaseChannel;

        const newReleaseChannel = `${hash}-${buildProfile}`;
        (prevJson[propName][buildProfile]).releaseChannel = newReleaseChannel;

        if (prevReleaseChannel) {
          valueExists = true;
          if (prevReleaseChannel !== newReleaseChannel) {
            hasChanged = true;
            console.warn(yellow(`Hash for profile ${buildProfile} changed (was ${prevReleaseChannel})`));
          }
        }
      });
    } catch (e) {
      if (verbose) {
        console.error(e);
      }
    }
  }

  if (!valueExists) {
    console.error(red('Use "rn-native-hash generate" to create a new hash. No previous hash found, looked in:'));
    console.error(`${filePath as string}\n${packageJsonPath as string}\n${easJsonPath as string}`);
    process.exit(1);
  } else if (hasChanged) {
    console.error(red('hash has changed'));
    process.exit(1);
  } else {
    console.log(green('rn-native-hash up to date'));
  }
}
