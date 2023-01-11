# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.5.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.5.1...@amplitude/analytics-client-common@0.5.2) (2023-01-11)

**Note:** Version bump only for package @amplitude/analytics-client-common

# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.5.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.5.0...@amplitude/analytics-client-common@0.5.1) (2022-12-21)

### Bug Fixes

- upgrade dependencies to resolve dependabot vulnerability alerts
  ([#299](https://github.com/amplitude/Amplitude-TypeScript/issues/299))
  ([7dd1cd1](https://github.com/amplitude/Amplitude-TypeScript/commit/7dd1cd1b23a71981a4ad90b4b30cc9b7d28c4412))

### Reverts

- Revert "Updated dependencies"
  ([7ca9964](https://github.com/amplitude/Amplitude-TypeScript/commit/7ca9964781e4b900c6c027bdddf2ae1e7428ba18))

# [0.5.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.4.1...@amplitude/analytics-client-common@0.5.0) (2022-11-28)

### Features

- add utm_id tracking ([#284](https://github.com/amplitude/Amplitude-TypeScript/issues/284))
  ([f72dcf1](https://github.com/amplitude/Amplitude-TypeScript/commit/f72dcf1788ebc84544aaee1dc41b1d1ba6e4c06e))
- persisted event identifiers (React Native) ([#280](https://github.com/amplitude/Amplitude-TypeScript/issues/280))
  ([bd35e73](https://github.com/amplitude/Amplitude-TypeScript/commit/bd35e73a0a08db6609938d27f00f54cbf77ff6c1))

## [0.4.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.4.0...@amplitude/analytics-client-common@0.4.1) (2022-11-15)

**Note:** Version bump only for package @amplitude/analytics-client-common

# [0.4.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.3.5...@amplitude/analytics-client-common@0.4.0) (2022-11-01)

### Features

- ignore subdomains when comparing newness of campaigns
  ([#260](https://github.com/amplitude/Amplitude-TypeScript/issues/260))
  ([8bb2b76](https://github.com/amplitude/Amplitude-TypeScript/commit/8bb2b76faf37783a58e953391468bd31c089e3a3))

## [0.3.5](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.3.4...@amplitude/analytics-client-common@0.3.5) (2022-11-01)

**Note:** Version bump only for package @amplitude/analytics-client-common

## [0.3.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.3.3...@amplitude/analytics-client-common@0.3.4) (2022-10-26)

### Bug Fixes

- adds optional chaining to window.location ([#258](https://github.com/amplitude/Amplitude-TypeScript/issues/258))
  ([c30a1e0](https://github.com/amplitude/Amplitude-TypeScript/commit/c30a1e06feb632942a1697bda4948259ea0721a5))

## [0.3.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.3.3-beta.1...@amplitude/analytics-client-common@0.3.3) (2022-10-25)

**Note:** Version bump only for package @amplitude/analytics-client-common

## [0.3.3-beta.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.3.3-beta.0...@amplitude/analytics-client-common@0.3.3-beta.1) (2022-10-25)

### Reverts

- add logging around cookie storage ([#256](https://github.com/amplitude/Amplitude-TypeScript/issues/256))
  ([12016e7](https://github.com/amplitude/Amplitude-TypeScript/commit/12016e7eddb7bec885883c0ebf1619fc447beb87))

## [0.3.3-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.3.2...@amplitude/analytics-client-common@0.3.3-beta.0) (2022-10-25)

### Bug Fixes

- add logging around cookie storage ([#255](https://github.com/amplitude/Amplitude-TypeScript/issues/255))
  ([dee9d32](https://github.com/amplitude/Amplitude-TypeScript/commit/dee9d3299b90b71576a8c435c26a03c1dcabdae4))

## [0.3.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.3.1...@amplitude/analytics-client-common@0.3.2) (2022-10-25)

### Bug Fixes

- add safe check for global scope before loading SDK
  ([#252](https://github.com/amplitude/Amplitude-TypeScript/issues/252))
  ([a3f4f6f](https://github.com/amplitude/Amplitude-TypeScript/commit/a3f4f6f7b11abd9cdbdf064e31e32d5fc3e92031))
- invoke pre-init track fns after attribution ([#253](https://github.com/amplitude/Amplitude-TypeScript/issues/253))
  ([b8996d7](https://github.com/amplitude/Amplitude-TypeScript/commit/b8996d793f74d388c1a96e0cde5c0ac060c1e565))

## [0.3.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.3.0...@amplitude/analytics-client-common@0.3.1) (2022-10-14)

**Note:** Version bump only for package @amplitude/analytics-client-common

# [0.3.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.2.4...@amplitude/analytics-client-common@0.3.0) (2022-10-04)

### Features

- add gbraid and wbraid as campaign parameters ([#242](https://github.com/amplitude/Amplitude-TypeScript/issues/242))
  ([514b7cd](https://github.com/amplitude/Amplitude-TypeScript/commit/514b7cdea9fee0c4e61479b087f7acdfea889350))

## [0.2.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.2.3...@amplitude/analytics-client-common@0.2.4) (2022-09-30)

### Bug Fixes

- resolve web attribution is not tracking the first direct/organic traffic
  ([#239](https://github.com/amplitude/Amplitude-TypeScript/issues/239))
  ([98a3363](https://github.com/amplitude/Amplitude-TypeScript/commit/98a33633a7a6de7ee147c8cbf690e5546ce53163))

## [0.2.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.2.2...@amplitude/analytics-client-common@0.2.3) (2022-09-30)

### Bug Fixes

- cover the case when apiKey is missing in the runtime
  ([#240](https://github.com/amplitude/Amplitude-TypeScript/issues/240))
  ([308bbe8](https://github.com/amplitude/Amplitude-TypeScript/commit/308bbe8337cbab366a0ca255f2d665101f4781a0))

## [0.2.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.2.2-beta.1...@amplitude/analytics-client-common@0.2.2) (2022-09-28)

**Note:** Version bump only for package @amplitude/analytics-client-common

## [0.2.2-beta.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.2.2-beta.0...@amplitude/analytics-client-common@0.2.2-beta.1) (2022-09-27)

### Bug Fixes

- define correct dependencies for @amplitude/analytics-connector
  ([#234](https://github.com/amplitude/Amplitude-TypeScript/issues/234))
  ([41c1351](https://github.com/amplitude/Amplitude-TypeScript/commit/41c1351e441b890b016ba123c4ed5747a4c33adb))

## [0.2.2-beta.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.2.1...@amplitude/analytics-client-common@0.2.2-beta.0) (2022-09-26)

**Note:** Version bump only for package @amplitude/analytics-client-common

## [0.2.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.2.0...@amplitude/analytics-client-common@0.2.1) (2022-09-26)

### Bug Fixes

- update base config to include additional click ids
  ([#229](https://github.com/amplitude/Amplitude-TypeScript/issues/229))
  ([5596931](https://github.com/amplitude/Amplitude-TypeScript/commit/55969310714c43f138e1702ba285fd4dadcdcb44))

# [0.2.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.1.0...@amplitude/analytics-client-common@0.2.0) (2022-09-22)

### Features

- add campaign params to page view events ([#216](https://github.com/amplitude/Amplitude-TypeScript/issues/216))
  ([c0f99b9](https://github.com/amplitude/Amplitude-TypeScript/commit/c0f99b98d0d2c24f6f9486312b568194c690a202))

# [0.1.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-client-common@0.0.1...@amplitude/analytics-client-common@0.1.0) (2022-09-16)

### Features

- attl click id campaign params ([#220](https://github.com/amplitude/Amplitude-TypeScript/issues/220))
  ([7598895](https://github.com/amplitude/Amplitude-TypeScript/commit/75988950d7d3a97d00e038ae368b311f0b314604))

## 0.0.1 (2022-09-08)

**Note:** Version bump only for package @amplitude/analytics-client-common
