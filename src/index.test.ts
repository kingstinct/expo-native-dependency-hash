/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import {
  getCurrentHash, getModules, getVersion, hasNativeVersion,
} from '.';

describe('Tests', () => {
  test('hasNativeVersion true', async () => {
    const isNative = await hasNativeVersion('src/testdata/node_modules/native-module');

    expect(isNative).toBe(true);
  });

  test('hasNativeVersion false', async () => {
    const isNative = await hasNativeVersion('src/testdata/node_modules/js-module');

    expect(isNative).toBe(false);
  });

  test('getModules', async () => {
    const modules = await getModules('src/testdata');

    expect(modules).toEqual([
      {
        isNative: false,
        name: 'js-module',
        path: 'src/testdata/node_modules/js-module',
        version: '0.0.1',
      },
      {
        isNative: true,
        name: 'native-module',
        path: 'src/testdata/node_modules/native-module',
        version: '0.0.2',
      },
    ]);
  });

  test('getCurrentHash', async () => {
    const hash = await getCurrentHash('src/testdata', true);

    expect(hash).toEqual('178d91aad745d683fb26482eafd0570c');
  });

  test('different getCurrentHash when including build numbers', async () => {
    const hash = await getCurrentHash('src/testdata', true, true);

    expect(hash).toEqual('2e48fc92e948e3228f23133295a2a118');
  });

  test('getVersion', async () => {
    const jsModuleVersion = await getVersion('src/testdata/node_modules/js-module');
    const nativeModuleVersion = await getVersion('src/testdata/node_modules/native-module');

    expect(jsModuleVersion).toEqual('0.0.1');
    expect(nativeModuleVersion).toEqual('0.0.2');
  });
});
