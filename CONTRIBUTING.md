# Contributing to the Amplitude-TypeScript

🎉 Thanks for your interest in contributing! 🎉

## Getting Started

### Create a new issue

If find issues while using this library or just reading through it, look to see if an issue has been created. If no issues are related, feel free to open a new one using the template.

### Solve an issue

If you find any existing issues that you are interested in fixing, you are welcome to open a PR and we will gladly review your changes.

### Making Changes

#### Setup locally

Getting setup is quick and easy. Follow the steps below to get your your dev environment up.

1. Fork GitHub repo
2. Install dependencies
3. Build packages

```
$ git clone <HTTPS_OR_GIT_URL>
$ yarn
$ yarn build
```

This repo supports mutliple major versions of all packages. For contributions to version `1.x`, create a branch off `v1.x`. For contributions to the `2.x` (latest) version, create a branch off `main`.

#### Test your changes

Building quality software is one of our top priorities. We recommend getting your changes tested using manual and automated practices.

```
$ yarn build
$ yarn test
```

When writing commit message, follow [PR Commit Title Conventions](#PR-Commit-Title-Conventions) for the format. A git hook will also run to verify that the format is followed.

#### Open a PR

Once you are finished with your changes and feel good about the proposed changes, create a pull request. A team member will assist in getting them reviewed. We are excited to work with you on this.

For contributions to version `1.x`, open a pull request off `v1.x`. For contributions to the `2.x` (latest) version, open a pull request to `main`.

#### Merge

As soon as your changes are approved, a team member will merge your PR to main and will get published shortly after.

## Practices

### PR Commit Title Conventions

PR titles should follow [conventional commit standards](https://www.conventionalcommits.org/en/v1.0.0/). This helps automate the release process.

#### Commit Types

- **Special Case**: Any commit with `BREAKING CHANGES` in the body: Creates major release
- `feat(<optional scope>)`: New features (minimum minor release)
- `fix(<optional scope>)`: Bug fixes (minimum patch release)
- `perf(<optional scope>)`: Performance improvement
- `docs(<optional scope>)`: Documentation updates
- `test(<optional scope>)`: Test updates
- `refactor(<optional scope>)`: Code change that neither fixes a bug nor adds a feature
- `style(<optional scope>)`: Code style changes (e.g. formatting, commas, semi-colons)
- `build(<optional scope>)`: Changes that affect the build system or external dependencies (e.g. Yarn, Npm)
- `ci(<optional scope>)`: Changes to our CI configuration files and scripts
- `chore(<optional scope>)`: Other changes that don't modify src or test files
- `revert(<optional scope>)`: Revert commit
