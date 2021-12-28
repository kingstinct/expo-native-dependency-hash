#!/usr/bin/env node

import yargs from 'yargs';

import {
  bold,
} from 'chalk';
import { hideBin } from 'yargs/helpers';
import { join } from 'path';
import {
  generate, getCurrentHash, getModuleIdentity, getModules, verify,
} from '.';

const DEFAULT_FILE = '.rn-native-hashrc';
const DEFAULT_PACKAGE_JSON = 'package.json';
const DEFAULT_PACKAGE_JSON_PROPERTY = 'rn-native-hash';
const DEFAULT_EAS_JSON_PATH = 'eas.json';

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
    .option('includeBuildNumbers', {
      type: 'boolean',
      description: 'Include buildNumber/versionCode in the hash',
    })
    .option('eas', {
      alias: 'e',
      type: 'string',
      description: 'Verify releaseChannel equals hash in eas.json',
      default: DEFAULT_EAS_JSON_PATH,
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
    const easJsonPath = pathFromArg(argv, ['eas', 'e'], rootDir, DEFAULT_EAS_JSON_PATH);
    const packageJsonPath = pathFromArg(argv, ['package-json', 'p'], rootDir, DEFAULT_PACKAGE_JSON);
    const packageJsonProp = argv['package-json-property'];

    await verify(
      {
        verbose,
        rootDir,
        filePath,
        packageJsonPath,
        easJsonPath,
        packageJsonProp,
        includeBuildNumbers: !!argv.includeBuildNumbers,
      },
    );
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
    .option('includeBuildNumbers', {
      type: 'boolean',
      description: 'Include buildNumber/versionCode in the hash',
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
      description: 'Write hash as releaseChannel to eas.json',
      defaultDescription: DEFAULT_EAS_JSON_PATH,
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
    const easJsonPath = pathFromArg(argv, ['eas', 'e'], rootDir, DEFAULT_EAS_JSON_PATH);
    const filePath = pathFromArg(argv, ['file', 'f'], rootDir, DEFAULT_FILE, !packageJsonPath && !easJsonPath);
    const packageJsonProperty = argv['package-json-property'];

    if (verbose) {
      console.log('generate', argv);
    }

    if (verbose) console.info(`getting depenency hash for native dependencies in: ${rootDir}`);
    await generate(
      {
        rootDir,
        verbose,
        filePath,
        easJsonPath,
        packageJsonPath,
        packageJsonProperty,
        includeBuildNumbers: !!argv.includeBuildNumbers,
      },
    );
  }).command('list [rootDir]', 'Lists all native dependencies', (y) => y
    .positional('rootDir', {
      describe: 'root directory to check node_modules',
      default: '.',
    })
    .option('includeBuildNumbers', {
      type: 'boolean',
      description: 'Include buildNumber/versionCode in the hash',
    })
    .option('verbose', {
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
    const hash = await getCurrentHash(rootDir, verbose, argv.includeBuildNumbers);
    console.log(bold(`rn-native-hash: ${hash}`));
    const allModules = await getModules(rootDir);
    const nativeModules = allModules.filter((m) => m.isNative);
    const nativeModuleIdentities = nativeModules.map(getModuleIdentity);
    if (verbose) {
      console.log(`Found ${nativeModules.length} native modules (${allModules.length} total):\n${nativeModuleIdentities.join('\n')}`);
    }
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
    const hash = await getCurrentHash(rootDir, verbose, argv.includeBuildNumbers);
    process.stdout.write(hash);
  })
  .recommendCommands()
  .demandCommand(1)
  .parse();
