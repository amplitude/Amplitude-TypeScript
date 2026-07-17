/**
 * Shared helpers for react-native-harness run scripts.
 *
 * Architecture selection (host native binary):
 *   NEW_ARCH=0|false|off  → legacy bridge (default)
 *   NEW_ARCH=1|true|on    → New Architecture (Fabric/TurboModules)
 *
 * Rebuild controls:
 *   FORCE_REBUILD=1  → rebuild even when a cached binary exists
 *   FORCE_PODS=1     → wipe ios/Pods before pod install (iOS only)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const packageRoot = path.resolve(__dirname, '..');
export const repoRoot = path.resolve(packageRoot, '../..');
export const appRoot = path.join(repoRoot, 'examples/react-native/app');
export const iosRoot = path.join(appRoot, 'ios');
export const androidRoot = path.join(appRoot, 'android');

export const IOS_BUNDLE_ID = 'org.reactjs.native.example.app';
export const ANDROID_BUNDLE_ID = 'com.app';

/**
 * @returns {{ enabled: boolean, label: 'old-arch' | 'new-arch', rctFlag: '0' | '1', gradleFlag: 'true' | 'false' }}
 */
export const resolveNewArch = () => {
  const raw = (process.env.NEW_ARCH ?? '0').trim().toLowerCase();
  const enabled = raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
  return {
    enabled,
    label: enabled ? 'new-arch' : 'old-arch',
    rctFlag: enabled ? '1' : '0',
    gradleFlag: enabled ? 'true' : 'false',
  };
};

export const isTruthyEnv = (name) => {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
};

export const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

/** Like run(), but returns false on failure instead of exiting. */
export const tryRun = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
  return result.status === 0;
};

export const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

export const readMarker = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return null;
  }
};

export const writeMarker = (filePath, value) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${value}\n`, 'utf8');
};
