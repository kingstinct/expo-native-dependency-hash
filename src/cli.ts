#!/usr/bin/env node

import yargs from 'yargs';

import { hideBin } from 'yargs/helpers';
import { join } from 'path';
import {
  red, green,
} from 'chalk';
import {
  updateExpoApp, getCurrentHash,
  getModuleIdentity, verifyExpoApp, Platform,
  updateLibrary, verifyLibrary, getModulesForPlatform, isGitDirty,
} from '.';

function absoluteOrRelativePath(path: string) {
  return path.startsWith('/') ? path : join(process.cwd(), path);
}

const throwIfGitDirty = () => {
  if (isGitDirty('.')) {
    console.error(red('[rn-native-hash] Git working copy is dirty. Please commit or stash your changes before running this command.'));
    process.exit(1);
  }
};
// function pathFromArg<T extends Record<string, any> = Record<string, any>>(
//   argv: T,
//   params: string[],
//   rootDir: string,
//   defaultValue: string,
//   alwaysGeneratePath = false,
// ): string | null {
//   const paramWithValue = params.find((p) => argv[p]);
//   const path = typeof paramWithValue === 'string'
//     ? argv[paramWithValue] as unknown as string
//     : !!params.find((p) => Object.keys(argv).includes(p));
//   if (!path) {
//     if (alwaysGeneratePath) {
//       return join(rootDir, defaultValue);
//     }
//     return null;
//   }
//   return join(rootDir, typeof path === 'string' ? path : defaultValue);
// }

void yargs(hideBin(process.argv))
  .command(
    'verify-expo-app [rootDir]',
    'Check if hash has changed',
    (y) => y
      .positional('rootDir', {
        describe: 'root directory of the app or library',
        default: '.',
      })
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        default: false,
        description: 'Run with verbose logging',
      }),
    async (argv) => {
      const verbose = argv.verbose || argv.v as boolean || false;

      throwIfGitDirty();

      if (verbose) {
        console.log('verify', argv);
      }

      const rootDir = absoluteOrRelativePath(argv.rootDir);

      const { hasChanged, valueExists } = await verifyExpoApp(
        {
          verbose,
          rootDir,
        },
      );

      if (!valueExists) {
        console.error(red('[rn-native-hash] No previous hash found, looked in Expo Config. Use "rn-native-hash generate" to create a new hash.'));
        process.exit(1);
      } else if (hasChanged) {
        console.error(red('[rn-native-hash] hash has changed'));
        process.exit(1);
      } else {
        console.log(green('[rn-native-hash] Hash up to date'));
      }
    },
  )
  .command(
    'verify-library [rootDir]',
    'Check if hash has changed',
    (y) => y
      .positional('rootDir', {
        describe: 'root directory of the app or library',
        default: '.',
      })
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        default: false,
        description: 'Run with verbose logging',
      }),
    async (argv) => {
      const verbose = argv.verbose || argv.v as boolean || false;

      throwIfGitDirty();

      if (verbose) {
        console.log('verify', argv);
      }

      const rootDir = absoluteOrRelativePath(argv.rootDir);

      const { hasChanged, valueExists } = await verifyLibrary(
        {
          verbose,
          rootDir,
        },
      );

      if (!valueExists) {
        console.error(red('[rn-native-hash] No previous hash found, looked in package.json. Use "rn-native-hash update-library" to create a new hash'));
        process.exit(1);
      } else if (hasChanged) {
        console.error(red('[rn-native-hash] Hash has changed'));
        process.exit(1);
      } else {
        console.log(green('[rn-native-hash] Hash up to date'));
      }
    },
  )
  .command('update-expo-app [rootDir]', 'Generate hash representing native dependencies', (y) => y
    .positional('rootDir', {
      describe: 'root directory of the app or library',
      default: '.',
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
    }), async (argv) => {
    const verbose = argv.verbose || argv.v as boolean || false;

    throwIfGitDirty();

    const rootDir = absoluteOrRelativePath(argv.rootDir);

    if (verbose) {
      console.log('generate', argv);
    }

    if (verbose) console.info(`getting depenency hash for native dependencies in: ${rootDir}`);
    await updateExpoApp(
      {
        rootDir,
        verbose,
      },
    );
  })
  .command('list [rootDir]', 'Lists all native dependencies', (y) => y
    .positional('rootDir', {
      describe: 'root directory of the app or library',
      default: '.',
    })
    .option('platform', {
      alias: 'p',
      type: 'string',
      description: 'ios, android or all',
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
    }), async (argv) => {
    const verbose = argv.verbose || argv.v as boolean || false;
    const platform = argv.platform as Platform || argv.p as Platform || Platform.all;

    throwIfGitDirty();

    const rootDir = absoluteOrRelativePath(argv.rootDir);

    if (verbose) {
      console.log('list', argv);
    }

    if (verbose) console.info(`getting depenency hash for native dependencies in: ${rootDir}`);

    const allModules = await getModulesForPlatform(platform, rootDir);

    const nativeModuleIdentities = allModules.map(getModuleIdentity(platform));

    process.stdout.write(`${nativeModuleIdentities.join('\n')}`);
  })
  .command('hash [rootDir]', 'Returns the hash for piping', (y) => y
    .positional('rootDir', {
      describe: 'root directory of the app or library',
      default: '.',
    })
    .option('platform', {
      alias: 'p',
      type: 'string',
      description: 'ios, android or all',
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
    })
    .option('skipNodeModules', {
      type: 'boolean',
      default: false,
      description: 'Skip including node_modules, useful for libraries',
    }), async (argv) => {
    const verbose = argv.verbose || argv.v as boolean || false;
    const skipNodeModules = argv.skipNodeModules || false;
    const platform = argv.platform as Platform || argv.p as Platform || Platform.all;

    throwIfGitDirty();

    const rootDir = absoluteOrRelativePath(argv.rootDir);

    if (verbose) {
      console.log('rn-native-hash', argv);
    }

    if (verbose) console.info(`getting depenency hash for native dependencies in: ${rootDir}`);
    const hash = await getCurrentHash(platform, {
      rootDir,
      verbose,
      skipNodeModules,
    });
    process.stdout.write(hash);
  })
  .command('update-library [rootDir]', 'Returns the hash based on the native files', (y) => y
    .positional('rootDir', {
      describe: 'root directory of the app or library',
      default: '.',
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
    }), async (argv) => {
    const verbose = argv.verbose || argv.v as boolean || false;

    throwIfGitDirty();

    const rootDir = absoluteOrRelativePath(argv.rootDir);

    if (verbose) {
      console.log('generate', argv);
    }

    if (verbose) console.info(`getting depenency hash for native dependencies in: ${rootDir}`);

    await updateLibrary(
      {
        rootDir,
        verbose,
      },
    );
  })
  .recommendCommands()
  .demandCommand(1)
  .parse();
