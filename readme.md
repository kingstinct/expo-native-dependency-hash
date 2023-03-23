# expo-native-dependency-hash - Simplified native dependency tracking for React Native

[![expo-native-dependency-hash on NPM](https://img.shields.io/npm/v/expo-native-dependency-hash)](https://www.npmjs.com/package/expo-native-dependency-hash)

`expo-native-dependency-hash` strives to make it easier to keep track of when the native dependencies of a Expo (or React Native) project has changed. It does so by (1) detecting native modules in node_modules and (2) generating a hash based on those package names and versions. It provides these commands:
  - expo-app-verify [rootDir]  Check if hash has changed, good for CI and git hooks
  - expo-app-update [rootDir]  Update hash representing this apps native dependencies
  - library-verify [rootDir]   Check if hash has changed, fails if it has, good for CI and git hooks
  - library-update [rootDir]   Updates the hash based on the native files in the project
  - list [rootDir]             Lists all native dependency identities of an app
  - hash [rootDir]             Returns the hash for piping

Note: This was previously called `expo-native-dependency-hash`, but with the 2.0 release it was renamed to `expo-native-dependency-hash` to better reflect its purpose.

## Recipes

### Update your runtimeVersion automatically when native dependencies has changed
Run `expo-native-dependency-hash` on `postinstall` to always keep it up to date:
```json
{
    "scripts": {
        "postinstall": "expo-native-dependency-hash expo-app-update"
    }
}
```

This will automatically update your runtimeVersion in your `app.json`. So when native dependencies has changed in your project, you'll get a new runtimeVersion to easily target the right binary with your OTA updates.

### Verify that your runtimeVersion is up to date
Run `expo-native-dependency-hash expo-app-verify` in a CI or git hook to verify that your runtimeVersion is up to date. This will fail if it's not up to date.

### OTA updates / Expo release channels
Use one release channel per hash to get predictability in your OTA updates.

```bash
expo publish --release-channel `expo-native-dependency-hash hash`
```
or
```bash
expo publish --release-channel `cat .expo-native-dependency-hashrc`
```

### Generate a new Native Client when native dependencies has changed
Generate new native builds automatically when it's needed. 

A simple example of how it can be done with GitHub Actions and EAS Build:
```yml
      - name: Get Hash
        run: echo "HASH=`npx expo-native-dependency-hash hash`" >> $GITHUB_ENV

      # Check if there has exists a build for this native hash
      - name: Matching Native Builds
        run: echo "MATCHING_BUILDS=`npx eas-cli@latest build:list --status=finished | grep -c $HASH`" >> $GITHUB_ENV

      # Publish bundle if there is already a Native Build for this hash out there:
      - name: Expo Publish
        id: expo-publish
        if: ${{ env.MATCHING_BUILDS > 0 }}
        run: expo publish --release-channel=`expo-native-dependency-hash hash`

      # Build new Native Client if there are no
      - name: EAS Build
        id: eas-build
        if: ${{ env.MATCHING_BUILDS == 0 }}
        run: npx eas-cli@latest build --platform all --non-interactive --no-wait
```
* There are obviously edge cases in this simple implementation; we could check per platform and for builds that are in progress so we don't build duplicates etc..

This example works best when running `expo-native-dependency-hash generate -e` on postinstall - since that will keep the releaseChannels updated in `eas.json`.

## How we detect Native Modules
We detect native modules by looking for `ios` and/or `android` folders in each package. Please post an issue (PRs are welcome :) for any false positives/negatives you might find! To see whether everything looks right you can use `expo-native-dependency-hash list` for a full list of libraries that we detect as being native.

If there is an `app.json` (as used by Expo) present its contents will also be included in the generated hash. By default web and versionCode/buildNumber is ignored. versionCode/buildNumber can be included with --includeBuildNumber flag.

If you're using Expo Bare Workflow or React Native without Expo please note that native changes internal to your project will currently not be reflected in the hash (only native dependencies).