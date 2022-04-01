# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.2.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser@0.2.1...@amplitude/analytics-browser@0.2.2) (2022-04-01)

**Note:** Version bump only for package @amplitude/analytics-browser





## [0.2.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser@0.2.0...@amplitude/analytics-browser@0.2.1) (2022-04-01)

**Note:** Version bump only for package @amplitude/analytics-browser





# [0.2.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser@0.1.1...@amplitude/analytics-browser@0.2.0) (2022-04-01)


### Bug Fixes

* context plugin library version ([8d29c6f](https://github.com/amplitude/Amplitude-TypeScript/commit/8d29c6f4a612510188d920ac243c0bdb116fe02c))


### Features

* add snippet promise support ([#64](https://github.com/amplitude/Amplitude-TypeScript/issues/64)) ([4d23c98](https://github.com/amplitude/Amplitude-TypeScript/commit/4d23c98c25c7caa4cd5e63b2a37398f711991288))





## [0.1.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-browser@0.1.0...@amplitude/analytics-browser@0.1.1) (2022-03-31)


### Bug Fixes

* add missing dependency ([6283f64](https://github.com/amplitude/Amplitude-TypeScript/commit/6283f64dc40b070d68a0243a93ab58d95d436664))
* move src/version update to npm prepare ([2101ab9](https://github.com/amplitude/Amplitude-TypeScript/commit/2101ab92ee874dd1536071c65318dd9c6fac123f))





# 0.1.0 (2022-03-31)


### Bug Fixes

* address issues with usage in service worker and server-side rendering ([#46](https://github.com/amplitude/Amplitude-TypeScript/issues/46)) ([28131b8](https://github.com/amplitude/Amplitude-TypeScript/commit/28131b85a0d86bfb8276993d8152f815d2a3d74d))
* couple plugins with config instance ([#43](https://github.com/amplitude/Amplitude-TypeScript/issues/43)) ([abf687a](https://github.com/amplitude/Amplitude-TypeScript/commit/abf687a5d7a395638d8154f65ececc9b5464c366))
* deserialize json stored in cookies and local storage ([#11](https://github.com/amplitude/Amplitude-TypeScript/issues/11)) ([e4346f7](https://github.com/amplitude/Amplitude-TypeScript/commit/e4346f73e020f59ea8fce1af968b7aedd4a73ba0))
* snippet install script and public interface ([#57](https://github.com/amplitude/Amplitude-TypeScript/issues/57)) ([93f5b89](https://github.com/amplitude/Amplitude-TypeScript/commit/93f5b89c40d49e81f61daf66cea5627b768f58b5))
* update cookies last event time ([#54](https://github.com/amplitude/Amplitude-TypeScript/issues/54)) ([73a26ca](https://github.com/amplitude/Amplitude-TypeScript/commit/73a26ca87c0b8ae3be0b58d1789bf874cb0cf814))
* update event results callback parameter ([#29](https://github.com/amplitude/Amplitude-TypeScript/issues/29)) ([1acd3c0](https://github.com/amplitude/Amplitude-TypeScript/commit/1acd3c02310e5e9a2b7ab19140f7d6249e9a8452))
* update logger config to logger provider ([#19](https://github.com/amplitude/Amplitude-TypeScript/issues/19)) ([ef89d9f](https://github.com/amplitude/Amplitude-TypeScript/commit/ef89d9f5ffdc9dd88c3652ac36705c79741f53d1))
* update tracking options for browser client ([#23](https://github.com/amplitude/Amplitude-TypeScript/issues/23)) ([acb9960](https://github.com/amplitude/Amplitude-TypeScript/commit/acb99608012d6c885d94971fdd855526356edc6c))
* updates library event field in context plugin ([#28](https://github.com/amplitude/Amplitude-TypeScript/issues/28)) ([4821675](https://github.com/amplitude/Amplitude-TypeScript/commit/48216752f2105b6f2f71114913c5d9e19d192c7c))
* use config reference as plugin instance property ([#21](https://github.com/amplitude/Amplitude-TypeScript/issues/21)) ([38c2e33](https://github.com/amplitude/Amplitude-TypeScript/commit/38c2e3334b27063e23275c020207f647acbbaf6f))
* use uuid for default device id ([#20](https://github.com/amplitude/Amplitude-TypeScript/issues/20)) ([7f058e8](https://github.com/amplitude/Amplitude-TypeScript/commit/7f058e8723b9611ffb8fccb9ba80ba9bb296be4e))
* window reference and intellisense type def for IDE ([#55](https://github.com/amplitude/Amplitude-TypeScript/issues/55)) ([14eef98](https://github.com/amplitude/Amplitude-TypeScript/commit/14eef98fe7e7275ba8222586922101b326d28c43))


### Features

* add amplitude built-in plugins ([#22](https://github.com/amplitude/Amplitude-TypeScript/issues/22)) ([443a424](https://github.com/amplitude/Amplitude-TypeScript/commit/443a424d6dfd3a2c867f528f953429151de96ed0))
* add context plugin ([#13](https://github.com/amplitude/Amplitude-TypeScript/issues/13)) ([3d63991](https://github.com/amplitude/Amplitude-TypeScript/commit/3d639917905b25cab0bb012286b8ba487d0f63fb))
* add EU and batch endpoint support ([#50](https://github.com/amplitude/Amplitude-TypeScript/issues/50)) ([af6be60](https://github.com/amplitude/Amplitude-TypeScript/commit/af6be606a0e049657129ddbcbbf83c3dff844443))
* add getter and setter for config and group ([#45](https://github.com/amplitude/Amplitude-TypeScript/issues/45)) ([60e0073](https://github.com/amplitude/Amplitude-TypeScript/commit/60e00734a73002dffc98ddf6171ee74c5ac53aa4))
* add partner_id in event options ([#38](https://github.com/amplitude/Amplitude-TypeScript/issues/38)) ([880fe57](https://github.com/amplitude/Amplitude-TypeScript/commit/880fe57e5813d8bbe05c2a2a9428bd8a0a1e7d08))
* add serverZone check while calling getApiHost ([#51](https://github.com/amplitude/Amplitude-TypeScript/issues/51)) ([fa3014d](https://github.com/amplitude/Amplitude-TypeScript/commit/fa3014dd730e624b6320769edbdf35350d0edc3d))
* add snippet installation ([#36](https://github.com/amplitude/Amplitude-TypeScript/issues/36)) ([85348d5](https://github.com/amplitude/Amplitude-TypeScript/commit/85348d5ff719bf30ed3a93ed11dd97ed98ff862a))
* adds session management ([#15](https://github.com/amplitude/Amplitude-TypeScript/issues/15)) ([e23a563](https://github.com/amplitude/Amplitude-TypeScript/commit/e23a563c27befa5a3dc31ee55c559359e0159de3))
* attribution tracking ([#24](https://github.com/amplitude/Amplitude-TypeScript/issues/24)) ([c12678e](https://github.com/amplitude/Amplitude-TypeScript/commit/c12678e2aad98d333982ddb1ea4afb67a050bb1d))
* browser init config ([#6](https://github.com/amplitude/Amplitude-TypeScript/issues/6)) ([c5a0992](https://github.com/amplitude/Amplitude-TypeScript/commit/c5a09925e64f8a613eeab612ee6efb43419f39b4))
* create browser folder structure ([#5](https://github.com/amplitude/Amplitude-TypeScript/issues/5)) ([b1b279d](https://github.com/amplitude/Amplitude-TypeScript/commit/b1b279da067af7a5ca0c797b4f45fc154e3c2ae4))
* create cookie/events storage providers ([#7](https://github.com/amplitude/Amplitude-TypeScript/issues/7)) ([b3d6fab](https://github.com/amplitude/Amplitude-TypeScript/commit/b3d6fab5239d0d14854af9aa8a0c31826447ac48))
* create transport providers (fetch/xhr/sendBeacon) ([#8](https://github.com/amplitude/Amplitude-TypeScript/issues/8)) ([5ad3477](https://github.com/amplitude/Amplitude-TypeScript/commit/5ad3477974c779d696088922f56cae38a89f911c))
* expose core apis ([#37](https://github.com/amplitude/Amplitude-TypeScript/issues/37)) ([ea034de](https://github.com/amplitude/Amplitude-TypeScript/commit/ea034de03737570ae42e9b844835744362cc73df))
* implement save events to storage on destination plugin ([#26](https://github.com/amplitude/Amplitude-TypeScript/issues/26)) ([5f47677](https://github.com/amplitude/Amplitude-TypeScript/commit/5f476773f0a546db15de45fc40725a138a037c97))
* implements optOut config ([#30](https://github.com/amplitude/Amplitude-TypeScript/issues/30)) ([bdf1eb0](https://github.com/amplitude/Amplitude-TypeScript/commit/bdf1eb0c46f535947f66162639dd0b23f154ce28))
* improve browser config logic ([#56](https://github.com/amplitude/Amplitude-TypeScript/issues/56)) ([3054c68](https://github.com/amplitude/Amplitude-TypeScript/commit/3054c6856dd8f8ed49c9326f25c14b672890915b))
* introduce amplitude sdk promises ([#52](https://github.com/amplitude/Amplitude-TypeScript/issues/52)) ([75f79c0](https://github.com/amplitude/Amplitude-TypeScript/commit/75f79c023b136b9148b79514f65515342e9b3d37))
* set transport api ([#58](https://github.com/amplitude/Amplitude-TypeScript/issues/58)) ([addd2dd](https://github.com/amplitude/Amplitude-TypeScript/commit/addd2dd70d25b6977ad7faa044da518bf7b9295b))
* update track event ([#25](https://github.com/amplitude/Amplitude-TypeScript/issues/25)) ([bcccd65](https://github.com/amplitude/Amplitude-TypeScript/commit/bcccd659f83bd235ce7cb59848e259e14e1df392))
