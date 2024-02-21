# Changelog

All notable changes to the "GitHubFileFetcher" extension will be documented in this file.

## [Unreleased]

## [2.0.0]

### Refactoring

- Changed source language to TypeScript.
- Added esbuild to get Browser Editor support.
- Refactored code.

### Added

The GitHub API is limited to 60 requests per hour for non authorized requests. You can provide your GitHub username and an access token to push this limit to 5000 requests per hour. Please see the [official GitHub doc](https://docs.github.com/en/free-pro-team@latest/rest/rate-limit/rate-limit?apiVersion=2022-11-28) for further information.
You can generate the access token in your [GitHub settings](https://github.com/settings/tokens).

- Added gitHubFileFetcher.githubUsername setting.
- Added gitHubFileFetcher.githubToken setting.

## [1.0.2]

### Maintenance

- Tidied code.
- Saves the new manually entered repository globally.

## [1.0.1]

### Maintenance

- Improved VSCode Marketplace keywords.
- Applied common add style.

## [1.0.0]

### Initial release of GitHubFileFetcher extension

**GitHubFileFetcher** is an extension that searches and fetches files from GitHub.
