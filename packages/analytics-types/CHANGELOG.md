# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.2.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-types@0.2.0...@amplitude/analytics-types@0.2.1) (2022-05-17)


### Bug Fixes

* allow min_id_length option in http payload ([#99](https://github.com/amplitude/Amplitude-TypeScript/issues/99)) ([85ec965](https://github.com/amplitude/Amplitude-TypeScript/commit/85ec965d1202f8ee68ca15fbc46015fba76ba3c9))
* allow option.serverUrl to be used in destination plugin ([#104](https://github.com/amplitude/Amplitude-TypeScript/issues/104)) ([f353367](https://github.com/amplitude/Amplitude-TypeScript/commit/f353367b8b264f86b6ea15b15f30385f8d5b8ad5))





# [0.2.0](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-types@0.1.3...@amplitude/analytics-types@0.2.0) (2022-05-12)


### Bug Fixes

* handle 400 error with invalid id lengths ([#81](https://github.com/amplitude/Amplitude-TypeScript/issues/81)) ([fd1686f](https://github.com/amplitude/Amplitude-TypeScript/commit/fd1686fa427588d1dcb6d2125cb4d53647c699e8))
* update plan type to include version id ([#83](https://github.com/amplitude/Amplitude-TypeScript/issues/83)) ([e6f05a5](https://github.com/amplitude/Amplitude-TypeScript/commit/e6f05a56ff9fc4810af8d73b6a0940c2900aa35e))


### Features

* parse old cookies and convert to new format ([#85](https://github.com/amplitude/Amplitude-TypeScript/issues/85)) ([bda78be](https://github.com/amplitude/Amplitude-TypeScript/commit/bda78be5d2de335e7b1ff6da413b20d3dc751aca))





## [0.1.3](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-types@0.1.2...@amplitude/analytics-types@0.1.3) (2022-04-02)


### Bug Fixes

* move types to analytics-types ([#70](https://github.com/amplitude/Amplitude-TypeScript/issues/70)) ([0cb4155](https://github.com/amplitude/Amplitude-TypeScript/commit/0cb41556f2f6be41a7b4838d33ce517289d4d880))





## [0.1.2](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-types@0.1.1...@amplitude/analytics-types@0.1.2) (2022-04-01)

**Note:** Version bump only for package @amplitude/analytics-types





## [0.1.1](https://github.com/amplitude/Amplitude-TypeScript/compare/@amplitude/analytics-types@0.1.0...@amplitude/analytics-types@0.1.1) (2022-04-01)


### Bug Fixes

* context plugin library version ([8d29c6f](https://github.com/amplitude/Amplitude-TypeScript/commit/8d29c6f4a612510188d920ac243c0bdb116fe02c))





# 0.1.0 (2022-03-31)


### Bug Fixes

* add log message ([#44](https://github.com/amplitude/Amplitude-TypeScript/issues/44)) ([92325bc](https://github.com/amplitude/Amplitude-TypeScript/commit/92325bc34cf0143f5f33ec4b0afd3e2d148c3d38))
* couple plugins with config instance ([#43](https://github.com/amplitude/Amplitude-TypeScript/issues/43)) ([abf687a](https://github.com/amplitude/Amplitude-TypeScript/commit/abf687a5d7a395638d8154f65ececc9b5464c366))
* deserialize json stored in cookies and local storage ([#11](https://github.com/amplitude/Amplitude-TypeScript/issues/11)) ([e4346f7](https://github.com/amplitude/Amplitude-TypeScript/commit/e4346f73e020f59ea8fce1af968b7aedd4a73ba0))
* max retry limit ([#53](https://github.com/amplitude/Amplitude-TypeScript/issues/53)) ([fdc0391](https://github.com/amplitude/Amplitude-TypeScript/commit/fdc0391885ac9822f42324d2fd66a8aace001afe))
* update event results callback parameter ([#29](https://github.com/amplitude/Amplitude-TypeScript/issues/29)) ([1acd3c0](https://github.com/amplitude/Amplitude-TypeScript/commit/1acd3c02310e5e9a2b7ab19140f7d6249e9a8452))
* update logger config to logger provider ([#19](https://github.com/amplitude/Amplitude-TypeScript/issues/19)) ([ef89d9f](https://github.com/amplitude/Amplitude-TypeScript/commit/ef89d9f5ffdc9dd88c3652ac36705c79741f53d1))


### Features

* add context plugin ([#13](https://github.com/amplitude/Amplitude-TypeScript/issues/13)) ([3d63991](https://github.com/amplitude/Amplitude-TypeScript/commit/3d639917905b25cab0bb012286b8ba487d0f63fb))
* add EU and batch endpoint support ([#50](https://github.com/amplitude/Amplitude-TypeScript/issues/50)) ([af6be60](https://github.com/amplitude/Amplitude-TypeScript/commit/af6be606a0e049657129ddbcbbf83c3dff844443))
* add identify class and handle identify logging ([#10](https://github.com/amplitude/Amplitude-TypeScript/issues/10)) ([9075b1f](https://github.com/amplitude/Amplitude-TypeScript/commit/9075b1f0cf4270dacc05b1b7f4bad36c50e2500b))
* add partner_id in event options ([#38](https://github.com/amplitude/Amplitude-TypeScript/issues/38)) ([880fe57](https://github.com/amplitude/Amplitude-TypeScript/commit/880fe57e5813d8bbe05c2a2a9428bd8a0a1e7d08))
* add serverZone check while calling getApiHost ([#51](https://github.com/amplitude/Amplitude-TypeScript/issues/51)) ([fa3014d](https://github.com/amplitude/Amplitude-TypeScript/commit/fa3014dd730e624b6320769edbdf35350d0edc3d))
* adds default logger provider ([#14](https://github.com/amplitude/Amplitude-TypeScript/issues/14)) ([c5c3d62](https://github.com/amplitude/Amplitude-TypeScript/commit/c5c3d62cf505e3df949a4225e3fa3ae2b56d5a0a))
* adds session management ([#15](https://github.com/amplitude/Amplitude-TypeScript/issues/15)) ([e23a563](https://github.com/amplitude/Amplitude-TypeScript/commit/e23a563c27befa5a3dc31ee55c559359e0159de3))
* attribution tracking ([#24](https://github.com/amplitude/Amplitude-TypeScript/issues/24)) ([c12678e](https://github.com/amplitude/Amplitude-TypeScript/commit/c12678e2aad98d333982ddb1ea4afb67a050bb1d))
* core timeline implementation ([#3](https://github.com/amplitude/Amplitude-TypeScript/issues/3)) ([ac8bc3a](https://github.com/amplitude/Amplitude-TypeScript/commit/ac8bc3a7212c4e13240fca0da1fbca2cdf7d68c2))
* create browser folder structure ([#5](https://github.com/amplitude/Amplitude-TypeScript/issues/5)) ([b1b279d](https://github.com/amplitude/Amplitude-TypeScript/commit/b1b279da067af7a5ca0c797b4f45fc154e3c2ae4))
* create cookie/events storage providers ([#7](https://github.com/amplitude/Amplitude-TypeScript/issues/7)) ([b3d6fab](https://github.com/amplitude/Amplitude-TypeScript/commit/b3d6fab5239d0d14854af9aa8a0c31826447ac48))
* create transport providers (fetch/xhr/sendBeacon) ([#8](https://github.com/amplitude/Amplitude-TypeScript/issues/8)) ([5ad3477](https://github.com/amplitude/Amplitude-TypeScript/commit/5ad3477974c779d696088922f56cae38a89f911c))
* implement revenue ([#12](https://github.com/amplitude/Amplitude-TypeScript/issues/12)) ([dafd10e](https://github.com/amplitude/Amplitude-TypeScript/commit/dafd10e9feb84513bdcd415a965e3216b044206a))
* implement save events to storage on destination plugin ([#26](https://github.com/amplitude/Amplitude-TypeScript/issues/26)) ([5f47677](https://github.com/amplitude/Amplitude-TypeScript/commit/5f476773f0a546db15de45fc40725a138a037c97))
* implemented destination plugin with retry ([#4](https://github.com/amplitude/Amplitude-TypeScript/issues/4)) ([f4f085e](https://github.com/amplitude/Amplitude-TypeScript/commit/f4f085ed343ea3a0571c778f2d40d637573817d7))
* implements optOut config ([#30](https://github.com/amplitude/Amplitude-TypeScript/issues/30)) ([bdf1eb0](https://github.com/amplitude/Amplitude-TypeScript/commit/bdf1eb0c46f535947f66162639dd0b23f154ce28))
* improve browser config logic ([#56](https://github.com/amplitude/Amplitude-TypeScript/issues/56)) ([3054c68](https://github.com/amplitude/Amplitude-TypeScript/commit/3054c6856dd8f8ed49c9326f25c14b672890915b))
* introduce amplitude sdk promises ([#52](https://github.com/amplitude/Amplitude-TypeScript/issues/52)) ([75f79c0](https://github.com/amplitude/Amplitude-TypeScript/commit/75f79c023b136b9148b79514f65515342e9b3d37))
* set transport api ([#58](https://github.com/amplitude/Amplitude-TypeScript/issues/58)) ([addd2dd](https://github.com/amplitude/Amplitude-TypeScript/commit/addd2dd70d25b6977ad7faa044da518bf7b9295b))
