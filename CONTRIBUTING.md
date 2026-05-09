# Contributing to WatchDeck

Thanks for considering a contribution. WatchDeck is intentionally small. Every feature competes for surface area. Read the principles below before you open a PR.

## Principles

1. **Local-first.** Nothing leaves the user's machine. No analytics. No telemetry. No third-party calls without explicit opt-in.
2. **Narrow surface.** WatchDeck runs only on `youtube.com/watch`. Adding host permissions, broad matches, or content scripts elsewhere is a hard no.
3. **Quiet by default.** No overlays, toasts, autoplay overrides, or modals unless the user invoked them.
4. **Honest data.** If WatchDeck stores something, the popup shows it. One click can erase it.
5. **Modular features.** Each feature lives in `src/features/<name>/` behind the feature registry. It can be added or removed without editing other features.

If your idea conflicts with any of the above, open an issue first. We can discuss before code is written.

## Setup

```sh
git clone https://github.com/<your-fork>/watchdeck.git
cd watchdeck
npm install
npm run build
```

Then load `dist/` as an unpacked extension in `chrome://extensions`.

## Workflow

1. Open an issue describing the change.
2. Wait for a thumbs up before writing code on anything beyond a small bug fix.
3. Branch from `main`. Use a descriptive name like `feature/per-channel-speed` or `fix/spa-cleanup-leak`.
4. Write the code. Write the tests. Run them.
   ```sh
   npm test
   npm run smoke
   ```
5. Open a pull request against `main`. Fill out the template.

## Code standards

- TypeScript with `strict: true`. No `any` without justification in a comment.
- Pure module factories where possible. No global mutable state in `src/`.
- New features go in `src/features/<name>/` and register through the feature registry.
- New storage access goes through a repository in `src/storage/`. Never call `chrome.storage` directly from a feature.
- New YouTube DOM access goes through `src/adapters/youtube/`. Selectors are isolated from feature code.

## Tests

Every feature ships with unit tests in `tests/`. Tests run on Node, not in a browser. The DOM is faked where needed.

- Run `npm test` while developing.
- Run `npm run release` before opening a PR. It runs build, smoke, tests, and packaging.
- A failing test blocks merge.

## Permissions

If your change adds a manifest permission, it must:

1. Be the narrowest scope that solves the problem.
2. Be justified in the PR description.
3. Be documented in the [Privacy](PRIVACY.md) and [README](README.md) permission tables.
4. Pass the `tests/manifest.test.ts` guards or update them with a comment explaining why.

We will push back hard on any new host permission.

## Commit messages

WatchDeck uses [Conventional Commits](https://www.conventionalcommits.org). The release pipeline reads your commit prefix to decide whether to cut a new version, what kind of bump to make, and what to write in the changelog. Pick the right prefix.

| Prefix | Use it for | Effect on release |
|--------|------------|--------------------|
| `feat: …` | A new user-visible feature or capability | Minor version bump |
| `fix: …` | A user-visible bug fix | Patch version bump |
| `feat!: …` or any commit with a `BREAKING CHANGE:` footer | A change that breaks behavior, settings, or storage in a way users will notice | Major version bump |
| `chore: …` | Internal work users do not see (build, refactor, deps, formatting) | No release |
| `docs: …` | Docs-only changes | No release |
| `test: …` | Test-only additions or fixes | No release |
| `ci: …` | CI or workflow changes | No release |
| `refactor: …` | Internal restructuring without behavior change | No release |

Format:

```
<type>(<optional scope>): <imperative summary, lower case, no period>

<optional body explaining the why, wrapped at 72 chars>

<optional footer like "Closes #42" or "BREAKING CHANGE: <description>">
```

Examples:

```
feat(popup): add per-channel playback speed setting

Closes #42.
```

```
fix(resume): stop seeking past the saved point when YouTube preloads ahead
```

```
feat!: switch resume storage to schema v2

BREAKING CHANGE: existing v1 records are migrated on first load. Users
who downgrade will lose progress saved on v2.
```

If a PR contains multiple commits, the highest bump level among them wins.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). Include the browser version, the steps to reproduce, and what you expected.

## Requesting features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml). Skim the existing issues first. We may already plan to ship it.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be respectful. Be patient. Be specific.
