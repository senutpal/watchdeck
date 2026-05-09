# Changelog

All notable changes to WatchDeck are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Toolbar popup. Click the WatchDeck icon to toggle auto-resume, see the active YouTube tab title, clear progress for the current video, or erase all saved data with a confirmation step.
- `activeTab` permission. Granted only on user gesture so the popup can identify the current YouTube tab. Revoked when the tab changes.
- Close button on the in-page resume controls panel.
- Branded extension icons at 16, 32, 48, and 128 px, generated from the source logo with bounding-box detection so the artwork fills the canvas.
- ZIP packaging script that produces an upload-ready archive at `watchdeck-<version>.zip`.
- `npm version` lifecycle hook that syncs `public/manifest.json` to the new package version automatically.
- GitHub Actions workflow `CI` for build, smoke, tests, and packaging on every push and pull request.
- GitHub Actions workflow `Release` triggered by `v*.*.*` tags. Builds, packages, and publishes a GitHub Release with the ZIP attached and auto-generated notes.
- GitHub Actions workflow `Bump version` for one-click semver bumps that flow into a release.
- Issue templates (bug report, feature request) with form validation.
- Pull request template tied to the project principles.
- Dependabot configuration for grouped weekly npm and monthly GitHub Actions updates.
- CODEOWNERS, EditorConfig, and `.nvmrc` for contributor consistency.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `PRIVACY.md` for the open-source community profile.

### Changed
- Brand display now reads **WatchDeck** consistently across the popup, the in-page panel, and error messages.
- Trust line copy now reads "Resume data stays on this browser. It does not sync or upload."
- Manifest description rewritten for the Chrome Web Store listing.
- README rewritten as a public-facing landing document with install, privacy, develop, and release sections.
- `package.json` adds `description`, `license`, `author`, `repository`, `bugs`, `homepage`, `engines`, and `keywords` for proper npm and GitHub metadata.

### Removed
- Mentions of internal version markers from user-facing copy.

## [0.1.0]

First milestone build. The extension is ready for local install and forms the foundation for future feature modules.

### Added

#### Extension foundation
- Manifest V3 extension shell with narrow permissions: `storage` only, content script restricted to `https://www.youtube.com/*`. ([7a47819](../../commit/7a47819))
- Modular project layout separating extension entrypoints, YouTube adapters, storage repositories, settings, and feature modules.
- Feature registry contract that lets future features mount, unmount, and run independently of the resume feature.
- Build, load, and smoke-test workflow for local development.

#### YouTube runtime adapter
- Canonical watch-context parser for `/watch?v=...` URLs with debug-only diagnostics. ([49fe1ec](../../commit/49fe1ec), [4b92546](../../commit/4b92546))
- Deduped YouTube SPA navigation observer with full cleanup on route leave. ([b118bfc](../../commit/b118bfc), [aab36a4](../../commit/aab36a4), [5b5c00d](../../commit/5b5c00d))
- Player-ready lifecycle attachment so the extension only acts when the YouTube `<video>` element is interactive. ([b126372](../../commit/b126372), [afdd3e1](../../commit/afdd3e1))
- Resume feature wiring that follows YouTube's lifecycle on direct loads, SPA navigations, and unsupported surfaces. ([5415a09](../../commit/5415a09), [495c511](../../commit/495c511), [9e847e7](../../commit/9e847e7))
- No-op behavior on Shorts, live streams, embeds, ads, and non-video pages.

#### Resume storage core
- Local resume storage repository with minimal records: video ID, timestamp, duration, updated time, completion flag, schema version. ([8837961](../../commit/8837961), [ede785e](../../commit/ede785e))
- Bounded pruning that caps record count and trims stale records to keep `chrome.storage.local` small. ([8dd5a3a](../../commit/8dd5a3a), [357820d](../../commit/357820d))
- Throttled playback progress tracker with flush hooks for pause, tab hide, and page hide. ([82be540](../../commit/82be540), [026d260](../../commit/026d260), [5642922](../../commit/5642922), [3a173bf](../../commit/3a173bf))
- Resume runtime wiring across the repository, tracker, and route-leave flush. ([b489820](../../commit/b489820), [a3e78cc](../../commit/a3e78cc), [a9503f7](../../commit/a9503f7), [bf322ce](../../commit/bf322ce))

#### Resume behavior
- Conservative resume eligibility policy that skips near-start, near-end, completed videos, unsupported surfaces, and positions YouTube already handles natively. ([d3b16e6](../../commit/d3b16e6))
- Auto-resume controller that attempts a single seek per video context and stops if the user scrubs, rewinds, or restarts.
- Programmatic versus user-initiated seek detection.

#### User controls and trust UX
- Local settings repository with a typed defaults contract. ([0afd021](../../commit/0afd021))
- Resume clear API for current video and full-clear paths. ([b56e2f4](../../commit/b56e2f4))
- In-page trust controls panel with a global enable toggle, clear-this-video, and clear-all actions. ([2304900](../../commit/2304900), [f7fd691](../../commit/f7fd691))
- Subtle auto-resume status indicator.

#### Validation
- Storage repository spec covering list, delete, and availability paths. ([6b84df3](../../commit/6b84df3))
- Bounded storage write frequency regression test. ([fb620ce](../../commit/fb620ce))
- `example-noop` reference feature that demonstrates the registry mount and unmount lifecycle for future contributors. ([3afa7d7](../../commit/3afa7d7))
- Modularity test that proves a new feature can be added without editing resume internals. ([d6b34a9](../../commit/d6b34a9))
- Unit test suite of 111 tests across 15 files covering route parsing, navigation, lifecycle, settings, storage, resume policy, controller, tracker, trust panel, and modularity.

### Repository setup
- Initial repository, license, and `.gitignore` for planning artifacts and build output. ([c85de79](../../commit/c85de79), [da7954f](../../commit/da7954f))

[Unreleased]: https://github.com/senutpal/watchdeck/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/senutpal/watchdeck/releases/tag/v0.1.0
