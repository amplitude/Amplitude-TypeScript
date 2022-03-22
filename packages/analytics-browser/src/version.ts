/**
 * NOTE: Due to TS config rootDir, there's not clean way to import package.json
 * To import package.json, it needs to be part of the project, specified through rootDir
 * However, if we specify rootDir as the root directory of this project, the dist files
 * will include src/ in it.
 * To workaround this issue, this file is created as a placeholder and updated by
 * `yarn version-file` which runs on publish lifecycle. The true version value will
 * only reflect in the dist files.
 *
 * WARNING: This file does not need to be updated and checked into git
 */
export const VERSION = '0.0.0';
