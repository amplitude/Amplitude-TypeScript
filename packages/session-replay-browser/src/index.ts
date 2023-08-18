import sessionReplay from './session-replay-factory';
export const { init, setSessionId, getSessionRecordingProperties, teardown } = sessionReplay;
export { AmplitudeSessionReplay } from './typings/session-replay';
