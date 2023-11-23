#!/usr/bin/env node

import {
  readdir, readFile, writeFile,
} from 'fs/promises';
import { createHash } from 'crypto';
import {
  bold, yellow, red, green,
} from 'chalk';
import { exec } from 'child_process';
import * as Path from 'node:path';
import * as util from 'util';
import stableStringify from 'fast-safe-stringify';

import '@total-typescript/ts-reset';

import type { ExpoConfig, Android, IOS } from '@expo/config-types';

const execAsync = util.promisify(exec);

export type Module = {
  name: string,
  path: string,
  version: string,
  isNativeAndroid: boolean,
  isNativeIOS: boolean,
  nativeDependencyHash?: {
    ios?: string,
    android?: string,
    all?: string
  }
};

export enum Platform {
  android = 'android',
  ios = 'ios',
  all = 'all',
}

export const getModuleIdentity = (platform: Platform) => (m: Module) => {
  if (platform === Platform.all && m.nativeDependencyHash?.all) {
    return `${m.name}@${m.nativeDependencyHash.all}`;
  }

  if (platform === Platform.ios && m.nativeDependencyHash?.ios) {
    return `${m.name}@${m.nativeDependencyHash.ios}`;
  }

  if (platform === Platform.android && m.nativeDependencyHash?.android) {
    return `${m.name}@${m.nativeDependencyHash.android}`;
  }

  return `${m.name}@${m.version}`;
};

export const hasNativeVersion = async (platform: Platform, path: string) => {
  const subDirs = await readdir(path);
  if (platform === Platform.ios) {
    return subDirs.includes('ios');
  }
  if (platform === Platform.android) {
    return subDirs.includes('android');
  }
  return subDirs.includes('ios') || subDirs.includes('android');
};

export const readPackageJson = async (path: string) => {
  try {
    const pkg = await readFile(Path.join(path, 'package.json'), 'utf8');
    const pkgJson = JSON.parse(pkg) as {
      version: string,
      nativeDependencyHash?: Module['nativeDependencyHash']
    };
    return pkgJson;
  } catch (e) {
    console.error(red('Failed to read package.json'), e);
    return process.exit(1);
  }
};

const hashIt = (str: string) => createHash('md5').update(str).digest('hex');

export const hashFiles = async (rootDir: string, relativeFilePaths: string[], verbose = false) => {
  const nativeFilesHashes = await Promise.all(relativeFilePaths.map(async (filePath) => {
    const fileContents = await readFile(Path.join(rootDir, filePath), 'utf8');
    return `${filePath}@${hashIt(fileContents)}`;
  }));

  if (verbose && nativeFilesHashes.length > 0) {
    console.log('native files with hashes: ', nativeFilesHashes.join('\n'));
  }

  return hashIt(nativeFilesHashes.join(','));
};

export const isGitDirty = async (rootDir: string) => {
  const gitDiffOutput = (await execAsync('git diff HEAD', { cwd: rootDir, encoding: 'utf8' })).stdout;
  return gitDiffOutput.length > 0;
};

export const getFolderHash = async (platform: Platform, rootDir: string, verbose = false) => {
  const hasAndroidOrIOSFolders = await hasNativeVersion(platform, rootDir);

  // if there are no native folders, we don't need to hash anything
  if (!hasAndroidOrIOSFolders) {
    if (verbose) {
      console.log('Skipping native files because there are no iOS/Android folders');
    }
    return '';
  }

  if (verbose) {
    console.log('Reading native files from git...');
  }

  const gitFiles = await execAsync('git ls-tree -r HEAD --name-only', {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
  });

  const nativeFiles = gitFiles.stdout
    .split('\n')
    .filter((f) => {
      const includeBecauseIos = platform !== Platform.android && (f.startsWith('ios') || f.endsWith('.podspec'));
      const includeBecauseAndroid = platform !== Platform.ios && f.startsWith('android');

      return includeBecauseIos || includeBecauseAndroid;
    });

  return hashFiles(rootDir, nativeFiles, verbose);
};

