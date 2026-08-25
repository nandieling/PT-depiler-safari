# PT-Depiler Safari Edition

This branch adds a Safari build target while keeping the Chrome and Firefox targets intact. The Safari target reuses the Firefox-style unified background page because Safari does not implement Chrome's `offscreen` API.

## Requirements

- macOS with Safari
- Xcode and the Xcode command line tools
- Node.js and pnpm versions accepted by `package.json`

## Build and run

```bash
pnpm install --frozen-lockfile
pnpm build:safari-app
open safari-project/PT-Depiler/PT-Depiler.xcodeproj
```

The command builds the web extension, syncs it into the checked-in macOS Safari Web Extension template, and performs an unsigned Xcode build. In Xcode, select a Development Team for both targets and run the `PT-Depiler` scheme. Then enable PT-Depiler in Safari's extension settings and grant access to the required websites.

Use a different bundle identifier when needed:

```bash
SAFARI_BUNDLE_ID=com.example.ptdepiler pnpm build:safari-project
```

The generated project targets macOS 13 by default. Override it with `SAFARI_DEPLOYMENT_TARGET` when required.

The Safari manifest intentionally keeps several upstream declarations that Safari ignores. Current Apple converter versions fail to parse the reduced manifest, while accepting the upstream-compatible manifest and reporting `omnibox`, `downloads`, `open_in_tab`, and `notifications` as warnings. Runtime guards and fallbacks prevent those APIs from being called on Safari.

## Update from the official project

The local `safari` branch starts from the official `master` history. Commit Safari-specific changes before updating, then run:

```bash
pnpm update:upstream
pnpm check
pnpm build:safari-app
```

The update script fetches and merges `origin/master`. If upstream changes overlap the Safari compatibility layer, Git stops with an explicit conflict so the adaptation can be reviewed.

## Safari platform differences

- Safari does not expose the Chrome `downloads` extension API. Local torrent downloads fall back to fetching the torrent in the background page and saving the resulting Blob.
- Safari does not expose the Chrome `notifications` extension API. Context-menu completion messages are written to the extension console.
- Safari does not support the WebExtension `omnibox` key, so the `ptd` address-bar keyword is unavailable. Search remains available from the PT-Depiler interface and context menus.
- The existing CLI native messaging bridge targets Chrome/Firefox native-host registration and is hidden in Safari builds. A Safari app-extension bridge would require a separate native protocol implementation.

All site definitions, search logic, downloader integrations, backup providers, content scripts, storage, cookies, alarms, and the options application use the upstream implementation.
