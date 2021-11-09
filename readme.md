# rn-native-hash - Simplified native dependency tracking for React Native

[![rn-native-hash on NPM](https://img.shields.io/npm/v/rn-native-hash)](https://www.npmjs.com/package/rn-native-hash)

`rn-native-hash` strives to make it easier to keep track of when the native dependencies of a React Native (or Expo) project has changed. It does so by (1) detecting native modules in node_modules and (2) generating a hash based on those package names and versions. It provides three commands:
- generate - Generates a hash and by default saves it in `.rn-native-hashrc`. Can optionally save it in package.json.
- verify - Checks whether the hash has changed compared to `.rn-native-hashrc` or package.json.
- list - Lists all native dependencies and the resulting hash

## Recipes

### Keep up to date by running it on postinstall
Run `rn-native-hash` on `postinstall` to always keep it up to date.
```json
{
    // ...
    "scripts": {
        // ...
        "postinstall": "rn-native-hash generate"
    }
}
```

### OTA updates / Expo release channels
Use one release channel per hash to get predictability in your OTA updates.

### Generate a new Native Client when native dependencies has changed
Generate new native builds automatically when it's needed!

## Native Module Detection
We detect native modules by looking for `ios` and/or `android` folders in each package. Please post an issue (PRs are welcome :) for any false positives/negatives you might find!