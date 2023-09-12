import sessionReplay from './session-replay-factory';
export const { init, setSessionId, getSessionRecordingProperties, getSessionReplayProperties, shutdown } =
  sessionReplay;
