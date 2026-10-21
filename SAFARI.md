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

The release version lives in `version` in `package.json`. `pnpm build:safari-app` writes it into the web extension manifest and into `MARKETING_VERSION` of the generated Xcode project, so that single field is the only thing to bump for a release; upstream's own version is not used. The options UI footer shows this version next to `upstream <sha>`, which is the upstream commit recorded in `.upstream-synced`.

Use a different bundle identifier when needed:

```bash
SAFARI_BUNDLE_ID=com.example.ptdepiler pnpm build:safari-project
```

The generated project targets macOS 13 by default. Override it with `SAFARI_DEPLOYMENT_TARGET` when required.

The Safari manifest intentionally keeps several upstream declarations that Safari ignores. Current Apple converter versions fail to parse the reduced manifest, while accepting the upstream-compatible manifest and reporting `omnibox`, `downloads`, `open_in_tab`, and `notifications` as warnings. Runtime guards and fallbacks prevent those APIs from being called on Safari.

## Update from the official project

This branch carries one squashed snapshot of the official repository plus the Safari layer, so it shares no history with upstream. The last imported upstream commit is recorded in `.upstream-synced`, and `pnpm update:upstream` replays everything after it as a three-way patch:

```bash
pnpm update:upstream              # upstream/master -> .upstream-synced, applied with git apply --3way
pnpm install --no-frozen-lockfile
pnpm check
pnpm build:dist-safari
pnpm build:safari-app
```

The script takes the upstream `package.json` as-is and then re-applies this repository's own `version` and Safari scripts through `scripts/sync-package-json.mjs`, so the version difference never turns into a conflict. Files that upstream changed and the Safari layer also touches come out with conflict markers, and the script lists them as `conflicted-file: <path>` and exits with status 1; resolve them, then re-run. `.upstream-synced` only moves forward when everything merged cleanly. The synced paths are `src`, `public`, `vite`, `vite.config.ts`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `patches` and `.dsh`, so the Safari/Xcode project files in this repository are never touched. Upstream tags are neither fetched nor pushed. The script works in a shallow CI clone too: it fetches just the two upstream commits it needs by SHA.

Upstream expects Firefox to use `background.page` (`src/entries/background/firefox_main.html`). Safari's MV3 accepts only `background.scripts`, so the Safari manifest points at `src/entries/background/safari_main.ts`, which mirrors that HTML entry.

### Automation

`.github/workflows/upstream-sync.yml` runs the script on a schedule against the upstream default branch, validates the result with `pnpm check`, all three web builds and `pnpm build:safari-app` on a macOS runner, then opens a pull request from `codex/upstream-sync` and squash-merges it when everything is green. Every merged sync bumps this repository's own `version` (`UPSTREAM_BUMP_VERSION=1`), and `build.yml` publishes a release for whatever `version` `main` carries, so each upstream follow-up ships as its own release. A conflicted run pushes the conflict markers to a draft pull request with the affected files listed instead, and bumps `.upstream-synced` in the same commit (`UPSTREAM_MARK_ON_CONFLICT=1`) so merging the resolved pull request is enough. While that pull request is open the next run keeps working on top of the branch, so manual resolution commits pushed there are never overwritten. `.github/workflows/build.yml` packages the three extension directories and the unsigned macOS app on every push to `main`, and publishes them as a release named after that `version` (pushing a matching tag works the same way).

## Safari platform differences

- Safari does not expose the Chrome `downloads` extension API. Local torrent downloads fall back to fetching the torrent in the background page and saving the resulting Blob.
- Safari does not expose the Chrome `notifications` extension API. Context-menu completion messages are written to the extension console.
- Safari does not support the WebExtension `omnibox` key, so the `ptd` address-bar keyword is unavailable. Search remains available from the PT-Depiler interface and context menus.
- The existing CLI native messaging bridge targets Chrome/Firefox native-host registration and is hidden in Safari builds. A Safari app-extension bridge would require a separate native protocol implementation.

All site definitions, search logic, downloader integrations, backup providers, content scripts, storage, cookies, alarms, and the options application use the upstream implementation.
