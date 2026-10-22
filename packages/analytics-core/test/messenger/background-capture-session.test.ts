/**
 * @jest-environment jsdom
 */

import * as GlobalScope from '../../src/global-scope';
import {
  BACKGROUND_CAPTURE_FRAGMENT_KEY,
  clearBackgroundCaptureSession,
  getBackgroundCaptureSession,
  uploadBackgroundCapture,
} from '../../src/messenger/background-capture-session';

const STORAGE_KEY = 'amp-bc-capture-session';
const BUCKET_URL =
  'https://com-amplitude-page-backgrounds-prod.s3.us-west-2.amazonaws.com/page-backgrounds/1/captures/c.json';

const toAmzDate = (date: Date): string =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

const signedUrl = (base = BUCKET_URL, signedAt = new Date(), expiresIn = 1800): string =>
  `${base}?X-Amz-Date=${toAmzDate(signedAt)}&X-Amz-Expires=${expiresIn}&X-Amz-Signature=abc`;

const encode = (value: unknown): string =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const setFragment = (payload: unknown, extraHash = ''): void => {
  window.history.replaceState(
    null,
    '',
    `/shop/target?ref=1#${extraHash}${BACKGROUND_CAPTURE_FRAGMENT_KEY}=${encode(payload)}`,
  );
};

describe('getBackgroundCaptureSession', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  test('should read the session from the fragment, store it and strip it from the URL', () => {
    const uploadUrl = signedUrl();
    setFragment({ v: 1, captureId: 'capture-id', uploadUrl, deviceMode: 'tablet' });

    const session = getBackgroundCaptureSession();

    expect(session).toEqual({ captureId: 'capture-id', uploadUrl, deviceMode: 'tablet' });
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/shop/target?ref=1');
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) as string)).toEqual(session);
  });

  test('should keep the rest of the fragment', () => {
    setFragment({ v: 1, captureId: 'capture-id', uploadUrl: signedUrl() }, 'section=2&');

    getBackgroundCaptureSession();

    expect(window.location.hash).toBe('#section=2');
  });

  test('should read the stored session on later page loads', () => {
    const uploadUrl = signedUrl();
    setFragment({ v: 1, captureId: 'capture-id', uploadUrl });
    getBackgroundCaptureSession();

    expect(getBackgroundCaptureSession()).toEqual({ captureId: 'capture-id', uploadUrl });
  });

  test('should return null when there is no session', () => {
    expect(getBackgroundCaptureSession()).toBeNull();
  });

  test('should accept path-style bucket URLs', () => {
    const uploadUrl = signedUrl('https://s3.us-west-2.amazonaws.com/com-amplitude-page-backgrounds-stag2/key.json');
    setFragment({ v: 1, captureId: 'capture-id', uploadUrl });

    expect(getBackgroundCaptureSession()?.uploadUrl).toBe(uploadUrl);
  });

  test.each([
    ['another host', signedUrl('https://attacker.example.com/upload')],
    ['another bucket', signedUrl('https://some-other-bucket.s3.us-west-2.amazonaws.com/key')],
    [
      'a lookalike host',
      signedUrl('https://com-amplitude-page-backgrounds-prod.s3.amazonaws.com.attacker.example.com/k'),
    ],
    ['another bucket, path style', signedUrl('https://s3.us-west-2.amazonaws.com/other-bucket/key')],
    ['http', signedUrl(BUCKET_URL.replace('https:', 'http:'))],
    ['an expired URL', signedUrl(BUCKET_URL, new Date(Date.now() - 31 * 60 * 1000), 1800)],
  ])('should reject %s', (_label, uploadUrl) => {
    setFragment({ v: 1, captureId: 'capture-id', uploadUrl });

    expect(getBackgroundCaptureSession()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    // The fragment is still removed from the address bar.
    expect(window.location.hash).toBe('');
  });

  test.each([
    ['an unknown version', { v: 2, captureId: 'capture-id', uploadUrl: signedUrl() }],
    ['a missing captureId', { v: 1, uploadUrl: signedUrl() }],
    ['a non-object', 'nope'],
  ])('should reject %s', (_label, payload) => {
    setFragment(payload);

    expect(getBackgroundCaptureSession()).toBeNull();
  });

  test('should reject a fragment that is not valid base64 JSON', () => {
    window.history.replaceState(null, '', `/#${BACKGROUND_CAPTURE_FRAGMENT_KEY}=%%%`);

    expect(getBackgroundCaptureSession()).toBeNull();
  });

  test('should drop a stored session once it expires', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        captureId: 'capture-id',
        uploadUrl: signedUrl(BUCKET_URL, new Date(Date.now() - 31 * 60 * 1000), 1800),
      }),
    );

    expect(getBackgroundCaptureSession()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('should drop a stored session that is not valid JSON', () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{');

    expect(getBackgroundCaptureSession()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('should reject an upload URL that is not a URL', () => {
    setFragment({ v: 1, captureId: 'capture-id', uploadUrl: 'not a url' });

    expect(getBackgroundCaptureSession()).toBeNull();
  });

  test('should accept an upload URL without expiry params', () => {
    setFragment({ v: 1, captureId: 'capture-id', uploadUrl: BUCKET_URL });

    expect(getBackgroundCaptureSession()?.uploadUrl).toBe(BUCKET_URL);
  });

  test('should still return the session when sessionStorage is unavailable', () => {
    const uploadUrl = signedUrl();
    setFragment({ v: 1, captureId: 'capture-id', uploadUrl });
    jest.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(getBackgroundCaptureSession()).toEqual({ captureId: 'capture-id', uploadUrl });
    // A later page load has nowhere to read the session from.
    expect(getBackgroundCaptureSession()).toBeNull();
    expect(() => clearBackgroundCaptureSession()).not.toThrow();

    jest.restoreAllMocks();
  });

  test('should return null instead of throwing when reading storage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(getBackgroundCaptureSession()).toBeNull();

    jest.restoreAllMocks();
  });

  test('should still return the session when storing it fails', () => {
    const uploadUrl = signedUrl();
    setFragment({ v: 1, captureId: 'capture-id', uploadUrl });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(getBackgroundCaptureSession()).toEqual({ captureId: 'capture-id', uploadUrl });

    jest.restoreAllMocks();
  });

  test('should return null outside a browser', () => {
    jest.spyOn(GlobalScope, 'getGlobalScope').mockReturnValue(undefined);

    expect(getBackgroundCaptureSession()).toBeNull();
    expect(() => clearBackgroundCaptureSession()).not.toThrow();

    jest.restoreAllMocks();
  });

  test('should ignore the session inside frames', () => {
    setFragment({ v: 1, captureId: 'capture-id', uploadUrl: signedUrl() });
    jest.spyOn(window, 'top', 'get').mockReturnValue({} as Window);

    expect(getBackgroundCaptureSession()).toBeNull();

    jest.restoreAllMocks();
  });
});

describe('clearBackgroundCaptureSession', () => {
  test('should remove the stored session', () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{}');

    clearBackgroundCaptureSession();

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('uploadBackgroundCapture', () => {
  const session = { captureId: 'capture-id', uploadUrl: signedUrl() };

  afterEach(() => {
    delete (global as any).fetch;
  });

  test('should PUT the data as JSON to the upload URL', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await uploadBackgroundCapture(session, { pageUrl: 'https://example.com' });

    expect((global as any).fetch).toHaveBeenCalledWith(session.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageUrl: 'https://example.com' }),
    });
  });

  test('should throw when the upload fails', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

    await expect(uploadBackgroundCapture(session, {})).rejects.toThrow(
      'Background capture upload failed with status 403',
    );
  });
});
