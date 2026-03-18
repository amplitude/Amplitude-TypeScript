import { Route } from '@playwright/test';

export const SR_API_SUCCESS = { code: 200 };
export const TEST_SESSION_ID = 1700000000000; // fixed timestamp always in sample at 100%

export const remoteConfigRecording = {
  configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 } } },
};

export function mockRemoteConfig(page: import('@playwright/test').Page, body: object) {
  return page.route('https://sr-client-cfg.amplitude.com/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

export function buildUrl(path: string, params: Record<string, string | number | boolean> = {}): string {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return `${path}?${qs.toString()}`;
}

export async function waitForReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => (window as any).srReady === true, { timeout: 10_000 });
}
