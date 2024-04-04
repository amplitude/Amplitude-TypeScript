import { Logger as ILogger } from '@amplitude/analytics-types';
import * as IDBKeyVal from 'idb-keyval';
import { MAX_IDB_STORAGE_LENGTH, STORAGE_PREFIX, defaultSessionStore } from './constants';
import { STORAGE_FAILURE } from './messages';
import {
  SessionReplaySessionIDBStore as AmplitudeSessionReplaySessionIDBStore,
  Events,
  IDBStore,
  IDBStoreSession,
  RecordingStatus,
} from './typings/session-replay';

export class SessionReplaySessionIDBStore implements AmplitudeSessionReplaySessionIDBStore {
  apiKey: string | undefined;
  storageKey = '';
  loggerProvider: ILogger;
  constructor({ apiKey, loggerProvider }: { apiKey: string; loggerProvider: ILogger }) {
    this.loggerProvider = loggerProvider;
    this.storageKey = `${STORAGE_PREFIX}_${apiKey.substring(0, 10)}`;
  }

  async getAllSessionDataFromStore() {
    try {
      const storedReplaySessionContexts: IDBStore | undefined = await IDBKeyVal.get(this.storageKey);

      return storedReplaySessionContexts;
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  }

  async storeEventsForSession(events: Events, sequenceId: number, sessionId: number) {
    try {
      await IDBKeyVal.update(this.storageKey, (sessionMap: IDBStore = {}): IDBStore => {
        const session: IDBStoreSession = sessionMap[sessionId] || { ...defaultSessionStore };
        session.currentSequenceId = sequenceId;

        const currentSequence = (session.sessionSequences && session.sessionSequences[sequenceId]) || {};

        currentSequence.events = events;
        currentSequence.status = RecordingStatus.RECORDING;

        return {
          ...sessionMap,
          [sessionId]: {
            ...session,
            sessionSequences: {
              ...session.sessionSequences,
              [sequenceId]: currentSequence,
            },
          },
        };
      });
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
  }

  async cleanUpSessionEventsStore(sessionId: number, sequenceId: number) {
    try {
      await IDBKeyVal.update(this.storageKey, (sessionMap: IDBStore = {}): IDBStore => {
        const session: IDBStoreSession = sessionMap[sessionId];
        const sequenceToUpdate = session?.sessionSequences && session.sessionSequences[sequenceId];
        if (!sequenceToUpdate) {
          return sessionMap;
        }

        sequenceToUpdate.events = [];
        sequenceToUpdate.status = RecordingStatus.SENT;

        // Delete sent sequences for current session
        Object.entries(session.sessionSequences).forEach(([storedSeqId, sequence]) => {
          const numericStoredSeqId = parseInt(storedSeqId, 10);
          if (sequence.status === RecordingStatus.SENT && sequenceId !== numericStoredSeqId) {
            delete session.sessionSequences[numericStoredSeqId];
          }
        });

        // Delete any sessions that are older than 3 days
        Object.keys(sessionMap).forEach((sessionId: string) => {
          const numericSessionId = parseInt(sessionId, 10);
          if (Date.now() - numericSessionId >= MAX_IDB_STORAGE_LENGTH) {
            delete sessionMap[numericSessionId];
          }
        });

        return sessionMap;
      });
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
  }
}
