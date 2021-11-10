# rn-native-hash - Simplified native dependency tracking for React Native

[![rn-native-hash on NPM](https://img.shields.io/npm/v/rn-native-hash)](https://www.npmjs.com/package/rn-native-hash)

`rn-native-hash` strives to make it easier to keep track of when the native dependencies of a React Native (or Expo) project has changed. It does so by (1) detecting native modules in node_modules and (2) generating a hash based on those package names and versions. It provides three commands:
- generate - Generates a hash and by default saves it in `.rn-native-hashrc`. Can optionally save it in package.json (with -p) or update releaseChannels for eas builds (with -e).
- verify - Checks whether the hash has changed compared to `.rn-native-hashrc` or package.json.
- list - Lists all native dependencies and the resulting hash
- hash - Just returns the hash for easy piping

## Recipes

### Keep up to date
Run `rn-native-hash` on `postinstall` to always keep it up to date:
```json
{
    "scripts": {
        "postinstall": "rn-native-hash generate"
    }
}
```

### OTA updates / Expo release channels
Use one release channel per hash to get predictability in your OTA updates.

```bash
expo publish --release-channel `rn-native-hash hash`
```
or
```bash
expo publish --release-channel `cat .rn-native-hashrc`
```

### Generate a new Native Client when native dependencies has changed
Generate new native builds automatically when it's needed. 

A simple example of how it can be done with GitHub Actions and EAS Build:
```yml
      - name: Get Hash
        run: echo "HASH=`npx rn-native-hash hash`" >> $GITHUB_ENV

      # Check if there has exists a build for this native hash
      - name: Matching Native Builds
        run: echo "MATCHING_BUILDS=`npx eas-cli@latest build:list --status=finished | grep -c $HASH`" >> $GITHUB_ENV

      # Publish bundle if there is already a Native Build for this hash out there:
      - name: Expo Publish
        id: expo-publish
        if: ${{ env.MATCHING_BUILDS > 0 }}
        run: expo publish --release-channel=`rn-native-hash hash`

      # Build new Native Client if there are no
      - name: EAS Build
        id: eas-build
        if: ${{ env.MATCHING_BUILDS == 0 }}
        run: npx eas-cli@latest build --platform all --non-interactive --no-wait
```
* There are obviously edge cases in this simple implementation; we could check per platform and for builds that are in progress so we don't build duplicates etc..

This example works best when running `rn-native-hash generate -e` on postinstall - since that will keep the releaseChannels updated in `eas.json`.

## How we detect Native Modules
We detect native modules by looking for `ios` and/or `android` folders in each package. Please post an issue (PRs are welcome :) for any false positives/negatives you might find! To see whether everything looks right you can use `rn-native-hash list` for a full list of libraries that we detect as being native.