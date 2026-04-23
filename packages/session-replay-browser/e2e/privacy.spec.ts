import { test, expect } from '@playwright/test';
import {
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  captureTrackRequests,
  flushRecording,
  getSnapshotRoot,
  getLastSnapshotRoot,
  findById,
  getTextContent,
  isMaskedText,
} from './helpers';

function remoteConfigWithPrivacy(privacy: object) {
  return {
    configs: {
      sessionReplay: {
        sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 },
        sr_privacy_config: privacy,
      },
    },
  };
}

const PRIVACY_PAGE = '/session-replay-browser/sr-privacy-test.html';

// ─── CSS class-based privacy ──────────────────────────────────────────────────

test.describe('privacy — CSS classes', () => {
  test('amp-block class removes element from the snapshot entirely', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // rrweb removes blocked elements from the serialized tree entirely
    expect(findById(root!, 'amp-block-element')).toBeUndefined();
  });

  test('amp-mask class replaces text content with asterisks in the snapshot', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const el = findById(root!, 'amp-mask-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });
});

// ─── privacyConfig option ─────────────────────────────────────────────────────

test.describe('privacy — privacyConfig option', () => {
  test('blockSelector removes matching element from the snapshot entirely', async ({ page }) => {
    const privacyConfig = JSON.stringify({ blockSelector: ['#selector-blocked'] });
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // rrweb removes selector-blocked elements from the serialized tree entirely
    expect(findById(root!, 'selector-blocked')).toBeUndefined();
  });

  test('defaultMaskLevel conservative masks plain text content', async ({ page }) => {
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'conservative' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under conservative mode, even plain unhinted text is masked
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  test('defaultMaskLevel light does not mask plain text input values', async ({ page }) => {
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'light' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under light mode, a plain text input is NOT masked (only sensitive types are)
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);
  });

  test('defaultMaskLevel light still masks password input values', async ({ page }) => {
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'light' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under light mode, password inputs are still masked (they are sensitive)
    const passwordInput = findById(root!, 'password-input');
    expect(passwordInput).toBeDefined();
    const value = String(passwordInput!.attributes?.value ?? '');
    expect(isMaskedText(value)).toBe(true);
  });

  test('unmaskSelector overrides conservative masking for a specific element', async ({ page }) => {
    // defaultMaskLevel:'conservative' routes masking through maskTextFn (via maskTextSelector:'*').
    // unmaskSelector can override this for specific elements. Note: amp-mask CSS class masking is
    // applied natively by rrweb before maskTextFn is called and cannot be overridden this way.
    const privacyConfig = JSON.stringify({
      defaultMaskLevel: 'conservative',
      unmaskSelector: ['#plain-text'],
    });
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // #plain-text is in unmaskSelector — its text should be visible
    const plainEl = findById(root!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(getTextContent(plainEl!)).toContain('Hello visible world');
    expect(isMaskedText(getTextContent(plainEl!))).toBe(false);

    // amp-mask-text is NOT in unmaskSelector — its text should still be masked
    const maskedEl = findById(root!, 'amp-mask-text');
    expect(maskedEl).toBeDefined();
    expect(isMaskedText(getTextContent(maskedEl!))).toBe(true);
  });
});

// ─── amp-unmask CSS class (SR-2945) ──────────────────────────────────────────

test.describe('privacy — amp-unmask CSS class', () => {
  test('amp-unmask class unmasks text under conservative masking from remote config without explicit unmaskSelector', async ({
    page,
  }) => {
    // Before SR-2945, .amp-unmask had no effect unless the user explicitly added
    // '.amp-unmask' to privacyConfig.unmaskSelector. Now it's wired as a default.
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ defaultMaskLevel: 'conservative' }));
    const getBodies = await captureTrackRequests(page);

    // No local privacyConfig — masking comes entirely from remote config
    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // #amp-unmask-text has the .amp-unmask class — should NOT be masked
    const unmaskEl = findById(root!, 'amp-unmask-text');
    expect(unmaskEl).toBeDefined();
    expect(getTextContent(unmaskEl!)).toContain('Unmask class visible text');
    expect(isMaskedText(getTextContent(unmaskEl!))).toBe(false);

    // #plain-text has no special class — should be masked under conservative
    const plainEl = findById(root!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(isMaskedText(getTextContent(plainEl!))).toBe(true);
  });

  test('amp-unmask class unmasks text under conservative masking from local privacyConfig without explicit unmaskSelector', async ({
    page,
  }) => {
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'conservative' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // #amp-unmask-text has the .amp-unmask class — should NOT be masked
    const unmaskEl = findById(root!, 'amp-unmask-text');
    expect(unmaskEl).toBeDefined();
    expect(getTextContent(unmaskEl!)).toContain('Unmask class visible text');
    expect(isMaskedText(getTextContent(unmaskEl!))).toBe(false);

    // #plain-text has no special class — should be masked under conservative
    const plainEl = findById(root!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(isMaskedText(getTextContent(plainEl!))).toBe(true);
  });
});

// ─── Remote privacy config ────────────────────────────────────────────────────

test.describe('privacy — remote sr_privacy_config', () => {
  test('sr_privacy_config in remote config applies masking to plain text', async ({ page }) => {
    // No local privacyConfig — masking comes entirely from remote config
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ defaultMaskLevel: 'conservative' }));
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  test('remote urlMaskLevels conservative rule masks plain text end-to-end', async ({ page }) => {
    // P0: exercises the full remote → join → apply pipeline for urlMaskLevels.
    // No local privacyConfig — the conservative urlMaskLevels rule comes entirely from
    // sr_privacy_config. defaultMaskLevel is left at the default (medium) so text masking
    // is driven solely by the URL rule matching the test page.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        urlMaskLevels: [{ match: 'http://localhost:5173/session-replay-browser/*', maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // The conservative urlMaskLevels rule matches this page — plain text must be masked.
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });
});

// ─── urlMaskLevels — page-level masking overrides ─────────────────────────────
//
// The test page runs at http://localhost:5173/session-replay-browser/sr-privacy-test.html
// Glob patterns are anchored full-URL matches (globToRegex wraps with ^...$).

test.describe('privacy — urlMaskLevels (page-level masking)', () => {
  // Pattern that matches the test page URL.
  const MATCHING_PATTERN = 'http://localhost:5173/session-replay-browser/*';
  // Pattern that does NOT match the test page URL.
  const NON_MATCHING_PATTERN = 'http://localhost:5173/other-page/*';

  test('URL matches rule with conservative → plain text is masked', async ({ page }) => {
    // defaultMaskLevel is left at its default (medium) — the urlMaskLevels rule
    // overrides it to conservative for this specific page.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        urlMaskLevels: [{ match: MATCHING_PATTERN, maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // conservative mode masks all plain text
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  test('URL matches rule with light → plain text input is not masked', async ({ page }) => {
    // defaultMaskLevel is left at its default (medium) — the urlMaskLevels rule
    // overrides it to light for this specific page.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        urlMaskLevels: [{ match: MATCHING_PATTERN, maskLevel: 'light' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // light mode does NOT mask plain text inputs
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);
  });

  test('URL does not match any rule → defaultMaskLevel (conservative) masks plain text', async ({ page }) => {
    // The urlMaskLevels rule targets a different page, so it never fires.
    // defaultMaskLevel is 'conservative': plain text must still be masked even though
    // no URL rule matched. Mirrors the redis.io homepage scenario where the homepage
    // URL matches no rule and should fall back to conservative.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'conservative',
        urlMaskLevels: [{ match: NON_MATCHING_PATTERN, maskLevel: 'light' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under conservative (the unmatched fallback), plain text IS masked
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  test('URL does not match any rule → defaultMaskLevel (light) applies to plain text input', async ({ page }) => {
    // The urlMaskLevels rule targets a different page, so it never fires.
    // defaultMaskLevel is 'light': plain text inputs are NOT masked, but password
    // inputs remain masked. This distinguishes light from the no-match-at-all case.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: NON_MATCHING_PATTERN, maskLevel: 'conservative' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under light (the unmatched fallback), a plain text input is NOT masked
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);

    // password inputs are still masked under light
    const passwordInput = findById(root!, 'password-input');
    expect(passwordInput).toBeDefined();
    expect(isMaskedText(String(passwordInput!.attributes?.value ?? ''))).toBe(true);
  });

  test('urlMaskLevels light rule wins over defaultMaskLevel conservative', async ({ page }) => {
    // defaultMaskLevel is conservative but the urlMaskLevels rule overrides it to
    // light for this specific page — the per-URL rule takes precedence.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'conservative',
        urlMaskLevels: [{ match: MATCHING_PATTERN, maskLevel: 'light' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // The urlMaskLevels light override wins: plain text input is NOT masked
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);

    // password inputs are always masked regardless of mask level
    const passwordInput = findById(root!, 'password-input');
    expect(passwordInput).toBeDefined();
    expect(isMaskedText(String(passwordInput!.attributes?.value ?? ''))).toBe(true);
  });

  test('SPA navigation to unmatched URL falls back to conservative default and masks text', async ({ page }) => {
    // Regression test for the bugbot-identified privacy gap:
    // defaultMaskLevel:'conservative' + a non-conservative URL rule. Session starts on the test
    // page (MATCHING_PATTERN → light). After a SPA pushState to an unmatched URL, the effective
    // level falls back to 'conservative'. Because getMaskTextSelectors() now returns '*' in this
    // config (fix applied), rrweb routes all text through maskTextFn — which picks up the new URL
    // via the dynamic getter and masks text accordingly.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'conservative',
        urlMaskLevels: [{ match: MATCHING_PATTERN, maskLevel: 'light' }],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Simulate SPA navigation to a URL that matches no urlMaskLevels rule.
    // NOTE: MATCHING_PATTERN covers /session-replay-browser/*, so navigate outside that path.
    // The SDK's URL-change listener updates currentPageUrl; subsequent maskTextFn
    // calls then resolve to the conservative fallback.
    await page.evaluate(() => {
      history.pushState({}, '', '/other-section/dashboard');
      // Dispatch a focus event to make rrweb take a new full snapshot with the updated URL context.
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    // The LAST full snapshot was taken after the URL change — plain text must be masked.
    const root = getLastSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  test('SPA navigation from conservative URL to light URL still masks text', async ({ page }) => {
    // Verifies maskFn URL-awareness: session starts on a conservative URL rule, then navigates
    // to a light URL rule. Light masks text nodes (same as conservative), so plain text remains
    // masked after navigation.
    // Use exact URL patterns to avoid first-match-wins overlap with the wildcard MATCHING_PATTERN.
    const CONSERVATIVE_PATTERN = 'http://localhost:5173/session-replay-browser/sr-privacy-test.html*';
    const LIGHT_PATTERN = 'http://localhost:5173/section-light/*';
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'medium',
        urlMaskLevels: [
          { match: CONSERVATIVE_PATTERN, maskLevel: 'conservative' },
          { match: LIGHT_PATTERN, maskLevel: 'light' },
        ],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Initial snapshot: on the conservative URL — plain text should be masked.
    await flushRecording(page);
    const firstRoot = getSnapshotRoot(getBodies());
    expect(firstRoot).not.toBeNull();
    expect(isMaskedText(getTextContent(findById(firstRoot!, 'plain-text')!))).toBe(true);

    // Navigate to the light URL rule page via SPA pushState.
    await page.evaluate(() => {
      history.pushState({}, '', '/section-light/dashboard');
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    // The LAST full snapshot was taken on the light URL — plain text is still masked (light masks text).
    const lastRoot = getLastSnapshotRoot(getBodies());
    expect(lastRoot).not.toBeNull();
    const plainEl = findById(lastRoot!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(isMaskedText(getTextContent(plainEl!))).toBe(true);
  });

  test('SPA navigation from light URL to conservative URL masks text', async ({ page }) => {
    // Verifies maskFn URL-awareness in the other direction: session starts on a light URL,
    // navigates to a conservative URL — maskTextFn should pick up the new URL and mask text.
    // Use exact URL patterns to avoid first-match-wins overlap.
    const LIGHT_PATTERN = 'http://localhost:5173/session-replay-browser/sr-privacy-test.html*';
    const CONSERVATIVE_PATTERN = 'http://localhost:5173/section-secure/*';
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'medium',
        urlMaskLevels: [
          { match: LIGHT_PATTERN, maskLevel: 'light' },
          { match: CONSERVATIVE_PATTERN, maskLevel: 'conservative' },
        ],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Navigate to the conservative URL rule page via SPA pushState.
    await page.evaluate(() => {
      history.pushState({}, '', '/section-secure/checkout');
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    // The LAST full snapshot was taken on the conservative URL — plain text must be masked.
    const lastRoot = getLastSnapshotRoot(getBodies());
    expect(lastRoot).not.toBeNull();
    const plainEl = findById(lastRoot!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(isMaskedText(getTextContent(plainEl!))).toBe(true);
  });

  test('first-match-wins: second rule (light) applies when first rule does not match', async ({ page }) => {
    // P1: regression guard for rule evaluation order.
    // Three rules; only the second matches the test page URL.
    // Rule 1 (conservative): targets a different path — must NOT match.
    // Rule 2 (light):        targets the test page — MUST match and apply.
    // Rule 3 (conservative): also targets the test page but comes after rule 2 — must NOT be evaluated.
    // Effective level must be 'light': plain text input is NOT masked.
    await mockRemoteConfig(
      page,
      remoteConfigWithPrivacy({
        defaultMaskLevel: 'medium',
        urlMaskLevels: [
          { match: 'http://localhost:5173/other-section/*', maskLevel: 'conservative' },
          { match: 'http://localhost:5173/session-replay-browser/*', maskLevel: 'light' },
          { match: 'http://localhost:5173/session-replay-browser/*', maskLevel: 'conservative' },
        ],
      }),
    );
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Rule 2 (light) wins: plain text input is NOT masked.
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);

    // Password inputs are always masked regardless of mask level.
    const passwordInput = findById(root!, 'password-input');
    expect(passwordInput).toBeDefined();
    expect(isMaskedText(String(passwordInput!.attributes?.value ?? ''))).toBe(true);
  });
});
