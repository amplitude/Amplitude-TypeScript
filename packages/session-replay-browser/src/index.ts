import sessionReplay from './session-replay-factory';
export const { init, setSessionId, getSessionReplayProperties, shutdown, flush } = sessionReplay;
export { AmplitudeSessionReplay } from './typings/session-replay';
