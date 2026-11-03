/* eslint-disable no-restricted-globals -- Browser-only jsdom host fixture. */
import type { SemanticHost } from '../src/types';

export function recorderContext() {
  const host: SemanticHost = { document, window, sdk: 'test', emit: jest.fn(), getPrivacy: () => ({}) };
  return { context: { host } };
}
