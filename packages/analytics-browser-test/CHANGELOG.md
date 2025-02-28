# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.8.0-beta.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.7.0...@amplitude/analytics-browser-test@2.8.0-beta.1) (2025-02-28)


### Bug Fixes

* [AMP-95816] fix pageCounter bug ([#720](https://github.com/amplitude/Amplitude-TypeScript/issues/720)) ([8899853](https://github.com/amplitude/Amplitude-TypeScript/commit/88998534b3bd3c88e66fb88bafd41768e41d377c))
* adding tests ([ba9688a](https://github.com/amplitude/Amplitude-TypeScript/commit/ba9688a31377a3e7903e9689970a99878e635569))
* don't automatically start new session on setUserId ([#427](https://github.com/amplitude/Amplitude-TypeScript/issues/427)) ([d40b5c3](https://github.com/amplitude/Amplitude-TypeScript/commit/d40b5c305e1d67d988e70608ba01789b8f0abb2b))
* extend session on new events ([#432](https://github.com/amplitude/Amplitude-TypeScript/issues/432)) ([8bb049d](https://github.com/amplitude/Amplitude-TypeScript/commit/8bb049df4c6b99ff44303cf2aaeb7357ae90b362))
* fix the session event fire too often issue ([#751](https://github.com/amplitude/Amplitude-TypeScript/issues/751)) ([69bc69b](https://github.com/amplitude/Amplitude-TypeScript/commit/69bc69bd8e05b36ca76079dc9a01552315aaef5a))
* fix web attribution identify and session start order ([#696](https://github.com/amplitude/Amplitude-TypeScript/issues/696)) ([2f077da](https://github.com/amplitude/Amplitude-TypeScript/commit/2f077da7b528ed6f23f7459b7c961c099dbcb1bb))
* sest sion end events being assigned to a different session id ([#426](https://github.com/amplitude/Amplitude-TypeScript/issues/426)) ([7d52037](https://github.com/amplitude/Amplitude-TypeScript/commit/7d52037280159ddb176e5e1ef64577bd97edfc36))
* simplify plugins and eliminate enums ([#407](https://github.com/amplitude/Amplitude-TypeScript/issues/407)) ([890ec66](https://github.com/amplitude/Amplitude-TypeScript/commit/890ec6695a8b25cd6988e9f7ae584d4ba2835f67))
* update attribution plugin to apply utm params to the `session_start` event ([#619](https://github.com/amplitude/Amplitude-TypeScript/issues/619)) ([bf45ca6](https://github.com/amplitude/Amplitude-TypeScript/commit/bf45ca6c17ac8d656cb6c5bb4f4fa19ff344ac85))


### Features

* add client upload time ([#601](https://github.com/amplitude/Amplitude-TypeScript/issues/601)) ([b80d090](https://github.com/amplitude/Amplitude-TypeScript/commit/b80d090c5a70f75b4d3cb653efa1af48ff2fcd34))
* **analytics-browser:** consume remote config ([#769](https://github.com/amplitude/Amplitude-TypeScript/issues/769)) ([9c4e03c](https://github.com/amplitude/Amplitude-TypeScript/commit/9c4e03c3b3989213ac04410c8b9bf5e78ed393cf))
* landing page improvement ([#667](https://github.com/amplitude/Amplitude-TypeScript/issues/667)) ([5f365f0](https://github.com/amplitude/Amplitude-TypeScript/commit/5f365f0b933ee890aee1d9ac083576f09b0defc3))
* make default event tracking enabled by default ([#386](https://github.com/amplitude/Amplitude-TypeScript/issues/386)) ([242f42d](https://github.com/amplitude/Amplitude-TypeScript/commit/242f42dd2e46eaec95c827795e04f74fba39c35f))
* remote config ([#832](https://github.com/amplitude/Amplitude-TypeScript/issues/832)) ([c415f79](https://github.com/amplitude/Amplitude-TypeScript/commit/c415f792a98253ac60885eb1dc7e53b78ca47dcb)), closes [#769](https://github.com/amplitude/Amplitude-TypeScript/issues/769) [#772](https://github.com/amplitude/Amplitude-TypeScript/issues/772) [#780](https://github.com/amplitude/Amplitude-TypeScript/issues/780) [#782](https://github.com/amplitude/Amplitude-TypeScript/issues/782) [#811](https://github.com/amplitude/Amplitude-TypeScript/issues/811) [#828](https://github.com/amplitude/Amplitude-TypeScript/issues/828)
* simplify browser SDK options and plugin options interface ([#384](https://github.com/amplitude/Amplitude-TypeScript/issues/384)) ([b464cfb](https://github.com/amplitude/Amplitude-TypeScript/commit/b464cfb8e09d722bf06ed3c11955f77465a23daf))
* simplify init interface ([#416](https://github.com/amplitude/Amplitude-TypeScript/issues/416)) ([93752da](https://github.com/amplitude/Amplitude-TypeScript/commit/93752da1e6ed521263c6d5295a37fc5dc7f3de86))
* simplify user identity storage options/configuration ([#390](https://github.com/amplitude/Amplitude-TypeScript/issues/390)) ([f8cf0cc](https://github.com/amplitude/Amplitude-TypeScript/commit/f8cf0cca8c2a17738f13878642fa5b37c0070f77))
* use server side user agent parser ([#382](https://github.com/amplitude/Amplitude-TypeScript/issues/382)) ([69bd255](https://github.com/amplitude/Amplitude-TypeScript/commit/69bd2558cb37d027064b6459cc2887c219196973))


### Reverts

* update attribution plugin to apply utm params to the `session_start` event ([#638](https://github.com/amplitude/Amplitude-TypeScript/issues/638)) ([c820279](https://github.com/amplitude/Amplitude-TypeScript/commit/c820279cbef2123d890beb7861d7edbbc3926f6e))





# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.7.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.6.2...@amplitude/analytics-browser-test@2.7.0) (2023-05-04)

### Features

- add attribution tracking for linkedin click id li_fat_id
  ([ca81f3d](https://github.com/amplitude/Amplitude-TypeScript/commit/ca81f3d75ece7e0e23a1bc1b6889107d53a60a86))
- add rtd_cid for Reddit campaign tracking/attribution
  ([784e080](https://github.com/amplitude/Amplitude-TypeScript/commit/784e080aa129c37e850d7f34115beb9770044e4e))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.6.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.6.1...@amplitude/analytics-browser-test@2.6.2) (2023-04-27)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.6.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.6.0...@amplitude/analytics-browser-test@2.6.1) (2023-04-27)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.6.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.4...@amplitude/analytics-browser-test@2.6.0) (2023-04-25)

### Features

- send user_agent with events ([#375](https://github.com/amplitude/Amplitude-TypeScript/issues/375))
  ([26086b5](https://github.com/amplitude/Amplitude-TypeScript/commit/26086b543d7f0ee2d35e09b43199b5c26ed24e36))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.5.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.3...@amplitude/analytics-browser-test@2.5.4) (2023-04-06)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.5.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.2...@amplitude/analytics-browser-test@2.5.3) (2023-03-31)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.5.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.2-beta.0...@amplitude/analytics-browser-test@2.5.2) (2023-03-31)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.5.2-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.1...@amplitude/analytics-browser-test@2.5.2-beta.0) (2023-03-31)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.5.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.1-beta.1...@amplitude/analytics-browser-test@2.5.1) (2023-03-03)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.5.1-beta.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.1-beta.0...@amplitude/analytics-browser-test@2.5.1-beta.1) (2023-03-03)

### Bug Fixes

- event types and properties for default events ([#341](https://github.com/amplitude/Amplitude-TypeScript/issues/341))
  ([707522d](https://github.com/amplitude/Amplitude-TypeScript/commit/707522d440d5aa3be48809afcb44a4147f103903))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.5.1-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.0...@amplitude/analytics-browser-test@2.5.1-beta.0) (2023-03-03)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.5.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.0-beta.4...@amplitude/analytics-browser-test@2.5.0) (2023-02-27)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.5.0-beta.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.0-beta.3...@amplitude/analytics-browser-test@2.5.0-beta.4) (2023-02-27)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.5.0-beta.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.0-beta.2...@amplitude/analytics-browser-test@2.5.0-beta.3) (2023-02-26)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.5.0-beta.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.0-beta.1...@amplitude/analytics-browser-test@2.5.0-beta.2) (2023-02-25)

### Bug Fixes

- inconsistent user and device id on session events
  ([#337](https://github.com/amplitude/Amplitude-TypeScript/issues/337))
  ([0dfbc6c](https://github.com/amplitude/Amplitude-TypeScript/commit/0dfbc6c78335a7578fc0207d91c1ef9845950f16))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.5.0-beta.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.5.0-beta.0...@amplitude/analytics-browser-test@2.5.0-beta.1) (2023-02-24)

### Bug Fixes

- improper cookie usage ([#330](https://github.com/amplitude/Amplitude-TypeScript/issues/330))
  ([e670091](https://github.com/amplitude/Amplitude-TypeScript/commit/e670091e59014bb35bd9b3ec2a7192f259393575))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.5.0-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.4.2...@amplitude/analytics-browser-test@2.5.0-beta.0) (2023-02-24)

### Features

- add session start/end event tracker ([#332](https://github.com/amplitude/Amplitude-TypeScript/issues/332))
  ([e26cf15](https://github.com/amplitude/Amplitude-TypeScript/commit/e26cf15503c59d3b25bd54391bb330a8c634eca3))
- retrofit web attribution and page view plugins to browser SDK
  ([#331](https://github.com/amplitude/Amplitude-TypeScript/issues/331))
  ([ba845d3](https://github.com/amplitude/Amplitude-TypeScript/commit/ba845d3329bd6bebe3b89f24f4f316088c2d62b9))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.4.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.4.1...@amplitude/analytics-browser-test@2.4.2) (2023-02-09)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.4.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.4.0...@amplitude/analytics-browser-test@2.4.1) (2023-02-02)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.4.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.4.0-beta.0...@amplitude/analytics-browser-test@2.4.0) (2023-01-31)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [2.4.0-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.3.5...@amplitude/analytics-browser-test@2.4.0-beta.0) (2023-01-26)

### Features

- allow opt out of deleting legacy sdk cookies
  ([c6a82fb](https://github.com/amplitude/Amplitude-TypeScript/commit/c6a82fb52e1301e427116891d1f31208bcfc6548))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.3.5](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.3.4...@amplitude/analytics-browser-test@2.3.5) (2023-01-11)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.3.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.3.3...@amplitude/analytics-browser-test@2.3.4) (2022-12-21)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.3.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.3.2...@amplitude/analytics-browser-test@2.3.3) (2022-12-10)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.3.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.3.1...@amplitude/analytics-browser-test@2.3.2) (2022-12-06)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.3.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.3.0...@amplitude/analytics-browser-test@2.3.1) (2022-12-05)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# [2.3.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.2.3...@amplitude/analytics-browser-test@2.3.0) (2022-11-28)

### Features

- add utm_id tracking ([#284](https://github.com/amplitude/Amplitude-TypeScript/issues/284))
  ([f72dcf1](https://github.com/amplitude/Amplitude-TypeScript/commit/f72dcf1788ebc84544aaee1dc41b1d1ba6e4c06e))

## [2.2.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.2.2...@amplitude/analytics-browser-test@2.2.3) (2022-11-22)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.2.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.2.1...@amplitude/analytics-browser-test@2.2.2) (2022-11-15)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.2.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.2.0...@amplitude/analytics-browser-test@2.2.1) (2022-11-01)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# [2.2.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.11...@amplitude/analytics-browser-test@2.2.0) (2022-11-01)

### Features

- enhance logger with debug information ([#254](https://github.com/amplitude/Amplitude-TypeScript/issues/254))
  ([5c6175e](https://github.com/amplitude/Amplitude-TypeScript/commit/5c6175e9372cbeea264ddb34c6cc68148063d4f7))

## [2.1.11](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.10...@amplitude/analytics-browser-test@2.1.11) (2022-10-26)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.10](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.10-beta.1...@amplitude/analytics-browser-test@2.1.10) (2022-10-25)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.10-beta.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.10-beta.0...@amplitude/analytics-browser-test@2.1.10-beta.1) (2022-10-25)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.10-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.9...@amplitude/analytics-browser-test@2.1.10-beta.0) (2022-10-25)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.9](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.8...@amplitude/analytics-browser-test@2.1.9) (2022-10-25)

### Bug Fixes

- invoke pre-init track fns after attribution ([#253](https://github.com/amplitude/Amplitude-TypeScript/issues/253))
  ([b8996d7](https://github.com/amplitude/Amplitude-TypeScript/commit/b8996d793f74d388c1a96e0cde5c0ac060c1e565))

## [2.1.8](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.7...@amplitude/analytics-browser-test@2.1.8) (2022-10-14)

### Bug Fixes

- run queued functions after attribution in browser-client.ts
  ([#249](https://github.com/amplitude/Amplitude-TypeScript/issues/249))
  ([751b7ca](https://github.com/amplitude/Amplitude-TypeScript/commit/751b7ca6b0f05131dc932b89dd89e8979e334b4b))

## [2.1.7](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.6...@amplitude/analytics-browser-test@2.1.7) (2022-10-04)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.6](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.5...@amplitude/analytics-browser-test@2.1.6) (2022-09-30)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.5](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.4...@amplitude/analytics-browser-test@2.1.5) (2022-09-30)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.4-beta.1...@amplitude/analytics-browser-test@2.1.4) (2022-09-28)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.4-beta.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.4-beta.0...@amplitude/analytics-browser-test@2.1.4-beta.1) (2022-09-27)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.4-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.3...@amplitude/analytics-browser-test@2.1.4-beta.0) (2022-09-26)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.2...@amplitude/analytics-browser-test@2.1.3) (2022-09-26)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.1...@amplitude/analytics-browser-test@2.1.2) (2022-09-22)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.1.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.1.0...@amplitude/analytics-browser-test@2.1.1) (2022-09-16)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# [2.1.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.13...@amplitude/analytics-browser-test@2.1.0) (2022-09-08)

### Features

- add ingestion_metadata field ([#212](https://github.com/amplitude/Amplitude-TypeScript/issues/212))
  ([ebe8448](https://github.com/amplitude/Amplitude-TypeScript/commit/ebe8448b23609134f846e18da2e769158ca30bf1))

## [2.0.13](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.12...@amplitude/analytics-browser-test@2.0.13) (2022-08-31)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.0.12](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.11...@amplitude/analytics-browser-test@2.0.12) (2022-08-29)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.0.11](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.10...@amplitude/analytics-browser-test@2.0.11) (2022-08-23)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.0.10](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.9...@amplitude/analytics-browser-test@2.0.10) (2022-08-18)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.0.9](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.8...@amplitude/analytics-browser-test@2.0.9) (2022-08-16)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.0.8](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.7...@amplitude/analytics-browser-test@2.0.8) (2022-08-13)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.0.7](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.6...@amplitude/analytics-browser-test@2.0.7) (2022-08-12)

### Bug Fixes

- add callable queue when init is pending ([#181](https://github.com/amplitude/Amplitude-TypeScript/issues/181))
  ([d8fc361](https://github.com/amplitude/Amplitude-TypeScript/commit/d8fc36195b96e2c10ccc5106027beaa7e970e0c0))

## [2.0.6](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.5...@amplitude/analytics-browser-test@2.0.6) (2022-08-02)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.0.5](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.4...@amplitude/analytics-browser-test@2.0.5) (2022-07-30)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.0.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.3...@amplitude/analytics-browser-test@2.0.4) (2022-07-29)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.0.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.2...@amplitude/analytics-browser-test@2.0.3) (2022-07-22)

### Bug Fixes

- adds error handling for invalid api ([#153](https://github.com/amplitude/Amplitude-TypeScript/issues/153))
  ([c03f9d7](https://github.com/amplitude/Amplitude-TypeScript/commit/c03f9d7dad51e3026673dca31418a74591d79bbc))

## [2.0.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.1...@amplitude/analytics-browser-test@2.0.2) (2022-07-15)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [2.0.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@2.0.0...@amplitude/analytics-browser-test@2.0.1) (2022-07-13)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# [2.0.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@1.3.1...@amplitude/analytics-browser-test@2.0.0) (2022-06-29)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [1.3.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@1.3.0...@amplitude/analytics-browser-test@1.3.1) (2022-06-29)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# [1.3.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@1.2.1...@amplitude/analytics-browser-test@1.3.0) (2022-06-29)

### Features

- make storage interface async to enable react-native
  ([#122](https://github.com/amplitude/Amplitude-TypeScript/issues/122))
  ([42bb39c](https://github.com/amplitude/Amplitude-TypeScript/commit/42bb39c967db015d5899487618d066f3540c9f18))

## [1.2.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@1.2.0...@amplitude/analytics-browser-test@1.2.1) (2022-06-24)

**Note:** Version bump only for package @amplitude/analytics-browser-test

# [1.2.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@1.1.3...@amplitude/analytics-browser-test@1.2.0) (2022-06-24)

### Features

- add marketing campaign tracking ([#112](https://github.com/amplitude/Amplitude-TypeScript/issues/112))
  ([bca73ed](https://github.com/amplitude/Amplitude-TypeScript/commit/bca73ede308ecb1663986a99600657732969d60c))

## [1.1.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@1.1.2...@amplitude/analytics-browser-test@1.1.3) (2022-06-21)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [1.1.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@1.1.1...@amplitude/analytics-browser-test@1.1.2) (2022-06-17)

**Note:** Version bump only for package @amplitude/analytics-browser-test

## [1.1.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser-test@1.1.0...@amplitude/analytics-browser-test@1.1.1) (2022-05-17)

### Bug Fixes

- allow option.serverUrl to be used in destination plugin
  ([#104](https://github.com/amplitude/Amplitude-TypeScript/issues/104))
  ([f353367](https://github.com/amplitude/Amplitude-TypeScript/commit/f353367b8b264f86b6ea15b15f30385f8d5b8ad5))

# 1.1.0 (2022-05-12)

### Bug Fixes

- allow event level groups tracking ([#90](https://github.com/amplitude/Amplitude-TypeScript/issues/90))
  ([3240660](https://github.com/amplitude/Amplitude-TypeScript/commit/3240660e94db9e5c5a1ce4280d07faced2b5fd4d))
- e2e tests hardcoded library version
  ([c6caac6](https://github.com/amplitude/Amplitude-TypeScript/commit/c6caac64e0716d779c073d872e3745d5377868fe))

### Features

- parse old cookies and convert to new format ([#85](https://github.com/amplitude/Amplitude-TypeScript/issues/85))
  ([bda78be](https://github.com/amplitude/Amplitude-TypeScript/commit/bda78be5d2de335e7b1ff6da413b20d3dc751aca))
