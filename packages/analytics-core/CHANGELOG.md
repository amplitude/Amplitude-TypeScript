# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.9.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.8.1...@amplitude/analytics-core@0.9.0) (2022-09-08)


### Features

* add ingestion_metadata field ([#212](https://github.com/amplitude/Amplitude-TypeScript/issues/212)) ([ebe8448](https://github.com/amplitude/Amplitude-TypeScript/commit/ebe8448b23609134f846e18da2e769158ca30bf1))





## [0.8.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.8.0...@amplitude/analytics-core@0.8.1) (2022-08-31)

**Note:** Version bump only for package @amplitude/analytics-core





# [0.8.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.7.0...@amplitude/analytics-core@0.8.0) (2022-08-18)


### Bug Fixes

* prevent concurrent init calls ([#191](https://github.com/amplitude/Amplitude-TypeScript/issues/191)) ([efda076](https://github.com/amplitude/Amplitude-TypeScript/commit/efda0760f4f1e92e47a3150985e18efcc3b108d9))


### Features

* adds create instance api ([#188](https://github.com/amplitude/Amplitude-TypeScript/issues/188)) ([050c1d9](https://github.com/amplitude/Amplitude-TypeScript/commit/050c1d96cedbc9e68aedf6fd55e85d2d3dc2fee4))





# [0.7.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.6...@amplitude/analytics-core@0.7.0) (2022-08-16)


### Bug Fixes

* add event options to setGroup ([6ee19e2](https://github.com/amplitude/Amplitude-TypeScript/commit/6ee19e2abb326a687e6e43ecb95fe84adf35a8ce))


### Features

* add 'extra' to eventOptions ([#186](https://github.com/amplitude/Amplitude-TypeScript/issues/186)) ([32266f4](https://github.com/amplitude/Amplitude-TypeScript/commit/32266f459c180b75236d036bac66c3e7ecd33920))





## [0.6.6](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.5...@amplitude/analytics-core@0.6.6) (2022-08-13)

**Note:** Version bump only for package @amplitude/analytics-core





## [0.6.5](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.4...@amplitude/analytics-core@0.6.5) (2022-08-12)


### Bug Fixes

* add callable queue when init is pending ([#181](https://github.com/amplitude/Amplitude-TypeScript/issues/181)) ([d8fc361](https://github.com/amplitude/Amplitude-TypeScript/commit/d8fc36195b96e2c10ccc5106027beaa7e970e0c0))





## [0.6.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.3...@amplitude/analytics-core@0.6.4) (2022-07-22)


### Bug Fixes

* adds error handling for invalid api ([#153](https://github.com/amplitude/Amplitude-TypeScript/issues/153)) ([c03f9d7](https://github.com/amplitude/Amplitude-TypeScript/commit/c03f9d7dad51e3026673dca31418a74591d79bbc))
* allow undefined storage provider ([#146](https://github.com/amplitude/Amplitude-TypeScript/issues/146)) ([e704342](https://github.com/amplitude/Amplitude-TypeScript/commit/e704342761c8ad7de3921ba21901ef8d3a768188))
* missing tracked events before init issue ([#144](https://github.com/amplitude/Amplitude-TypeScript/issues/144)) ([60d0f68](https://github.com/amplitude/Amplitude-TypeScript/commit/60d0f6848087f7b8fc3c870d55489a238e841b26))
* removes saveEvents config ([#147](https://github.com/amplitude/Amplitude-TypeScript/issues/147)) ([6fde736](https://github.com/amplitude/Amplitude-TypeScript/commit/6fde736ca8a865462522082a8085673756dbcc7d))
* update default flush config for node ([#152](https://github.com/amplitude/Amplitude-TypeScript/issues/152)) ([2445dff](https://github.com/amplitude/Amplitude-TypeScript/commit/2445dff0842e7e0a2b7ee767ab926b5a93348214))





## [0.6.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.2...@amplitude/analytics-core@0.6.3) (2022-07-15)

**Note:** Version bump only for package @amplitude/analytics-core





## [0.6.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.1...@amplitude/analytics-core@0.6.2) (2022-07-13)


### Bug Fixes

* handle error gracefully when identify is set with null ([#138](https://github.com/amplitude/Amplitude-TypeScript/issues/138)) ([e0458d1](https://github.com/amplitude/Amplitude-TypeScript/commit/e0458d1256d2a96195bc8029c3df0d6ac257a588))





## [0.6.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.6.0...@amplitude/analytics-core@0.6.1) (2022-06-29)


### Bug Fixes

* remove Awaited type to support older versions of typescript ([#121](https://github.com/amplitude/Amplitude-TypeScript/issues/121)) ([23d36f8](https://github.com/amplitude/Amplitude-TypeScript/commit/23d36f8aade258b995132dafd725ada00e400916))





# [0.6.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.5.0...@amplitude/analytics-core@0.6.0) (2022-06-29)


### Features

* add flush() api to send all events immediately ([#125](https://github.com/amplitude/Amplitude-TypeScript/issues/125)) ([b5dbcbb](https://github.com/amplitude/Amplitude-TypeScript/commit/b5dbcbb803c76ee5ade7ea85f76fbea50d8bab49))
* make storage interface async to enable react-native ([#122](https://github.com/amplitude/Amplitude-TypeScript/issues/122)) ([42bb39c](https://github.com/amplitude/Amplitude-TypeScript/commit/42bb39c967db015d5899487618d066f3540c9f18))





# [0.5.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.4.1...@amplitude/analytics-core@0.5.0) (2022-06-24)


### Features

* add marketing campaign tracking ([#112](https://github.com/amplitude/Amplitude-TypeScript/issues/112)) ([bca73ed](https://github.com/amplitude/Amplitude-TypeScript/commit/bca73ede308ecb1663986a99600657732969d60c))





## [0.4.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.4.0...@amplitude/analytics-core@0.4.1) (2022-06-21)


### Bug Fixes

* remove userId and deviceId from createIdentifyEvent and createGroupIdentifyEvent ([#119](https://github.com/amplitude/Amplitude-TypeScript/issues/119)) ([e7726bb](https://github.com/amplitude/Amplitude-TypeScript/commit/e7726bb9ba16c390638b51042169ede9e083e331))





# [0.4.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.3.1...@amplitude/analytics-core@0.4.0) (2022-06-17)


### Features

* add event bridge components ([#93](https://github.com/amplitude/Amplitude-TypeScript/issues/93)) ([64452fc](https://github.com/amplitude/Amplitude-TypeScript/commit/64452fcfeee66e10367220da023137232b2ea112))
* add Plan option to config ([#117](https://github.com/amplitude/Amplitude-TypeScript/issues/117)) ([194d7e6](https://github.com/amplitude/Amplitude-TypeScript/commit/194d7e66af0209cb8155cf6aa0b05a5dcb170f9d))
* introduce NodeJS package ([#92](https://github.com/amplitude/Amplitude-TypeScript/issues/92)) ([476fb44](https://github.com/amplitude/Amplitude-TypeScript/commit/476fb44efcf2dfcd84af6f0ef45e141ad87dac43))





## [0.3.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.3.0...@amplitude/analytics-core@0.3.1) (2022-05-17)


### Bug Fixes

* allow min_id_length option in http payload ([#99](https://github.com/amplitude/Amplitude-TypeScript/issues/99)) ([85ec965](https://github.com/amplitude/Amplitude-TypeScript/commit/85ec965d1202f8ee68ca15fbc46015fba76ba3c9))
* allow option.serverUrl to be used in destination plugin ([#104](https://github.com/amplitude/Amplitude-TypeScript/issues/104)) ([f353367](https://github.com/amplitude/Amplitude-TypeScript/commit/f353367b8b264f86b6ea15b15f30385f8d5b8ad5))





# [0.3.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.2.4...@amplitude/analytics-core@0.3.0) (2022-05-12)


### Bug Fixes

* allow event level groups tracking ([#90](https://github.com/amplitude/Amplitude-TypeScript/issues/90)) ([3240660](https://github.com/amplitude/Amplitude-TypeScript/commit/3240660e94db9e5c5a1ce4280d07faced2b5fd4d))
* fix early return if array element is a valid object ([#95](https://github.com/amplitude/Amplitude-TypeScript/issues/95)) ([2a82b37](https://github.com/amplitude/Amplitude-TypeScript/commit/2a82b37ec06573318703f3f89d72b44a10b7a392))
* handle 400 error with invalid id lengths ([#81](https://github.com/amplitude/Amplitude-TypeScript/issues/81)) ([fd1686f](https://github.com/amplitude/Amplitude-TypeScript/commit/fd1686fa427588d1dcb6d2125cb4d53647c699e8))


### Features

* parse old cookies and convert to new format ([#85](https://github.com/amplitude/Amplitude-TypeScript/issues/85)) ([bda78be](https://github.com/amplitude/Amplitude-TypeScript/commit/bda78be5d2de335e7b1ff6da413b20d3dc751aca))





## [0.2.4](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.2.3...@amplitude/analytics-core@0.2.4) (2022-04-09)


### Bug Fixes

* fix error handling in fetch client ([#79](https://github.com/amplitude/Amplitude-TypeScript/issues/79)) ([749925f](https://github.com/amplitude/Amplitude-TypeScript/commit/749925f907ba72f0e67f3828da99151d00278e6b))





## [0.2.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.2.2...@amplitude/analytics-core@0.2.3) (2022-04-02)

**Note:** Version bump only for package @amplitude/analytics-core





## [0.2.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.2.1...@amplitude/analytics-core@0.2.2) (2022-04-01)

**Note:** Version bump only for package @amplitude/analytics-core





## [0.2.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.2.0...@amplitude/analytics-core@0.2.1) (2022-04-01)

**Note:** Version bump only for package @amplitude/analytics-core





# [0.2.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.1.1...@amplitude/analytics-core@0.2.0) (2022-04-01)


### Bug Fixes

* context plugin library version ([8d29c6f](https://github.com/amplitude/Amplitude-TypeScript/commit/8d29c6f4a612510188d920ac243c0bdb116fe02c))


### Features

* add snippet promise support ([#64](https://github.com/amplitude/Amplitude-TypeScript/issues/64)) ([4d23c98](https://github.com/amplitude/Amplitude-TypeScript/commit/4d23c98c25c7caa4cd5e63b2a37398f711991288))





## [0.1.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-core@0.1.0...@amplitude/analytics-core@0.1.1) (2022-03-31)


### Bug Fixes

* add missing dependency ([6283f64](https://github.com/amplitude/Amplitude-TypeScript/commit/6283f64dc40b070d68a0243a93ab58d95d436664))





# 0.1.0 (2022-03-31)


### Bug Fixes

* add log message ([#44](https://github.com/amplitude/Amplitude-TypeScript/issues/44)) ([92325bc](https://github.com/amplitude/Amplitude-TypeScript/commit/92325bc34cf0143f5f33ec4b0afd3e2d148c3d38))
* couple plugins with config instance ([#43](https://github.com/amplitude/Amplitude-TypeScript/issues/43)) ([abf687a](https://github.com/amplitude/Amplitude-TypeScript/commit/abf687a5d7a395638d8154f65ececc9b5464c366))
* max retry limit ([#53](https://github.com/amplitude/Amplitude-TypeScript/issues/53)) ([fdc0391](https://github.com/amplitude/Amplitude-TypeScript/commit/fdc0391885ac9822f42324d2fd66a8aace001afe))
* update event results callback parameter ([#29](https://github.com/amplitude/Amplitude-TypeScript/issues/29)) ([1acd3c0](https://github.com/amplitude/Amplitude-TypeScript/commit/1acd3c02310e5e9a2b7ab19140f7d6249e9a8452))
* update logger config to logger provider ([#19](https://github.com/amplitude/Amplitude-TypeScript/issues/19)) ([ef89d9f](https://github.com/amplitude/Amplitude-TypeScript/commit/ef89d9f5ffdc9dd88c3652ac36705c79741f53d1))
* use config reference as plugin instance property ([#21](https://github.com/amplitude/Amplitude-TypeScript/issues/21)) ([38c2e33](https://github.com/amplitude/Amplitude-TypeScript/commit/38c2e3334b27063e23275c020207f647acbbaf6f))


### Features

* add amplitude built-in plugins ([#22](https://github.com/amplitude/Amplitude-TypeScript/issues/22)) ([443a424](https://github.com/amplitude/Amplitude-TypeScript/commit/443a424d6dfd3a2c867f528f953429151de96ed0))
* add context plugin ([#13](https://github.com/amplitude/Amplitude-TypeScript/issues/13)) ([3d63991](https://github.com/amplitude/Amplitude-TypeScript/commit/3d639917905b25cab0bb012286b8ba487d0f63fb))
* add EU and batch endpoint support ([#50](https://github.com/amplitude/Amplitude-TypeScript/issues/50)) ([af6be60](https://github.com/amplitude/Amplitude-TypeScript/commit/af6be606a0e049657129ddbcbbf83c3dff844443))
* add getter and setter for config and group ([#45](https://github.com/amplitude/Amplitude-TypeScript/issues/45)) ([60e0073](https://github.com/amplitude/Amplitude-TypeScript/commit/60e00734a73002dffc98ddf6171ee74c5ac53aa4))
* add identify class and handle identify logging ([#10](https://github.com/amplitude/Amplitude-TypeScript/issues/10)) ([9075b1f](https://github.com/amplitude/Amplitude-TypeScript/commit/9075b1f0cf4270dacc05b1b7f4bad36c50e2500b))
* add partner_id in event options ([#38](https://github.com/amplitude/Amplitude-TypeScript/issues/38)) ([880fe57](https://github.com/amplitude/Amplitude-TypeScript/commit/880fe57e5813d8bbe05c2a2a9428bd8a0a1e7d08))
* add serverZone check while calling getApiHost ([#51](https://github.com/amplitude/Amplitude-TypeScript/issues/51)) ([fa3014d](https://github.com/amplitude/Amplitude-TypeScript/commit/fa3014dd730e624b6320769edbdf35350d0edc3d))
* adds default logger provider ([#14](https://github.com/amplitude/Amplitude-TypeScript/issues/14)) ([c5c3d62](https://github.com/amplitude/Amplitude-TypeScript/commit/c5c3d62cf505e3df949a4225e3fa3ae2b56d5a0a))
* adds group identify api ([#18](https://github.com/amplitude/Amplitude-TypeScript/issues/18)) ([8871527](https://github.com/amplitude/Amplitude-TypeScript/commit/8871527fb74d0f5745c57a053492a00d19a68c5a))
* adds session management ([#15](https://github.com/amplitude/Amplitude-TypeScript/issues/15)) ([e23a563](https://github.com/amplitude/Amplitude-TypeScript/commit/e23a563c27befa5a3dc31ee55c559359e0159de3))
* analytics core initialization ([#2](https://github.com/amplitude/Amplitude-TypeScript/issues/2)) ([7ba8a7b](https://github.com/amplitude/Amplitude-TypeScript/commit/7ba8a7b1e9b7dfc0af304dd44718a3deb5912fe9))
* browser init config ([#6](https://github.com/amplitude/Amplitude-TypeScript/issues/6)) ([c5a0992](https://github.com/amplitude/Amplitude-TypeScript/commit/c5a09925e64f8a613eeab612ee6efb43419f39b4))
* core timeline implementation ([#3](https://github.com/amplitude/Amplitude-TypeScript/issues/3)) ([ac8bc3a](https://github.com/amplitude/Amplitude-TypeScript/commit/ac8bc3a7212c4e13240fca0da1fbca2cdf7d68c2))
* create browser folder structure ([#5](https://github.com/amplitude/Amplitude-TypeScript/issues/5)) ([b1b279d](https://github.com/amplitude/Amplitude-TypeScript/commit/b1b279da067af7a5ca0c797b4f45fc154e3c2ae4))
* create cookie/events storage providers ([#7](https://github.com/amplitude/Amplitude-TypeScript/issues/7)) ([b3d6fab](https://github.com/amplitude/Amplitude-TypeScript/commit/b3d6fab5239d0d14854af9aa8a0c31826447ac48))
* create transport providers (fetch/xhr/sendBeacon) ([#8](https://github.com/amplitude/Amplitude-TypeScript/issues/8)) ([5ad3477](https://github.com/amplitude/Amplitude-TypeScript/commit/5ad3477974c779d696088922f56cae38a89f911c))
* implement revenue ([#12](https://github.com/amplitude/Amplitude-TypeScript/issues/12)) ([dafd10e](https://github.com/amplitude/Amplitude-TypeScript/commit/dafd10e9feb84513bdcd415a965e3216b044206a))
* implement save events to storage on destination plugin ([#26](https://github.com/amplitude/Amplitude-TypeScript/issues/26)) ([5f47677](https://github.com/amplitude/Amplitude-TypeScript/commit/5f476773f0a546db15de45fc40725a138a037c97))
* implemented destination plugin with retry ([#4](https://github.com/amplitude/Amplitude-TypeScript/issues/4)) ([f4f085e](https://github.com/amplitude/Amplitude-TypeScript/commit/f4f085ed343ea3a0571c778f2d40d637573817d7))
* implements optOut config ([#30](https://github.com/amplitude/Amplitude-TypeScript/issues/30)) ([bdf1eb0](https://github.com/amplitude/Amplitude-TypeScript/commit/bdf1eb0c46f535947f66162639dd0b23f154ce28))
* improve browser config logic ([#56](https://github.com/amplitude/Amplitude-TypeScript/issues/56)) ([3054c68](https://github.com/amplitude/Amplitude-TypeScript/commit/3054c6856dd8f8ed49c9326f25c14b672890915b))
* update track event ([#25](https://github.com/amplitude/Amplitude-TypeScript/issues/25)) ([bcccd65](https://github.com/amplitude/Amplitude-TypeScript/commit/bcccd659f83bd235ce7cb59848e259e14e1df392))
