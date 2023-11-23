#!/usr/bin/env node

import yargs from 'yargs';

import { hideBin } from 'yargs/helpers';
import { join } from 'path';
import {
  red, green,
} from 'chalk';
import {
  getCurrentHash,
  getModuleIdentity,
  getModulesForPlatform,
  isGitDirty,
  Platform,
  updateExpoApp,
  updateLibrary,
  verifyExpoApp,
  verifyLibrary,
} from '.';

function absoluteOrRelativePath(path: string) {
  return path.startsWith('/') ? path : join(process.cwd(), path);
}

const throwIfGitDirty = async () => {
  if (await isGitDirty('.')) {
    console.error(red('[expo-native-dependency-hash] Git working copy is dirty. Please commit or stash your changes before running this command.'));
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
    'expo-app-verify [rootDir]',
    'Check if hash has changed, good for CI and git hooks',
    (y) => y
      .positional('rootDir', {
        describe: 'root directory of the app or library',
        default: '.',
      })
      .option('includeAppJson', {
        describe: 'include app.json in the hash',
        default: false,
      })
      .option('includeLocalNativeFolders', {
        describe: 'include iOS/Android contents in the hash',
        default: false,
      })
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        default: false,
        description: 'Run with verbose logging',
      }),
    async (argv) => {
      const verbose = argv.verbose || argv.v as boolean || false;

      if (verbose) {
        console.log('verify', argv);
      }

      const rootDir = absoluteOrRelativePath(argv.rootDir);

      const { hasChanged, valueExists } = await verifyExpoApp(
        {
          verbose,
          rootDir,
          includeAppJson: argv.includeAppJson,
          includeLocalNativeFolders: argv.includeLocalNativeFolders,
        },
      );

      if (!valueExists) {
        console.error(red('[expo-native-dependency-hash] No previous hash found, looked in Expo Config. Use "expo-native-dependency-hash expo-app-update" to create a new hash.'));
        process.exit(1);
      } else if (hasChanged) {
        console.error(red('[expo-native-dependency-hash] hash has changed'));
        process.exit(1);
      } else {
        console.log(green('[expo-native-dependency-hash] Hash up to date'));
      }
    },
  )
  .command(
    'expo-app-update [rootDir]',
    'Update hash representing this apps native dependencies',
    (y) => y
      .positional('rootDir', {
        describe: 'root directory of the app or library',
        default: '.',
      })
      .option('includeAppJson', {
        describe: 'include app.json in the hash',
        default: false,
      })
      .option('includeLocalNativeFolders', {
        describe: 'include iOS/Android contents in the hash',
        default: false,
      })
      .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Run with verbose logging',
      }),
    async (argv) => {
      const verbose = (argv.verbose || argv.v as boolean) ?? false;

      const rootDir = absoluteOrRelativePath(argv.rootDir);

      if (verbose) {
        console.log('generate', argv);
      }

      if (verbose) console.info(`getting dependency hash for native dependencies in: ${rootDir}`);
      await updateExpoApp(
        {
          rootDir,
          verbose,
          includeAppJson: argv.includeAppJson,
          includeLocalNativeFolders: argv.includeLocalNativeFolders,
        },
      );
    },
  )
  .command(
    'library-verify [rootDir]',
    'Check if hash has changed, fails if it has, good for CI and git hooks',
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
      })
      .option('force', {
        type: 'boolean',
        description: 'Ignore if git is dirty',
        default: false,
      }),
    async (argv) => {
      const verbose = argv.verbose || argv.v as boolean || false;

      const { force } = argv;

      if (!force) {
        await throwIfGitDirty();
      }

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
        console.error(red('[expo-native-dependency-hash] No previous hash found, looked in package.json. Use "expo-native-dependency-hash update-library" to create a new hash'));
        process.exit(1);
      } else if (hasChanged) {
        console.error(red('[expo-native-dependency-hash] Hash has changed'));
        process.exit(1);
      } else {
        console.log(green('[expo-native-dependency-hash] Hash up to date'));
      }
    },
  )
  .command('library-update [rootDir]', 'Updates the hash based on the native files in the project', (y) => y
    .positional('rootDir', {
      describe: 'root directory of the app or library',
      default: '.',
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
    })
    .option('force', {
      type: 'boolean',
      description: 'Ignore if git is dirty',
      default: false,
    }), async (argv) => {
    const verbose = argv.verbose || argv.v as boolean || false;
    const { force } = argv;

    if (!force) {
      await throwIfGitDirty();
    }

    const rootDir = absoluteOrRelativePath(argv.rootDir);

    if (verbose) {
      console.log('generate', argv);
    }

    if (verbose) console.info(`getting dependency hash for native dependencies in: ${rootDir}`);

    await updateLibrary(
      {
        rootDir,
        verbose,
      },
    );
  })
  .command('list [rootDir]', 'Lists all native dependency identities of an app', (y) => y
    .positional('rootDir', {
      describe: 'root directory of the app or library',
      default: '.',
    })
    .option('platform', {
      alias: 'p',
      type: 'string',
      description: 'ios, android or all',
    })
    .option('nodeModulePaths', {
      type: 'array',
      string: true,
      default: ['node_modules'],
      description: 'Custom path(s) to node_modules, common for monorepos',
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Run with verbose logging',
    }), async (argv) => {
    const verbose = argv.verbose || argv.v as boolean || false;
    const platform = argv.platform as Platform || argv.p as Platform || Platform.all;
    const nodeModulePaths = argv.nodeModulePaths ?? ['node_modules'];

    const rootDir = absoluteOrRelativePath(argv.rootDir);

    if (verbose) {
      console.log('list', argv);
    }

    if (verbose) console.info(`getting dependency hash for ${platform} native dependencies in: ${rootDir}`);

    const allModules = await getModulesForPlatform(platform, rootDir, verbose, nodeModulePaths);

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
    })
    .option('nodeModulePaths', {
      type: 'array',
      string: true,
      default: ['node_modules'],
      description: 'Custom path(s) to node_modules, common for monorepos',
    })
    .option('includeAppJson', {
      describe: 'include app.json in the hash',
      default: false,
    })
    .option('includeLocalNativeFolders', {
      describe: 'include iOS/Android contents in the hash',
      default: false,
    })
    .option('force', {
      type: 'boolean',
      description: 'Ignore if git is dirty',
      default: false,
    }), async (argv) => {
    const verbose = argv.verbose || argv.v as boolean || false;
    const skipNodeModules = argv.skipNodeModules || false;
    const platform = argv.platform as Platform || argv.p as Platform || Platform.all;
    const includeAppJson = argv.includeAppJson ?? false;
    const nodeModulePaths = argv.nodeModulePaths ?? ['node_modules'];
    const includeLocalNativeFolders = argv.includeLocalNativeFolders ?? false;

    const { force } = argv;

    const rootDir = absoluteOrRelativePath(argv.rootDir);

    if (verbose) {
      console.log('expo-native-dependency-hash', argv);
    }

    if (verbose) console.info(`getting dependency hash for ${platform} native dependencies in: ${rootDir}`);
    const hash = await getCurrentHash(platform, {
      rootDir,
      verbose,
      skipNodeModules,
      skipAppJson: !includeAppJson,
      skipLocalNativeFolders: !includeLocalNativeFolders,
    });
    process.stdout.write(hash);
  })
  .recommendCommands()
  .demandCommand(1)
  .parse();
