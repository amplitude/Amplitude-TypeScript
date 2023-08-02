# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.5.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/plugin-session-replay-browser@0.4.2...@amplitude/plugin-session-replay-browser@0.5.0) (2023-08-02)

### Bug Fixes

- **plugins:** fix edge case when opening tab in background
  ([2857038](https://github.com/amplitude/Amplitude-TypeScript/commit/2857038310110b9bae57ad45295107895586a847))

### Features

- **session replay eu:** route rraffic to eu based on config
  ([0168653](https://github.com/amplitude/Amplitude-TypeScript/commit/016865335d05371849738403817410e2afc0ca57))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.4.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/plugin-session-replay-browser@0.4.1...@amplitude/plugin-session-replay-browser@0.4.2) (2023-08-01)

### Bug Fixes

- **plugins:** correctly fetch shouldRecord from store and clean up old store entries
  ([1e8317b](https://github.com/amplitude/Amplitude-TypeScript/commit/1e8317b64d8868bd4b5e584f50ffec4ca54dcadc))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.4.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/plugin-session-replay-browser@0.4.0...@amplitude/plugin-session-replay-browser@0.4.1) (2023-07-27)

### Bug Fixes

- **plugins:** prevent any activity from occurring if document does not have focus
  ([675cb82](https://github.com/amplitude/Amplitude-TypeScript/commit/675cb82d248f5eb564150be479228469f12d4fc8))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.4.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/plugin-session-replay-browser@0.3.0...@amplitude/plugin-session-replay-browser@0.4.0) (2023-07-27)

### Features

- **plugins:** add option to block elements based on amp-block class in session replay
  ([fb261b8](https://github.com/amplitude/Amplitude-TypeScript/commit/fb261b89db96e707de6509ccbf57f319c696ef27))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.3.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/plugin-session-replay-browser@0.2.1...@amplitude/plugin-session-replay-browser@0.3.0) (2023-07-27)

### Bug Fixes

- **plugins:** ensure config.optout takes priority over sample rate
  ([5438a43](https://github.com/amplitude/Amplitude-TypeScript/commit/5438a438ec062b3011234b0fea82b54351a12864))
- **plugins:** update README for session replay
  ([ed20cf2](https://github.com/amplitude/Amplitude-TypeScript/commit/ed20cf22180b33f29fd71a1439de26706d6ec4ff))

### Features

- **plugins:** abide by global opt out for session recording
  ([25bd516](https://github.com/amplitude/Amplitude-TypeScript/commit/25bd516849c9a7fc346c6a868c664e70cdeb5cba))
- **plugins:** add a configuration option for sampling rate
  ([bcabfa4](https://github.com/amplitude/Amplitude-TypeScript/commit/bcabfa4ea784187edc85a85bce9a2c68dde411e5))
- **plugins:** add default tracking of sessions to session replay plugin
  ([6aeb511](https://github.com/amplitude/Amplitude-TypeScript/commit/6aeb511e5a7db760ebaa86aee0d7756fb85e9020))
- **plugins:** add masking controls to session replay and reorganize constants and helper fns
  ([e46a42e](https://github.com/amplitude/Amplitude-TypeScript/commit/e46a42e430c7560a4e9da322b10238fdbf4f1bc5))
- **plugins:** update config additions to store in idb
  ([5c04c3c](https://github.com/amplitude/Amplitude-TypeScript/commit/5c04c3cc0e8ef287898f2571f8c2a3e9e00311be))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.2.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/plugin-session-replay-browser@0.2.0...@amplitude/plugin-session-replay-browser@0.2.1) (2023-07-26)

### Bug Fixes

- **plugins:** stop recording when document.hasFocus is false
  ([7fb6059](https://github.com/amplitude/Amplitude-TypeScript/commit/7fb6059716a09fae3c62a238d100fecc06861e67))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.2.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/plugin-session-replay-browser@0.1.3...@amplitude/plugin-session-replay-browser@0.2.0) (2023-07-20)

### Bug Fixes

- **plugins:** reduce min interval to 500ms
  ([b770d44](https://github.com/amplitude/Amplitude-TypeScript/commit/b770d44086306db15a378af6b1c3590afdb0ec58))

### Features

- **plugins:** solve timing issues with multiple tabs
  ([d2e9a0c](https://github.com/amplitude/Amplitude-TypeScript/commit/d2e9a0cc7c455dcdf13ea2fa303d2fbd50911536))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.1.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/plugin-session-replay-browser@0.1.2...@amplitude/plugin-session-replay-browser@0.1.3) (2023-07-13)

### Bug Fixes

- **plugins:** change timing of record upon initialization for session replay plugin
  ([1a55aee](https://github.com/amplitude/Amplitude-TypeScript/commit/1a55aeede742f688f87f128a13cf41f91bda5224))
- **plugins:** should only initiate recording on session start if recording is not initiated
  ([708d4b9](https://github.com/amplitude/Amplitude-TypeScript/commit/708d4b94d0d8714b35fe3984e604327e34b446f0))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.1.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/plugin-session-replay-browser@0.1.1...@amplitude/plugin-session-replay-browser@0.1.2) (2023-07-11)

### Bug Fixes

- **plugins:** need to send first two events immediately for replayer to work
  ([721a399](https://github.com/amplitude/Amplitude-TypeScript/commit/721a3997673d700b6bda9302b076be0f3fab7c09))
- **plugins:** pr feedback
  ([59802fb](https://github.com/amplitude/Amplitude-TypeScript/commit/59802fbc0c949373a2fd3566ed3db6a871e442a4))
- **plugins:** remove console log
  ([fc263ed](https://github.com/amplitude/Amplitude-TypeScript/commit/fc263ed34a955f0bc987cf7281a374065f95045c))
- **plugins:** update timing of sending batches of session replay events
  ([fadd7c0](https://github.com/amplitude/Amplitude-TypeScript/commit/fadd7c0cd24f78c6dd317098fe6dfad951ce206e))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.1.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/plugin-session-replay-browser@0.1.0...@amplitude/plugin-session-replay-browser@0.1.1) (2023-07-05)

### Bug Fixes

- allow literal values for plugin type ([#468](https://github.com/amplitude/Amplitude-TypeScript/issues/468))
  ([603e3ef](https://github.com/amplitude/Amplitude-TypeScript/commit/603e3eff81a3d03082544541a673df955cf30118))

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# 0.1.0 (2023-06-28)

### Features

- **plugins:** change file names
  ([2c76247](https://github.com/amplitude/Amplitude-TypeScript/commit/2c76247f8b994a52650db26dca3603319d13857e))
- **plugins:** expose function as external interface
  ([61185ac](https://github.com/amplitude/Amplitude-TypeScript/commit/61185acc3504b96be9ea8144fc62967937235b37))
