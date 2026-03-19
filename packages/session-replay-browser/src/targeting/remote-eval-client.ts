import { RemoteDecision } from '../config/types';

const AMPLITUDE_EVAL_URL = 'https://api.lab.amplitude.com/sdk/v2/vardata';

export async function fetchRemoteDecision(
  deploymentKey: string,
  user: { device_id?: string; user_id?: string },
  flagKey: string,
  timeoutMs: number,
): Promise<RemoteDecision> {
  const params = new URLSearchParams({ flag_keys: flagKey });
  if (user.device_id) params.set('device_id', user.device_id);
  if (user.user_id) params.set('user_id', user.user_id);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${AMPLITUDE_EVAL_URL}?${params.toString()}`, {
      headers: { Authorization: `Api-Key ${deploymentKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return { capture: false, reason: `http-${response.status}` };
    }
    const data = (await response.json()) as Record<string, { key?: string }>;
    const variantKey = data[flagKey]?.key;
    return { capture: variantKey === 'on' };
  } catch (error) {
    clearTimeout(timeoutId);
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return { capture: false, reason: isAbort ? 'timeout' : 'error' };
  }
}
