export const getSuccessMessage = (sessionId: number) =>
  `Session replay event batch tracked successfully for session id ${sessionId}`;
export const UNEXPECTED_ERROR_MESSAGE = 'Unexpected error occurred';
export const UNEXPECTED_NETWORK_ERROR_MESSAGE = 'Network error occurred, event batch rejected';
export const MAX_RETRIES_EXCEEDED_MESSAGE = 'Session replay event batch rejected due to exceeded retry count';
export const STORAGE_FAILURE = 'Failed to store session replay events in IndexedDB';
export const MISSING_DEVICE_ID_MESSAGE = 'Session replay event batch not sent due to missing device ID';
export const MISSING_API_KEY_MESSAGE = 'Session replay event batch not sent due to missing api key';
