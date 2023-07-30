/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import path = require('path');
import {
  getCurrentHash, getModules, readPackageJson,
  hasNativeVersion, Platform, isGitDirty, Module, verifyLibrary,
} from '.';

describe('Tests', () => {
  test('hasNativeVersion true', async () => {
    const isNative = await hasNativeVersion(Platform.all, 'src/testdata/node_modules/native-module');

    expect(isNative).toBe(true);
  });

  test('hasNativeVersion false', async () => {
    const isNative = await hasNativeVersion(Platform.all, 'src/testdata/node_modules/js-module');

    expect(isNative).toBe(false);
  });

  test('getModules', async () => {
    const modules = await getModules('src/testdata', false);

    expect(modules).toEqual<Module[]>([
      {
        isNativeAndroid: true,
        isNativeIOS: false,
        name: 'android-module',
        nativeDependencyHash: undefined,
        path: 'src/testdata/node_modules/android-module',
        version: '0.0.2',
      },
      {
        isNativeAndroid: true,
        isNativeIOS: false,
        name: 'android-module-with-hash',
        nativeDependencyHash: {
          ios: 'e399fe1305eb2b7a64ea3cb69d92a1f4',
          android: '636f80339c58196c102ec0f4c9878503',
          all: '636f80339c58196c102ec0f4c9878503',
        },
        path: 'src/testdata/node_modules/android-module-with-hash',
        version: '0.0.2',
      },
      {
        isNativeAndroid: false,
        isNativeIOS: true,
        name: 'ios-module',
        nativeDependencyHash: undefined,
        path: 'src/testdata/node_modules/ios-module',
        version: '0.0.2',
      },
      {
        isNativeAndroid: false,
        isNativeIOS: true,
        name: 'ios-module-with-hash',
        nativeDependencyHash: {
          ios: '254a83c80ebe4c7b42bf7f5538813fd5',
          android: '4902279e6de69269eeff55b28c60c181',
          all: '254a83c80ebe4c7b42bf7f5538813fd5',
        },
        path: 'src/testdata/node_modules/ios-module-with-hash',
        version: '0.0.2',
      },
      {
        isNativeAndroid: false,
        isNativeIOS: false,
        name: 'js-module',
        nativeDependencyHash: undefined,
        path: 'src/testdata/node_modules/js-module',
        version: '0.0.1',
      },
      {
        isNativeAndroid: true,
        isNativeIOS: true,
        name: 'native-module',
        nativeDependencyHash: undefined,
        path: 'src/testdata/node_modules/native-module',
        version: '0.0.2',
      },
      {
        isNativeAndroid: true,
        isNativeIOS: true,
        name: 'native-module-with-faulty-hash',
        nativeDependencyHash: {
          ios: 'b602b7db4cb330f39604db57665831a7',
          android: '2ab9cc96e1bcd729221e3b4640112a1e',
          all: '410849fa982d56aa0a1bae9e68a67d1a',
        },
        path: 'src/testdata/node_modules/native-module-with-faulty-hash',
        version: '0.0.2',
      },
      {
        isNativeAndroid: true,
        isNativeIOS: true,
        name: 'native-module-with-hash',
        nativeDependencyHash: {
          ios: 'de10c7cf9f9a6820a2aff4572324f151',
          android: '55a519c798b64c1e583c0ae462deff8b',
          all: 'b46cd834ab7312dfb6534b17d2b65763',
        },
        path: 'src/testdata/node_modules/native-module-with-hash',
        version: '0.0.2',
      },
    ]);
  });

  test('isGitDirty', async () => {
    const isIt = await isGitDirty('.');
    expect(isIt).toBe(false);
  });

  test('getCurrentHash', async () => {
    const hash = await getCurrentHash(Platform.all, { rootDir: path.join(__dirname, 'testdata'), verbose: true, skipLocalNativeFolders: false });

    expect(hash).toEqual('b98c0e5d9ff15b1ca98d7aa3d09ebe39');
  });

  test('verifyLibrary true', async () => {
    const { hasChanged, valueExists } = await verifyLibrary({ rootDir: `${__dirname}/testdata/node_modules/android-module-with-hash`, verbose: true });

    expect(hasChanged).toBe(false);
    expect(valueExists).toBe(true);
  }, 10000);

  test('verifyLibrary without hash', async () => {
    const { hasChanged, valueExists } = await verifyLibrary({ rootDir: `${__dirname}/testdata/node_modules/android-module`, verbose: true });

    expect(hasChanged).toBe(false);
    expect(valueExists).toBe(false);
  }, 10000);

  test('verifyLibrary with faulty hash', async () => {
    const { hasChanged, valueExists } = await verifyLibrary({ rootDir: `${__dirname}/testdata/node_modules/native-module-with-faulty-hash`, verbose: true });

    expect(hasChanged).toBe(true);
    expect(valueExists).toBe(true);
  }, 10000);

  test('readPackageJson', async () => {
    const jsModuleVersion = await readPackageJson('src/testdata/node_modules/js-module');
    const nativeModuleVersion = await readPackageJson('src/testdata/node_modules/native-module');

    expect(jsModuleVersion.version).toEqual('0.0.1');
    expect(jsModuleVersion.nativeDependencyHash).toEqual(undefined);
    expect(nativeModuleVersion.version).toEqual('0.0.2');
    expect(nativeModuleVersion.nativeDependencyHash).toEqual(undefined);
  }, 10000);

  /* test('readExpoConfig', () => {
    const jsModuleVersion = readExpoConfig('src/testdata/node_modules/js-module');
    const nativeModuleVersion = readExpoConfig('src/testdata/node_modules/native-module');

    expect(jsModuleVersion.version).toEqual('0.0.1');
    expect(nativeModuleVersion.version).toEqual('0.0.2');
  }); */
});
