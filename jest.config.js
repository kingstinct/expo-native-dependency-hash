// eslint-disable-next-line no-undef
module.exports = {
  preset: 'ts-jest',
  // testEnvironment: 'node',
  // setupFilesAfterEnv: ['./jest.setup.ts'],
  rootDir: 'src',
  maxWorkers: '50%',
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|react-clone-referenced-element|@bugsnag|@react-native-community|localforage-expo-filesystem-driver|victory-.*|victory-shared-events|victory-area|victory-bar|victory-native|victory-core|@react-native-seoul|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-module|js-module|jest-runner|@react-native/normalize-color|native-base|@react-native/polyfills|@sentry/.*)',
  ],
};
