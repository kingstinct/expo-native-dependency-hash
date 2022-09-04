#!/usr/bin/env node

import {
  readdir, readFile, writeFile,
} from 'fs/promises';
import { createHash } from 'crypto';
import {
  red, green, yellow, bold,
} from 'chalk';
import { execSync } from 'child_process';
import * as Path from 'node:path';
import stableStringify from 'fast-safe-stringify';
import { readFileSync } from 'fs';

export type Module = {
  name: string,
  path: string,
  version: string,
  isNativeAndroid: boolean,
  isNativeIOS: boolean,
  rnNativeHash?: {
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
  if (platform === Platform.all && m.rnNativeHash?.all) {
    return `${m.name}@${m.rnNativeHash.all}`;
  }

  if (platform === Platform.ios && m.rnNativeHash?.ios) {
    return `${m.name}@${m.rnNativeHash.ios}`;
  }

  if (platform === Platform.android && m.rnNativeHash?.android) {
    return `${m.name}@${m.rnNativeHash.android}`;
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
  const pkg = await readFile(Path.join(path, 'package.json'), 'utf8');
  const pkgJson = JSON.parse(pkg) as {
    version: string,
    rnNativeHash?: Module['rnNativeHash']
  };
  return pkgJson;
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

export const isGitDirty = (rootDir: string) => {
  const gitDiffOutput = execSync('git diff HEAD', { cwd: rootDir, encoding: 'utf8' }).toString();
  return gitDiffOutput.length > 0;
};

export const getFolderHash = async (platform: Platform, rootDir: string, verbose = false) => {
  const gitFiles = execSync('git ls-tree -r HEAD --name-only', { cwd: rootDir, encoding: 'utf8', env: process.env });

  const nativeFiles = gitFiles
    .split('\n')
    .filter((f) => {
      const includeBecauseIos = platform !== Platform.android && (f.startsWith('ios') || f.endsWith('.podspec'));
      const includeBecauseAndroid = platform !== Platform.ios && f.startsWith('android');

      return includeBecauseIos || includeBecauseAndroid;
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

type ExpoAppJson = {
  expo: {
    runtimeVersion?: string,
    version: string | undefined,
    ios?: {
      buildNumber?: string | undefined,
      runtimeVersion?: string | undefined,
    } | undefined,
    android?: {
      versionCode?: string | undefined,
      runtimeVersion?: string | undefined,
    } | undefined
  }
};

const deletePropsFromAppJson = [
  'web',
  'owner',
  'description',
  'privacy',
  'version',
  'githubUrl',
  'hooks',
  'runtimeVersion',
];

export const getModules = async (rootDir = '.') => {
  const dir = Path.join(rootDir, 'node_modules');

  try {
    const modules = await readdir(dir);

    // check that node_modules exists
    // run npm / yarn check

    const allModules = (await Promise.all(modules.map<Promise<Module[]>>(async (m) => {
      if (!m.startsWith('.')) {
        const path = Path.join(dir, m);
        if (m.startsWith('@')) {
          const submodules = await readdir(path);
          const allSubmodules = await Promise.all(submodules.map<Promise<Module>>(async (s) => {
            const pathToSubmodule = Path.join(dir, m, s);
            const { version, rnNativeHash } = await readPackageJson(pathToSubmodule);

            return {
              isNativeAndroid: await hasNativeVersion(Platform.android, path),
              isNativeIOS: await hasNativeVersion(Platform.ios, path),
              name: `${m}/${s}`,
              path: pathToSubmodule,
              version,
              rnNativeHash,
            };
          }));
          return allSubmodules;
        }
        const { version, rnNativeHash } = await readPackageJson(path);

        return [{
          isNativeAndroid: await hasNativeVersion(Platform.android, path),
          isNativeIOS: await hasNativeVersion(Platform.ios, path),
          name: m,
          path,
          version,
          rnNativeHash,
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

export const readExpoConfig = (rootDir = '.') => {
  const appJsonStr = execSync('npx expo config --json --full', { cwd: rootDir, encoding: 'utf-8', env: process.env });
  const appJson = JSON.parse(appJsonStr) as { exp: ExpoAppJson['expo'] };
  return appJson.exp;
};

const GENERATE_HASH_DEFAULTS: Required<GenerateHashOptions> = {
  rootDir: '.',
  skipNodeModules: false,
  verbose: false,
};

type GenerateHashOptions = {
  verbose?: boolean,
  rootDir?: string,
  skipNodeModules?: boolean,
};

const getAppJsonHash = (platform = Platform.all, rootDir = '.', verbose = false) => {
  let appJsonContent = '';

  try {
    const appJson = readExpoConfig(rootDir);

    deletePropsFromAppJson.forEach((prop) => {
      delete appJson[prop];
    });

    if (platform === Platform.ios) {
      delete appJson.android;
    } else {
      delete appJson.android?.versionCode;
      delete appJson.android?.runtimeVersion;
    }

    if (platform === Platform.android) {
      delete appJson.ios;
    } else {
      delete appJson.ios?.buildNumber;
      delete appJson.ios?.runtimeVersion;
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

export const getModulesForPlatform = async (platform = Platform.all, rootDir = '.') => {
  const allModules = await getModules(rootDir);

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
}: GenerateHashOptions = GENERATE_HASH_DEFAULTS) => {
  const localNativeFoldersHash = await getFolderHash(platform, rootDir, verbose);

  const appJsonContent = getAppJsonHash(platform, rootDir, verbose);

  const nativeModules = skipNodeModules ? [] : await getModulesForPlatform(platform, rootDir);

  const nativeModuleIdentities = nativeModules.map(getModuleIdentity(platform));
  if (verbose && !skipNodeModules) {
    console.log(`Found ${nativeModules.length} native modules (out of ${nativeModules.length} total modules)\n${nativeModuleIdentities.join('\n')}`);
  }
  const stringToHashFrom = `app.json@${appJsonContent};local@${localNativeFoldersHash};${nativeModuleIdentities.join(',')}`;

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
    console.log(`${bold('[rn-native-hash]')}\n${ios} (ios)\n${android} (android)\n${all} (all)`);
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
  }: {
    verbose: boolean;
    rootDir: string;
  },
) {
  if (verbose) { console.info(`getting depenency hash for native dependencies in: ${rootDir}`); }

  const { ios, android, all } = await generateHashes({ rootDir, verbose });

  let valueExists = false;
  let hasChanged = false;

  try {
    const expoConfig = readExpoConfig(rootDir);

    if (expoConfig.runtimeVersion && expoConfig.runtimeVersion !== all) {
      hasChanged = true;
      valueExists = true;
      console.warn(yellow(`Hash has changed (was ${expoConfig.runtimeVersion})`));
    }

    if (expoConfig.ios?.runtimeVersion && expoConfig.ios.runtimeVersion !== ios) {
      hasChanged = true;
      valueExists = true;
      console.warn(yellow(`Hash has changed (was ${expoConfig.ios.runtimeVersion})`));
    }

    if (expoConfig.android?.runtimeVersion
      && expoConfig.android.runtimeVersion !== android
    ) {
      hasChanged = true;
      valueExists = true;
      console.warn(yellow(`Hash has changed (was ${expoConfig.android.runtimeVersion})`));
    }
  } catch (e) {
    if (verbose) {
      console.error(e);
    }
  }

  return { valueExists, hasChanged };
}

export async function updateExpoApp(
  {
    rootDir,
    verbose,
  }: {
    rootDir: string;
    verbose: boolean;
  },
) {
  const { hasChanged, valueExists } = await verifyExpoApp({ rootDir, verbose });

  if (!hasChanged && valueExists) {
    console.log(green('Hash already up to date'));
    return;
  }

  const { ios, android, all } = await generateHashes({ rootDir, verbose });

  try {
    const fileStr = readFileSync(Path.join(rootDir, 'app.json'), 'utf8');
    const prevJson = JSON.parse(fileStr) as ExpoAppJson;

    prevJson.expo.runtimeVersion = all;
    prevJson.expo.ios = { ...prevJson.expo.ios, runtimeVersion: ios };
    prevJson.expo.android = { ...prevJson.expo.android, runtimeVersion: android };

    await writeFile(Path.join(rootDir, 'app.json'), `${JSON.stringify(prevJson, null, 2)}\n`);

    console.log(yellow('Hashes where updated'));
  } catch (e) {
    console.error(red('Failed to update app.json'), e);
  }
}

export async function verifyLibrary(
  {
    verbose,
    rootDir,
  }: {
    verbose: boolean;
    rootDir: string;
  },
) {
  if (verbose) { console.info(`getting depenency hash for native dependencies in: ${rootDir}`); }

  const { ios, android, all } = await generateHashes({ rootDir, verbose, skipNodeModules: true });

  let valueExists = false;
  let hasChanged = false;

  try {
    const packageJson = await readPackageJson(rootDir);

    if (packageJson.rnNativeHash?.all) {
      valueExists = true;
      if (packageJson.rnNativeHash?.all !== all) {
        console.warn(yellow(`Hash has changed (was ${packageJson.rnNativeHash.all})`));
        hasChanged = true;
      }
    }

    if (packageJson.rnNativeHash?.ios) {
      valueExists = true;
      if (packageJson.rnNativeHash.ios !== ios) {
        hasChanged = true;
        console.warn(yellow(`iOS hash has changed (was ${packageJson.rnNativeHash.ios})`));
      }
    }

    if (packageJson.rnNativeHash?.android) {
      valueExists = true;
      if (packageJson.rnNativeHash.android !== android) {
        hasChanged = true;
        console.warn(yellow(`Android hash has changed (was ${packageJson.rnNativeHash.android})`));
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

  const { ios, android, all } = await generateHashes({ rootDir, verbose, skipNodeModules: true });
  const prevJson = await readPackageJson(rootDir);

  prevJson.rnNativeHash = {
    ...prevJson.rnNativeHash,
    ios,
    android,
    all,
  };

  await writeFile(Path.join(rootDir, 'package.json'), `${JSON.stringify(prevJson, null, 2)}\n`);

  console.info(yellow('Hashes updated'));
}
