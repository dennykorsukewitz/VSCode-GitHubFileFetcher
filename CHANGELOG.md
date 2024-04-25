# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- Improved VSCode Marketplace keywords.
- Applied common add style.

## [1.0.0] - 2023-09-26

### Added

- **GitHubFileFetcher** is an extension that searches and fetches files from GitHub.
