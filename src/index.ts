#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import yargs from 'yargs';
import { join } from 'path';
import {
  red, green, yellow, bold,
} from 'chalk';
import { hideBin } from 'yargs/helpers';

type Module = {
  name: string,
  path: string,
  version: string,
  isNative: boolean
};

const hasNativeVersion = async (path: string) => {
  const parts = await readdir(path);
  return parts.includes('ios') || parts.includes('android');
};

const getVersion = async (path: string) => {
  const pkg = await readFile(`${path}/package.json`, 'utf8');
  const pkgJson = JSON.parse(pkg) as { version: string };
  return pkgJson.version;
};

const getHashFromFile = async (filePath: string, verbose: boolean) => {
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

const getHashFromPackage = async (
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

const getCurrentHash = async (rootDir = '.', verbose: boolean, list = false, quiet = false) => {
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

    const nativeModules = allModules.filter((m) => m.isNative);
    const nativeModuleIdentities = nativeModules.map((m) => `${m.name}@${m.version}`).sort();
    if (list || verbose) {
      console.log(`Found ${nativeModules.length} native modules (${allModules.length} total):\n${nativeModuleIdentities.join('\n')}`);
    }
    const stringToHashFrom = nativeModuleIdentities.join(',');

    if (verbose) {
      console.log(`Generating hash from string: ${stringToHashFrom}`);
    }

    const hash = createHash('md5').update(stringToHashFrom).digest('hex');
    if (!quiet) {
      console.log(bold(`rn-native-hash: ${hash} (${nativeModules.length} native modules)`));
    }

    return hash;
  } catch (e) {
    console.log(red(`Have you installed your packages? "${dir}" does not seem like a valid node_modules folder (${e as string})`));
    return process.exit(1);
  }
};

const DEFAULT_FILE = '.rn-native-hashrc';
const DEFAULT_PACKAGE_JSON = 'package.json';
const DEFAULT_PACKAGE_JSON_PROPERTY = 'rn-native-hash';

function absoluteOrRelativePath(path: string) {
  return path.startsWith('/') ? path : join(process.cwd(), path);
}

function pathFromArg<T = Record<string, any>>(
  argv: T,
  params: string[],
  rootDir: string,
  defaultValue: string,
  alwaysGeneratePath = false,
): string | null {
  const paramWithValue = params.find((p) => argv[p]);
  const path = typeof paramWithValue === 'string'
    ? argv[paramWithValue] as unknown as string
    : !!params.find((p) => Object.keys(argv).includes(p));
  if (!path) {
    if (alwaysGeneratePath) {
      return join(rootDir, defaultValue);
    }
    return null;
  }
  return join(rootDir, typeof path === 'string' ? path : defaultValue);
}

void yargs(hideBin(process.argv))
  .command('verify [rootDir]', 'Check if hash has changed', (y) => y
    .positional('rootDir', {
      describe: 'root directory to check node_modules',
      default: '.',
    })
    .option('package-json-property', {
      type: 'string',
      default: DEFAULT_PACKAGE_JSON_PROPERTY,
      description: 'Property in package.json',
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      default: false,
      description: 'Run with verbose logging',
    })
    .option('file', {
      alias: 'f',
      type: 'string',
      default: DEFAULT_FILE,
      description: 'Read hash from file',
    })
    .option('package-json', {
      alias: 'p',
      type: 'string',
      default: DEFAULT_PACKAGE_JSON,
      description: 'Package.json',
    }), async (argv) => {
    const verbose = argv.verbose || argv.v as boolean || false;
    if (verbose) {
      console.log('verify', argv);
    }

    const rootDir = absoluteOrRelativePath(argv.rootDir);
    const filePath = pathFromArg(argv, ['file', 'f'], rootDir, DEFAULT_FILE);
    const packageJsonPath = pathFromArg(argv, ['package-json', 'p'], rootDir, DEFAULT_PACKAGE_JSON);
    if (verbose) console.info(`getting depenency hash for native dependencies in: ${rootDir}`);
    const hash = await getCurrentHash(rootDir, verbose, false);
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
      const prevHash = await getHashFromPackage(packageJsonPath, argv['package-json-property'], verbose);

      if (prevHash) {
        valueExists = true;
        if (prevHash !== hash) {
          hasChanged = true;
          console.log(red(`hash has changed in ${packageJsonPath}! (${prevHash})`));
        }
      }
    }

    if (!valueExists) {
      console.error(red('Use "rn-native-hash generate" to create a new hash. No previous hash found, looked in:'));
      console.error(`${filePath as string}\n${packageJsonPath as string}`);
      process.exit(1);
    } else if (hasChanged) {
      console.error(red('hash has changed'));
      process.exit(1);
    } else {
      console.log(green('hash has not changed'));
    }
  })
  .command('generate [rootDir]', 'Generate hash representing native dependencies', (y) => y
    .positional('rootDir', {
      describe: 'root directory to check node_modules',
      default: '.',
    })
    .option('package-json-property', {
      type: 'string',
      default: DEFAULT_PACKAGE_JSON_PROPERTY,
      description: 'Property in package.json',
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
    })
    .option('file', {
      alias: 'f',
      type: 'string',
      description: 'Write hash to file',
      defaultDescription: DEFAULT_FILE,
    })
    .option('eas', {
      alias: 'e',
      type: 'string',
      description: 'Write hash to eas.json',
      defaultDescription: DEFAULT_FILE,
    })
    .option('package-json', {
      alias: 'p',
      type: 'string',
      // defaultDescription: 'package.json',
      description: 'Write hash to package.json',
      defaultDescription: DEFAULT_PACKAGE_JSON,
    }), async (argv) => {
    const verbose = argv.verbose || argv.v as boolean || false;

    const rootDir = absoluteOrRelativePath(argv.rootDir);
    const packageJsonPath = pathFromArg(argv, ['package-json', 'p'], rootDir, DEFAULT_PACKAGE_JSON);
    const easJsonPath = pathFromArg(argv, ['eas', 'e'], rootDir, 'eas.json');
    const filePath = pathFromArg(argv, ['file', 'f'], rootDir, DEFAULT_FILE, !packageJsonPath && !easJsonPath);

    if (verbose) {
      console.log('generate', argv);
    }

    if (verbose) console.info(`getting depenency hash for native dependencies in: ${rootDir}`);
    const hash = await getCurrentHash(rootDir, verbose, false);

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
      const prevJson = JSON.parse(prev) as { version: string };
      console.info(`Updating "${easJsonPath}"`);
      Object.keys(prevJson[propName]).forEach((key) => {
        const prevReleaseChannel = (prevJson[propName][key] as { releaseChannel: string }).releaseChannel; // eslint-disable-line

        (prevJson[propName][key] as {releaseChannel: string}).releaseChannel = hash; // eslint-disable-line

        if (!prevReleaseChannel) {
          console.info(green(`Saving for profile ${key}`));
        } else if (prevReleaseChannel !== hash) {
          console.warn(yellow(`Updating for profile ${key} (was ${prevReleaseChannel})`));
        } else {
          console.warn(green(`Up to date; profile ${key}`));
        }
      });
      await writeFile(easJsonPath, `${JSON.stringify(prevJson, null, 2)}\n`);
    }
    if (packageJsonPath) {
      const propName = argv['package-json-property'];
      const prev = await readFile(packageJsonPath, 'utf8');
      const prevJson = JSON.parse(prev) as { version: string };
      if (!prevJson[propName]) {
        console.info(green(`Saving to "${packageJsonPath}"`));
        await writeFile(packageJsonPath, JSON.stringify({
          ...prevJson,
          [propName]: hash,
        }, null, 2));
      } else if (prevJson[propName] !== hash) {
        console.warn(yellow(`Updating "${packageJsonPath}" (was ${prevJson[propName] as string})`));
        await writeFile(packageJsonPath, JSON.stringify({
          ...prevJson,
          [propName]: hash,
        }, null, 2));
      } else {
        console.warn(green(`Up to date: "${packageJsonPath}"`));
      }
    }

    if (!packageJsonPath && !filePath && !easJsonPath) {
      console.log(yellow('Nothing saved, use --file or --package-json or --eas to specify where you want to save the hash'));
    }
  }).command('list [rootDir]', 'Lists all native dependencies', (y) => y
    .positional('rootDir', {
      describe: 'root directory to check node_modules',
      default: '.',
    }).option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
    }), async (argv) => {
    const verbose = argv.verbose || argv.v as boolean || false;

    const rootDir = absoluteOrRelativePath(argv.rootDir);

    if (verbose) {
      console.log('list', argv);
    }

    if (verbose) console.info(`getting depenency hash for native dependencies in: ${rootDir}`);
    const hash = await getCurrentHash(rootDir, verbose, true);
    process.stdout.write(hash);
  })
  .command('hash [rootDir]', 'Returns the hash for piping', (y) => y
    .positional('rootDir', {
      describe: 'root directory to check node_modules',
      default: '.',
    }).option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
    }), async (argv) => {
    const verbose = argv.verbose || argv.v as boolean || false;

    const rootDir = absoluteOrRelativePath(argv.rootDir);

    if (verbose) {
      console.log('rn-native-hash', argv);
    }

    if (verbose) console.info(`getting depenency hash for native dependencies in: ${rootDir}`);
    const hash = await getCurrentHash(rootDir, verbose, false, true);
    process.stdout.write(hash);
  })
  .recommendCommands()
  .demandCommand(1)
  .parse();
