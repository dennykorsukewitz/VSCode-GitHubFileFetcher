# [2.1.0] - 2026-04-06

## Added

- **Fetch History:** Activity bar view with a tree grouped by workspace; view title **Add** (`gitHubFileFetcher.fetchHistory.add`, runs `gitHubFileFetcher.run`) and **Refresh**; context actions to remove one file or a whole workspace from storage; workspace root rows use a **green** folder icon when every stored file matches GitHub and **red** when any file is out of date or unverified (roll-up tooltips).
- Compare to GitHub (“Check for updates”): command and settings (`gitHubFileFetcher.checkForUpdates`, `checkForUpdatesMessages`, `checkForUpdatesHintSeconds`) when the active file matches stored fetch history.
- Progress UI via `window.withProgress` during GitHub API steps.
- Confirmation when the destination file already exists (overwrite yes/no).
- `gitHubFileFetcher.informationMessages` supports `false`, `true`, and `verbose` (replacing a boolean-only control).

## Changed

- Settings: `gitHubFileFetcher.fetchHistory` to control storing history; contributed commands and menus aligned (`gitHubFileFetcher.run`, `gitHubFileFetcher.fetchHistory.*`, default keybinding for the main command).
- Large internal refactor of the extension entrypoint and helpers.
