# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2026-04-07

### Added

- **Fetch History:** Activity bar view with a tree grouped by workspace; view title **Add** (`gitHubFileFetcher.fetchHistory.add`, runs `gitHubFileFetcher.run`) and **Refresh**; context actions to remove one file or a whole workspace from storage; workspace root rows use a **green** folder icon when every stored file matches GitHub and **red** when any file is out of date or unverified (roll-up tooltips).
- Compare to GitHub (“Check for updates”): command and settings (`gitHubFileFetcher.checkForUpdates`, `checkForUpdatesMessages`, `checkForUpdatesHintSeconds`) when the active file matches stored fetch history.
- Progress UI via `window.withProgress` during GitHub API steps.
- Confirmation when the destination file already exists (overwrite yes/no).
- `gitHubFileFetcher.informationMessages` supports `false`, `true`, and `verbose` (replacing a boolean-only control).

### Changed

- Settings: `gitHubFileFetcher.fetchHistory` to control storing history; contributed commands and menus aligned (`gitHubFileFetcher.run`, `gitHubFileFetcher.fetchHistory.*`, default keybinding for the main command).
- Large internal refactor of the extension entrypoint and helpers.

## [2.0.2] - 2024-04-26

### Changed

- Updated icon.

## [2.0.1] - 2024-04-22

### Changed

- Updated icon.
- Changed release workflow to reusable.release.vscode.yml.

## [2.0.0] - 2024-02-21

### Changed

- Changed source language to TypeScript.
- Added esbuild to get Browser Editor support.
- Refactored code.

### Added

- The GitHub API is limited to 60 requests per hour for non authorized requests. You can provide your GitHub username and an access token to push this limit to 5000 requests per hour. Please see the [official GitHub doc](https://docs.github.com/en/free-pro-team@latest/rest/rate-limit/rate-limit?apiVersion=2022-11-28) for further information. You can generate the access token in your [GitHub settings](https://github.com/settings/tokens).
- Added gitHubFileFetcher.githubUsername setting.
- Added gitHubFileFetcher.githubToken setting.

## [1.0.2] - 2023-09-30

### Changed

- Tidied code.
- Saves the new manually entered repository globally.

## [1.0.1] - 2023-09-14

### Changed

- Improved Visual Studio Marketplace keywords.
- Applied common add style.

## [1.0.0] - 2023-09-26

### Added

- **GitHubFileFetcher** is an extension that searches and fetches files from GitHub.
