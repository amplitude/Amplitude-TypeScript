/* eslint-disable no-restricted-globals */
import { getGlobalScope } from '../global-scope';
import { BackgroundCaptureDeviceMode, parseBackgroundCaptureDeviceMode } from './background-capture-types';

/**
 * Fragment key the Amplitude app adds when it opens a page for background
 * capture. The value is base64url-encoded JSON:
 * `{ v: 1, captureId, uploadUrl, deviceMode? }`.
 *
 * This lets capture work when the page's Cross-Origin-Opener-Policy severs
 * `window.opener`, which the postMessage flow depends on: the snapshot is
 * uploaded to `uploadUrl` and the Amplitude app polls for it.
 */
export const BACKGROUND_CAPTURE_FRAGMENT_KEY = 'amp_bg_capture';

/** sessionStorage key that keeps the session across reloads and in-tab navigation. */
const BACKGROUND_CAPTURE_SESSION_STORAGE_KEY = 'amp-bc-capture-session';

/**
 * Upload URLs must point at Amplitude's page background buckets. Without this,
 * a crafted link could send a snapshot of the page to any host.
 */
const UPLOAD_BUCKET_PREFIX = 'com-amplitude-page-backgrounds-';
const S3_HOST_PATTERN = /^s3([.-][a-z0-9-]+)*\.amazonaws\.com$/;

export type BackgroundCaptureSession = {
  captureId: string;
  uploadUrl: string;
  deviceMode?: BackgroundCaptureDeviceMode;
};

const isAllowedUploadUrl = (uploadUrl: string): boolean => {
  let url: URL;
  try {
    url = new URL(uploadUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') {
    return false;
  }
  // Virtual-hosted style: <bucket>.s3.<region>.amazonaws.com
  if (url.hostname.startsWith(UPLOAD_BUCKET_PREFIX)) {
    const bucketEnd = url.hostname.indexOf('.');
    return S3_HOST_PATTERN.test(url.hostname.slice(bucketEnd + 1));
  }
  // Path style: s3.<region>.amazonaws.com/<bucket>/...
  return S3_HOST_PATTERN.test(url.hostname) && url.pathname.startsWith(`/${UPLOAD_BUCKET_PREFIX}`);
};

/**
 * A pre-signed S3 URL carries its own expiry (X-Amz-Date + X-Amz-Expires).
 * Returns false when the URL has expired so a stale session stops showing the
 * capture UI. URLs without those params are treated as unexpired.
 */
const isUploadUrlUnexpired = (uploadUrl: string): boolean => {
  const params = new URL(uploadUrl).searchParams;
  const signedAt = params.get('X-Amz-Date');
  const expiresIn = Number(params.get('X-Amz-Expires'));
  const match = signedAt?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match || !Number.isFinite(expiresIn)) {
    return true;
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const signedAtMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return Date.now() < signedAtMs + expiresIn * 1000;
};

const parseSession = (value: unknown): BackgroundCaptureSession | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const { v, captureId, uploadUrl, deviceMode } = value as Record<string, unknown>;
  if (v !== 1 || typeof captureId !== 'string' || typeof uploadUrl !== 'string') {
    return null;
  }
  if (!isAllowedUploadUrl(uploadUrl) || !isUploadUrlUnexpired(uploadUrl)) {
    return null;
  }
  const parsedDeviceMode = parseBackgroundCaptureDeviceMode(deviceMode);
  return {
    captureId,
    uploadUrl,
    ...(parsedDeviceMode !== undefined ? { deviceMode: parsedDeviceMode } : {}),
  };
};

const decodeBase64Url = (value: string): string => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
};

const getSessionStorage = (): Storage | null => {
  try {
    return getGlobalScope()?.sessionStorage ?? null;
  } catch {
    return null;
  }
};

const readStoredSession = (): BackgroundCaptureSession | null => {
  const stored = getSessionStorage()?.getItem(BACKGROUND_CAPTURE_SESSION_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    const session = parseSession({ v: 1, ...JSON.parse(stored) });
    if (!session) {
      clearBackgroundCaptureSession();
    }
    return session;
  } catch {
    clearBackgroundCaptureSession();
    return null;
  }
};

const readBackgroundCaptureSession = (): BackgroundCaptureSession | null => {
  const globalScope = getGlobalScope() as Window | undefined;
  if (!globalScope?.location || globalScope.top !== globalScope) {
    return null;
  }

  const fragmentParams = new URLSearchParams(globalScope.location.hash.slice(1));
  const encoded = fragmentParams.get(BACKGROUND_CAPTURE_FRAGMENT_KEY);
  if (!encoded) {
    return readStoredSession();
  }

  // Remove the session from the address bar so it isn't bookmarked or shared.
  fragmentParams.delete(BACKGROUND_CAPTURE_FRAGMENT_KEY);
  const remainingHash = fragmentParams.toString();
  const { pathname, search } = globalScope.location;
  try {
    globalScope.history.replaceState(
      globalScope.history.state,
      '',
      `${pathname}${search}${remainingHash ? `#${remainingHash}` : ''}`,
    );
  } catch {
    // best-effort
  }

  let session: BackgroundCaptureSession | null;
  try {
    session = parseSession(JSON.parse(decodeBase64Url(encoded)));
  } catch {
    session = null;
  }
  if (!session) {
    return null;
  }

  try {
    getSessionStorage()?.setItem(BACKGROUND_CAPTURE_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage may be full or blocked; the session still works for this page load.
  }
  return session;
};

/**
 * Reads the capture session from the URL fragment (then removes it from the
 * address bar and keeps it in sessionStorage), or from sessionStorage on later
 * page loads in the same tab. Only the top-level window takes part, so frames
 * on the page (including the capture script's own device-preview iframe) never
 * start a second capture.
 *
 * Runs on every SDK init, so it never throws: any failure (e.g. storage access
 * blocked by the browser) means there is no capture session.
 */
export function getBackgroundCaptureSession(): BackgroundCaptureSession | null {
  try {
    return readBackgroundCaptureSession();
  } catch {
    return null;
  }
}

export function clearBackgroundCaptureSession(): void {
  try {
    getSessionStorage()?.removeItem(BACKGROUND_CAPTURE_SESSION_STORAGE_KEY);
  } catch {
    // best-effort
  }
}

/** Uploads the captured snapshot data to the session's pre-signed URL. */
export async function uploadBackgroundCapture(session: BackgroundCaptureSession, data: unknown): Promise<void> {
  const response = await fetch(session.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Background capture upload failed with status ${response.status}`);
  }
}
