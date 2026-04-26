# watchdeck

small youtube extension for stuff youtube should probably remember.

## development

Install the local tooling:

```sh
npm install
```

## build

Build the unpacked Chromium extension:

```sh
npm run build
```

The build writes `dist/manifest.json`, `dist/content.js`, and `dist/background.js`.

## load unpacked

Open `chrome://extensions` or `brave://extensions`, enable Developer Mode, click Load unpacked, and select the `dist/` folder.

Reload the extension after manifest or content script changes. It should appear as `WatchDeck` in the extension list. Access is intentionally limited to Chrome local storage and YouTube pages; watchdeck is independent from YouTube.

This foundation build is intentionally silent on YouTube pages. It should load without an error card, but it does not show a toolbar popup, inject page UI, or resume videos yet.

## smoke test

Run the build and artifact smoke check before loading the extension:

```sh
npm run build && npm run smoke
```

## project shape

`src/entrypoints` contains Manifest V3 browser entrypoints.

`src/core` contains shared lifecycle contracts such as the feature registry.

`src/adapters/youtube` isolates YouTube page/runtime integration for later phases.

`src/storage` isolates Chrome local storage access behind repositories.

`src/settings` contains settings types and defaults.

`src/features/resume` contains the resume feature boundary without playback behavior yet.
