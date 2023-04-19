#!/usr/bin/env node

import { createHash } from 'crypto';
import {
  red, green, yellow, bold,
} from 'chalk';
import { execSync } from 'child_process';
import * as Path from 'node:path';
import stableStringify from 'fast-safe-stringify';

import '@total-typescript/ts-reset';

import type { ExpoConfig, Android, IOS } from '@expo/config-types';
import { readdirSync, readFileSync, writeFileSync } from 'fs';

export type Module = {
  name: string;
  path: string;
  version: string;
  isNativeAndroid: boolean;
  isNativeIOS: boolean;
  nativeDependencyHash?: {
    ios?: string;
    android?: string;
    all?: string;
  };
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

export const hasNativeVersion = (platform: Platform, path: string) => {
  const subDirs = readdirSync(path);
  if (platform === Platform.ios) {
    return subDirs.includes('ios');
  }
  if (platform === Platform.android) {
    return subDirs.includes('android');
  }
  return subDirs.includes('ios') || subDirs.includes('android');
};

export const readPackageJson = (path: string) => {
  const pkg = readFileSync(Path.join(path, 'package.json'), 'utf8');
  const pkgJson = JSON.parse(pkg) as {
    version: string;
    nativeDependencyHash?: Module['nativeDependencyHash'];
  };
  return pkgJson;
};

const hashIt = (str: string) => createHash('md5').update(str).digest('hex');

export const hashFiles = (
  rootDir: string,
  relativeFilePaths: string[],
  verbose = false,
) => {
  const nativeFilesHashes = relativeFilePaths.map((filePath) => {
    const fileContents = readFileSync(Path.join(rootDir, filePath), 'utf8');
    return `${filePath}@${hashIt(fileContents)}`;
  });

  if (verbose && nativeFilesHashes.length > 0) {
    console.log('native files with hashes: ', nativeFilesHashes.join('\n'));
  }

  return hashIt(nativeFilesHashes.join(','));
};

export const isGitDirty = (rootDir: string) => {
  const gitDiffOutput = (
    execSync('git diff HEAD', { cwd: rootDir, encoding: 'utf8' })
  );

  return gitDiffOutput.length > 0;
};

export const getFolderHash = (
  platform: Platform,
  rootDir: string,
  verbose = false,
) => {
  const hasAndroidOrIOSFolders = hasNativeVersion(platform, rootDir);

  // if there are no native folders, we don't need to hash anything
  if (!hasAndroidOrIOSFolders) {
    if (verbose) {
      console.log(
        'Skipping native files because there are no iOS/Android folders',
      );
    }
    return '';
  }

  if (verbose) {
    console.log('Reading native files from git...');
  }

  const gitFiles = execSync('git ls-tree -r HEAD --name-only', {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
  });

  const nativeFiles = gitFiles.split('\n').filter((f) => {
    const includeBecauseIos = platform !== Platform.android
      && (f.startsWith('ios') || f.endsWith('.podspec'));
    const includeBecauseAndroid = platform !== Platform.ios && f.startsWith('android');

    return includeBecauseIos || includeBecauseAndroid;
  });

  return hashFiles(rootDir, nativeFiles, verbose);
};

export const getAppPluginHash = (rootDir: string, verbose = false) => {
  const gitFiles = execSync('git ls-tree -r HEAD --name-only', {
    cwd: rootDir,
    encoding: 'utf8',
    env: process.env,
  });

  const nativeFiles = gitFiles.split('\n').filter((f) => {
    const includeBecauseAppPlugin = f.endsWith('plugin.js') || f.endsWith('plugin.ts');

    return includeBecauseAppPlugin;
  });

  return hashFiles(rootDir, nativeFiles, verbose);
};

export const getHashFromFile = (filePath: string, verbose: boolean) => {
  if (verbose) console.info(`reading file at: ${filePath}`);
  try {
    const prev = readFileSync(filePath, 'utf8');
    const prevHash = prev.split('\n')[0];

    return prevHash;
  } catch (e) {
    if (verbose) {
      console.error(e);
    }
    return null;
  }
};

export const getHashFromPackage = (
  packageJsonPath: string,
  packageJsonProp: string,
  verbose: boolean,
) => {
  if (verbose) console.info(`reading package.json at: ${packageJsonPath}`);
  try {
    const prev = readFileSync(packageJsonPath, 'utf8');
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

export const getModules = (rootDir = '.') => {
  const dir = Path.join(rootDir, 'node_modules');

  try {
    const modules = readdirSync(dir);

    // check that node_modules exists
    // run npm / yarn check

    const allModules = (
      modules.map<Module[]>((m) => {
        if (!m.startsWith('.')) {
          const path = Path.join(dir, m);
          if (m.startsWith('@')) {
            const submodules = readdirSync(path);
            const allSubmodules = submodules.map<Module | false>((s) => {
              if (s.startsWith('.')) {
                return false;
              }
              const pathToSubmodule = Path.join(dir, m, s);
              const { version, nativeDependencyHash } = readPackageJson(pathToSubmodule);

              return {
                isNativeAndroid: hasNativeVersion(
                  Platform.android,
                  path,
                ),
                isNativeIOS: hasNativeVersion(Platform.ios, path),
                name: `${m}/${s}`,
                path: pathToSubmodule,
                version,
                nativeDependencyHash,
              };
            });
            return allSubmodules.filter(Boolean);
          }
          const { version, nativeDependencyHash } = readPackageJson(
            path,
          );

          return [
            {
              isNativeAndroid: hasNativeVersion(Platform.android, path),
              isNativeIOS: hasNativeVersion(Platform.ios, path),
              name: m,
              path,
              version,
              nativeDependencyHash,
            },
          ] as Module[];
        }
        return [];
      })
    ).flatMap((m) => m);

    allModules.sort((a, b) => a.name.localeCompare(b.name));

    return allModules;
  } catch (e) {
    console.log(
      red(
        `[expo-native-dependency-hash] Have you installed your packages? "${dir}" does not seem like a valid node_modules folder (${
          e as string
        })`,
      ),
    );
    return process.exit(1);
  }
};

export const readExpoConfig = (rootDir = '.') => {
  const appJsonStr = execSync(
    'npx expo config --json --full --type prebuild',
    { cwd: rootDir, encoding: 'utf-8', env: process.env },
  );
  const appJson = JSON.parse(appJsonStr) as { exp: ExpoConfig };
  return appJson.exp;
};

const GENERATE_HASH_DEFAULTS: Required<GenerateHashOptions> = {
  rootDir: '.',
  skipNodeModules: false,
  verbose: false,
  skipAppJson: false,
  skipLocalNativeFolders: false,
};

type GenerateHashOptions = {
  verbose?: boolean;
  rootDir?: string;
  skipNodeModules?: boolean;
  skipAppJson?: boolean;
  skipLocalNativeFolders?: boolean;
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
  entryPoint: true,
  jsEngine: true,
};

const getAppJsonHash = (
  platform = Platform.all,
  rootDir = '.',
  verbose = false,
) => {
  let appJsonContent = '';

  try {
    const appJson = readExpoConfig(rootDir);

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
          Object.keys(appJson.ios?.entitlements || {}).forEach(
            (entitlementKey) => {
              // eslint-disable-next-line max-len
              const entitlementValue = appJson.ios?.entitlements?.[
                entitlementKey
              ] as string | undefined;
              if (
                entitlementValue
                && typeof entitlementValue === 'string'
                && bundleIdentifier
                && appJson?.ios?.entitlements
              ) {
                // some entitlements have the bundleIdentifier in them,
                // lets ignore it to avoid unnecessary rebuilds
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                appJson.ios.entitlements[entitlementKey] = entitlementValue.replace(bundleIdentifier, '');
              }
            },
          );
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

export const getModulesForPlatform = (
  platform = Platform.all,
  rootDir = '.',
) => {
  const allModules = getModules(rootDir);

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

export const getCurrentHash = (
  platform: Platform,
  {
    rootDir = GENERATE_HASH_DEFAULTS.rootDir,
    skipNodeModules = GENERATE_HASH_DEFAULTS.skipNodeModules,
    verbose = GENERATE_HASH_DEFAULTS.verbose,
    skipAppJson = GENERATE_HASH_DEFAULTS.skipAppJson,
    skipLocalNativeFolders = GENERATE_HASH_DEFAULTS.skipLocalNativeFolders,
  }: GenerateHashOptions = GENERATE_HASH_DEFAULTS,
) => {
  if (verbose) {
    console.log(`Getting hash for platform: ${platform}`);
  }

  const localNativeFoldersHash = skipLocalNativeFolders
    ? ''
    : getFolderHash(platform, rootDir, verbose);

  const appJsonContent = skipAppJson
    ? ''
    : getAppJsonHash(platform, rootDir, verbose);

  const nativeModules = skipNodeModules
    ? []
    : getModulesForPlatform(platform, rootDir);

  const appPlugins = getAppPluginHash('.', verbose);

  const nativeModuleIdentities = nativeModules.map(getModuleIdentity(platform));
  if (verbose && !skipNodeModules) {
    console.log(
      `Found ${nativeModules.length} native ${
        platform === Platform.all ? '' : `${platform} `
      }modules (out of ${
        nativeModules.length
      } total modules)\n${nativeModuleIdentities.join('\n')}`,
    );
  }
  const stringToHashFrom = `app.json@${appJsonContent};local@${localNativeFoldersHash};${nativeModuleIdentities.join(
    ',',
  )};plugins@${appPlugins}`;

  if (verbose) {
    console.log(`Generating hash from string:\n${stringToHashFrom}`);
  }

  const hash = createHash('md5').update(stringToHashFrom).digest('hex');

  return hash;
};

const generateHashes = (
  opts: GenerateHashOptions = GENERATE_HASH_DEFAULTS,
) => {
  const [ios, android, all] = [
    getCurrentHash(Platform.ios, opts),
    getCurrentHash(Platform.android, opts),
    getCurrentHash(Platform.all, opts),
  ];

  if (opts.verbose) {
    console.log(
      `${bold(
        '[expo-native-dependency-hash]',
      )}\n${ios} (ios)\n${android} (android)\n${all} (all)`,
    );
  }

  return {
    ios,
    android,
    all,
  };
};

export function verifyExpoApp({
  verbose,
  rootDir,
  includeAppJson,
  includeLocalNativeFolders,
}: {
  verbose: boolean;
  rootDir: string;
  includeLocalNativeFolders?: boolean;
  includeAppJson?: boolean;
}) {
  if (verbose) {
    console.info(
      `[expo-native-dependency-hash] verifying expo app in: ${rootDir}`,
    );
  }

  const { ios, android, all } = generateHashes({
    rootDir,
    verbose,
    skipAppJson: !includeAppJson,
    skipLocalNativeFolders: !includeLocalNativeFolders,
  });

  let valueExists = false;
  let hasChanged = false;

  try {
    const expoConfig = readExpoConfig(rootDir);

    if (expoConfig.runtimeVersion) {
      valueExists = true;
      if (expoConfig.runtimeVersion !== all) {
        hasChanged = true;
        console.warn(
          yellow(
            `Global hash has changed (was ${JSON.stringify(
              expoConfig.runtimeVersion,
            )})`,
          ),
        );
      }
    }

    if (expoConfig.ios?.runtimeVersion) {
      valueExists = true;
      if (expoConfig.ios.runtimeVersion !== ios) {
        hasChanged = true;
        console.warn(
          yellow(
            `iOS hash has changed (was ${JSON.stringify(
              expoConfig.ios.runtimeVersion,
            )})`,
          ),
        );
      }
    }

    if (expoConfig.android?.runtimeVersion) {
      valueExists = true;
      if (expoConfig.android.runtimeVersion !== android) {
        hasChanged = true;
        console.warn(
          yellow(
            `Android hash has changed (was ${JSON.stringify(
              expoConfig.android.runtimeVersion,
            )})`,
          ),
        );
      }
    }
  } catch (e) {
    if (verbose) {
      console.error(e);
    }
  }

  return {
    valueExists,
    hasChanged,
    ios,
    android,
    all,
  };
}

export function updateExpoApp({
  rootDir,
  verbose,
  includeAppJson,
  includeLocalNativeFolders,
}: {
  rootDir: string;
  verbose: boolean;
  includeAppJson?: boolean;
  includeLocalNativeFolders?: boolean;
}) {
  const {
    hasChanged, valueExists, ios, android, all,
  } = verifyExpoApp({
    rootDir,
    verbose,
    includeAppJson,
    includeLocalNativeFolders,
  });

  if (!hasChanged && valueExists) {
    console.log(green('Hashes already up to date'));
    return;
  }

  try {
    const fileStr = readFileSync(Path.join(rootDir, 'app.json'), 'utf8');
    const prevJson = JSON.parse(fileStr) as { expo: ExpoConfig };

    prevJson.expo.runtimeVersion = all;
    prevJson.expo.ios = { ...prevJson.expo.ios, runtimeVersion: ios };
    prevJson.expo.android = {
      ...prevJson.expo.android,
      runtimeVersion: android,
    };

    writeFileSync(
      Path.join(rootDir, 'app.json'),
      `${JSON.stringify(prevJson, null, 2)}\n`,
    );

    console.log(green('Hashes where updated'));
  } catch (e) {
    console.error(red('Failed to update app.json'), e);
  }
}

export function verifyLibrary({
  verbose,
  rootDir,
}: {
  verbose: boolean;
  rootDir: string;
}) {
  if (verbose) {
    console.info(
      `[expo-native-dependency-hash] verifying library in: ${rootDir}`,
    );
  }

  const { ios, android, all } = generateHashes({
    rootDir,
    verbose,
    skipNodeModules: true,
    skipAppJson: true,
  });

  let valueExists = false;
  let hasChanged = false;

  try {
    const packageJson = readPackageJson(rootDir);

    if (packageJson.nativeDependencyHash?.all) {
      valueExists = true;
      if (packageJson.nativeDependencyHash?.all !== all) {
        console.warn(
          yellow(
            `Hash has changed (is ${packageJson.nativeDependencyHash.all}, should be ${all}`,
          ),
        );
        hasChanged = true;
      }
    }

    if (packageJson.nativeDependencyHash?.ios) {
      valueExists = true;
      if (packageJson.nativeDependencyHash.ios !== ios) {
        hasChanged = true;
        console.warn(
          yellow(
            `iOS hash has changed (is ${packageJson.nativeDependencyHash.ios}, should be ${ios}`,
          ),
        );
      }
    }

    if (packageJson.nativeDependencyHash?.android) {
      valueExists = true;
      if (packageJson.nativeDependencyHash.android !== android) {
        hasChanged = true;
        console.warn(
          yellow(
            `Android hash has changed (is ${packageJson.nativeDependencyHash.android}, should be ${android}`,
          ),
        );
      }
    }
  } catch (e) {
    console.error(e);
  }

  return { valueExists, hasChanged };
}

export function updateLibrary({
  rootDir,
  verbose,
}: {
  rootDir: string;
  verbose: boolean;
}) {
  const prev = verifyLibrary({ rootDir, verbose });

  if (prev.valueExists && !prev.hasChanged) {
    console.info(green('Hashes already up to date'));
    return;
  }

  const { ios, android, all } = generateHashes({
    rootDir,
    verbose,
    skipNodeModules: true,
    skipAppJson: true,
  });
  const prevJson = readPackageJson(rootDir);

  prevJson.nativeDependencyHash = {
    ...prevJson.nativeDependencyHash,
    ios,
    android,
    all,
  };

  writeFileSync(
    Path.join(rootDir, 'package.json'),
    `${JSON.stringify(prevJson, null, 2)}\n`,
  );

  console.info(yellow('Hashes updated'));
}