export const getAppPluginHash = async (rootDir: string, verbose = false) => {
  const gitFiles = await execAsync('git ls-tree -r HEAD --name-only', {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
  });

  const nativeFiles = gitFiles.stdout
    .split('\n')
    .filter((f) => {
      const includeBecauseAppPlugin = f.endsWith('plugin.js') || f.endsWith('plugin.ts');

      return includeBecauseAppPlugin;
    });

  return hashFiles(rootDir, nativeFiles, verbose);
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

export const getModules = async (rootDir: string, verbose: boolean, nodeModulePaths: string[]) => {
  const dirs = nodeModulePaths.map((nmp) => Path.join(rootDir, nmp));

  try {
    const modules = (await Promise.all(dirs.map(async (dir) => {
      const relativePaths = await readdir(dir);

      return relativePaths.map((relativePath) => ({
        relativePath,
        dir,
      }));
    }))).flat();

    // check that node_modules exists
    // run npm / yarn check

    const allModules = (await Promise.all(
      modules.map<Promise<Module[]>>(async ({ relativePath, dir }) => {
        if (!relativePath.startsWith('.')) {
          const path = Path.join(dir, relativePath);
          if (relativePath.startsWith('@')) {
            if (verbose) {
              console.log(`Found scope: ${relativePath}`);
            }
            const submodules = await readdir(path);
            const allSubmodules = await Promise.all(
              submodules.map<Promise<Module | false>>(async (s) => {
                if (s.startsWith('.')) {
                  return false;
                }

                if (verbose) {
                  console.log(`Found scoped module: ${relativePath}/${s}`);
                }

                const pathToSubmodule = Path.join(dir, relativePath, s);
                const {
                  version,
                  nativeDependencyHash,
                } = await readPackageJson(pathToSubmodule);

                const data = {
                  isNativeAndroid: await hasNativeVersion(Platform.android, pathToSubmodule),
                  isNativeIOS: await hasNativeVersion(Platform.ios, pathToSubmodule),
                  name: `${relativePath}/${s}`,
                  path: pathToSubmodule,
                  version,
                  nativeDependencyHash,
                };

                if (verbose) {
                  console.log(JSON.stringify(data, null, 2));
                }

                return data;
              }),
            );
            return allSubmodules.filter(Boolean);
          }
          const { version, nativeDependencyHash } = await readPackageJson(path);

          return [{
            isNativeAndroid: await hasNativeVersion(Platform.android, path),
            isNativeIOS: await hasNativeVersion(Platform.ios, path),
            name: relativePath,
            path,
            version,
            nativeDependencyHash,
          }] as Module[];
        }
        return [];
      }),
    )).flatMap((m) => m);

    allModules.sort((a, b) => a.name.localeCompare(b.name));

    return allModules;
  } catch (e) {
    console.log(red(`[expo-native-dependency-hash] Have you installed your packages? "${nodeModulePaths.join(',')}" does not seem like a valid node_modules folder (${e as string})`));
    return process.exit(1);
  }
};

export const readExpoConfig = async (rootDir: string, verbose: boolean) => {
  try {
    const appJsonStr = await execAsync('npx expo config --json --full --type prebuild', { cwd: rootDir, encoding: 'utf-8', env: process.env });
    if (verbose) {
      console.log('Expo Config', appJsonStr);
    }
    const beginningOfConfig = appJsonStr.stdout.indexOf('{');
    const configPart = appJsonStr.stdout.slice(beginningOfConfig);
    const appJson = JSON.parse(configPart) as { exp: ExpoConfig };
    return appJson.exp;
  } catch (e) {
    console.error(red('Failed to read Expo Config, this can happen if you\'re logging to stdout in your app.config.js file'), e);
    return process.exit(1);
  }
};

const GENERATE_HASH_DEFAULTS: Required<GenerateHashOptions> = {
  rootDir: '.',
  skipNodeModules: false,
  verbose: false,
  skipAppJson: false,
  skipLocalNativeFolders: true,
  nodeModulePaths: ['node_modules'],
};

type GenerateHashOptions = {
  verbose?: boolean,
  rootDir?: string,
  skipNodeModules?: boolean,
  skipAppJson?: boolean,
  skipLocalNativeFolders?: boolean,
  nodeModulePaths: string[],
};

// this is a list of properties that should be included, lets focus on not breaking things
const androidPropsToHash: Partial<Record<keyof Android, boolean>> = {
  permissions: true,
  blockedPermissions: true,
  jsEngine: true,
};

// this is a list of properties that should be included, lets focus on not breaking things
const iosPropsToHash: Partial<Record<keyof IOS, boolean>> = {
  entitlements: true,
  infoPlist: true,
  jsEngine: true,
};

// this is a list of properties that should be included, lets focus on not breaking things
const expoPropsToHash: Partial<Record<keyof ExpoConfig, boolean>> = {
  android: true,
  ios: true,
  plugins: true,
  jsEngine: true,
};

const getAppJsonHash = async (platform = Platform.all, rootDir = '.', verbose = false) => {
  let appJsonContent = '';

  try {
    const appJson = await readExpoConfig(rootDir, verbose);

    Object.keys(appJson || {}).forEach((key) => {
      if (!expoPropsToHash[key]) {
        delete appJson[key];
      }
    });

    if (platform === Platform.ios) {
      delete appJson.android;
    } else {
      Object.keys(appJson.android || {}).forEach((key) => {
        if (!androidPropsToHash[key]) {
          delete appJson.android?.[key];
        }
      });
    }

    if (platform === Platform.android) {
      delete appJson.ios;
    } else {
      const bundleIdentifier = appJson.ios?.bundleIdentifier;
      Object.keys(appJson.ios || {}).forEach((key) => {
        if (!iosPropsToHash[key]) {
          delete appJson.ios?.[key];
        } else if (key === 'entitlements') {
          Object.keys(appJson.ios?.entitlements || {}).forEach((entitlementKey) => {
            // eslint-disable-next-line max-len
            const entitlementValue = appJson.ios?.entitlements?.[entitlementKey] as string | undefined;
            if (entitlementValue && typeof entitlementValue === 'string' && bundleIdentifier && appJson?.ios?.entitlements) {
              // some entitlements have the bundleIdentifier in them,
              // lets ignore it to avoid unnecessary rebuilds
              // eslint-disable-next-line max-len
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
              appJson.ios.entitlements[entitlementKey] = entitlementValue.replace(bundleIdentifier, '');
            }
          });
        }
      });
    }

    const appJsonStr = stableStringify(appJson);
    appJsonContent = hashIt(appJsonStr);
  } catch (e) {
    if (verbose) {
      console.log(e);
    }
  }
  return appJsonContent;
};

export const getModulesForPlatform = async (
  platform: Platform,
  rootDir: string,
  verbose: boolean,
  nodeModulePaths: string[],
) => {
  const allModules = await getModules(rootDir, verbose, nodeModulePaths);

  const nativeModules = allModules.filter((m) => {
    if (platform === Platform.ios) {
      return m.isNativeIOS;
    }
    if (platform === Platform.android) {
      return m.isNativeAndroid;
    }
    return m.isNativeAndroid || m.isNativeIOS;
  });

  return nativeModules;
};

export const getCurrentHash = async (platform: Platform, {
  rootDir = GENERATE_HASH_DEFAULTS.rootDir,
  skipNodeModules = GENERATE_HASH_DEFAULTS.skipNodeModules,
  verbose = GENERATE_HASH_DEFAULTS.verbose,
  skipAppJson = GENERATE_HASH_DEFAULTS.skipAppJson,
  skipLocalNativeFolders = GENERATE_HASH_DEFAULTS.skipLocalNativeFolders,
  nodeModulePaths = GENERATE_HASH_DEFAULTS.nodeModulePaths,
}: GenerateHashOptions = GENERATE_HASH_DEFAULTS) => {
  if (verbose) {
    console.log(`Getting hash for platform: ${platform}`);
  }

  const localNativeFoldersHash = skipLocalNativeFolders ? '' : await getFolderHash(platform, rootDir, verbose);

  const appJsonContent = skipAppJson ? '' : await getAppJsonHash(platform, rootDir, verbose);

  const nativeModules = skipNodeModules ? [] : await getModulesForPlatform(
    platform,
    rootDir,
    verbose,
    nodeModulePaths,
  );

  const appPlugins = skipLocalNativeFolders ? '' : await getAppPluginHash('.', verbose);

  const nativeModuleIdentities = nativeModules.map(getModuleIdentity(platform));
  if (verbose && !skipNodeModules) {
    console.log(`Found ${nativeModules.length} native ${platform === Platform.all ? '' : `${platform} `}modules (out of ${nativeModules.length} total modules)\n${nativeModuleIdentities.join('\n')}`);
  }
  const stringToHashFrom = `app.json@${appJsonContent};local@${localNativeFoldersHash};${nativeModuleIdentities.join(',')};plugins@${appPlugins}`;

  if (verbose) {
    console.log(`Generating hash from string:\n${stringToHashFrom}`);
  }

  const hash = createHash('md5').update(stringToHashFrom).digest('hex');

  return hash;
};

const generateHashes = async (opts: GenerateHashOptions = GENERATE_HASH_DEFAULTS) => {
  const [ios, android, all] = await Promise.all([
    getCurrentHash(Platform.ios, opts),
    getCurrentHash(Platform.android, opts),
    getCurrentHash(Platform.all, opts),
  ]);

  if (opts.verbose) {
    console.log(`${bold('[expo-native-dependency-hash]')}\n${ios} (ios)\n${android} (android)\n${all} (all)`);
  }

  return {
    ios,
    android,
    all,
  };
};

export async function verifyExpoApp(
  {
    verbose,
    rootDir,
    includeAppJson,
    includeLocalNativeFolders,
    nodeModulePaths,
  }: {
    verbose: boolean;
    rootDir: string;
    includeLocalNativeFolders?: boolean;
    includeAppJson?: boolean;
    nodeModulePaths: string[];
  },
) {
  if (verbose) { console.info(`[expo-native-dependency-hash] verifying expo app in: ${rootDir}`); }

  const { ios, android, all } = await generateHashes({
    rootDir,
    verbose,
    skipAppJson: !includeAppJson,
    skipLocalNativeFolders: !includeLocalNativeFolders,
    nodeModulePaths,
  });

  let valueExists = false;
  let hasChanged = false;

  try {
    const expoConfig = await readExpoConfig(rootDir, verbose);

    if (expoConfig.runtimeVersion) {
      valueExists = true;
      if (expoConfig.runtimeVersion !== all) {
        hasChanged = true;
        console.warn(yellow(`Global hash has changed (was ${JSON.stringify(expoConfig.runtimeVersion)})`));
      }
    }

    if (expoConfig.ios?.runtimeVersion) {
      valueExists = true;
      if (expoConfig.ios.runtimeVersion !== ios) {
        hasChanged = true;
        console.warn(yellow(`iOS hash has changed (was ${JSON.stringify(expoConfig.ios.runtimeVersion)})`));
      }
    }

    if (expoConfig.android?.runtimeVersion) {
      valueExists = true;
      if (expoConfig.android.runtimeVersion !== android) {
        hasChanged = true;
        console.warn(yellow(`Android hash has changed (was ${JSON.stringify(expoConfig.android.runtimeVersion)})`));
      }
    }
  } catch (e) {
    if (verbose) {
      console.error(e);
    }
  }

  return {
    valueExists, hasChanged, ios, android, all,
  };
}

export async function updateExpoApp(
  {
    rootDir,
    verbose,
    includeAppJson,
    includeLocalNativeFolders,
    nodeModulePaths,
  }: {
    rootDir: string;
    verbose: boolean;
    includeAppJson?: boolean;
    includeLocalNativeFolders?: boolean;
    nodeModulePaths: string[];
  },
) {
  const {
    hasChanged, valueExists, ios, android, all,
  } = await verifyExpoApp({
    rootDir,
    verbose,
    includeAppJson,
    includeLocalNativeFolders,
    nodeModulePaths,
  });

  if (!hasChanged && valueExists) {
    console.log(green('Hashes already up to date'));
    return;
  }

  try {
    const fileStr = await readFile(Path.join(rootDir, 'app.json'), 'utf8');
    const prevJson = JSON.parse(fileStr) as { expo: ExpoConfig };

    prevJson.expo.runtimeVersion = all;
    prevJson.expo.ios = { ...prevJson.expo.ios, runtimeVersion: ios };
    prevJson.expo.android = { ...prevJson.expo.android, runtimeVersion: android };

    await writeFile(Path.join(rootDir, 'app.json'), `${JSON.stringify(prevJson, null, 2)}\n`);

    console.log(green('Hashes where updated'));
  } catch (e) {
    console.error(red('Failed to update app.json'), e);
  }
}

export async function verifyLibrary(
  {
    verbose,
    rootDir,
    skipLocalNativeFolders = false,
  }: {
    verbose: boolean;
    rootDir: string;
    skipLocalNativeFolders?: boolean
  },
) {
  if (verbose) { console.info(`[expo-native-dependency-hash] verifying library in: ${rootDir}`); }

  const { ios, android, all } = await generateHashes({
    rootDir,
    verbose,
    skipNodeModules: true,
    skipAppJson: true,
    skipLocalNativeFolders,
    nodeModulePaths: [],
  });

  let valueExists = false;
  let hasChanged = false;

  try {
    const packageJson = await readPackageJson(rootDir);

    if (packageJson.nativeDependencyHash?.all) {
      valueExists = true;
      if (packageJson.nativeDependencyHash?.all !== all) {
        console.warn(yellow(`Hash has changed (is ${packageJson.nativeDependencyHash.all}, should be ${all}`));
        hasChanged = true;
      }
    }

    if (packageJson.nativeDependencyHash?.ios) {
      valueExists = true;
      if (packageJson.nativeDependencyHash.ios !== ios) {
        hasChanged = true;
        console.warn(yellow(`iOS hash has changed (is ${packageJson.nativeDependencyHash.ios}, should be ${ios}`));
      }
    }

    if (packageJson.nativeDependencyHash?.android) {
      valueExists = true;
      if (packageJson.nativeDependencyHash.android !== android) {
        hasChanged = true;
        console.warn(yellow(`Android hash has changed (is ${packageJson.nativeDependencyHash.android}, should be ${android}`));
      }
    }
  } catch (e) {
    console.error(e);
  }

  return { valueExists, hasChanged };
}

export async function updateLibrary(
  {
    rootDir,
    verbose,

  }: {
    rootDir: string;
    verbose: boolean;
  },
) {
  const prev = await verifyLibrary({ rootDir, verbose });

  if (prev.valueExists && !prev.hasChanged) {
    console.info(green('Hashes already up to date'));
    return;
  }

  const { ios, android, all } = await generateHashes({
    rootDir,
    verbose,
    skipNodeModules: true,
    skipAppJson: true,
    nodeModulePaths: [],
  });
  const prevJson = await readPackageJson(rootDir);

  prevJson.nativeDependencyHash = {
    ...prevJson.nativeDependencyHash,
    ios,
    android,
    all,
  };

  await writeFile(Path.join(rootDir, 'package.json'), `${JSON.stringify(prevJson, null, 2)}\n`);

  console.info(yellow('Hashes updated'));
}
