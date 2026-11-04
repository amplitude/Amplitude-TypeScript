/* eslint-disable no-restricted-globals -- Browser-only jsdom host fixture. */
import type { SemanticHost as Host, RecorderContext as Context, SemanticRecorder as Recorder } from '../src/types';

export type TestPayloads = { diagnostic: object; sample: { state: 'hidden' | 'visible' } };
export type SemanticHost = Host<TestPayloads>;
export type RecorderContext = Context<TestPayloads>;
export type SemanticRecorder = Recorder<TestPayloads>;

export function recorderContext() {
  const host: SemanticHost = { document, window, emit: jest.fn() };
  return { context: { host } };
}
