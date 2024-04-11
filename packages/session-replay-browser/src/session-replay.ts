import { getAnalyticsConnector, getGlobalScope } from '@amplitude/analytics-client-common';
import { Logger, returnWrapper } from '@amplitude/analytics-core';
import { Logger as ILogger } from '@amplitude/analytics-types';
import { pack, record } from '@amplitude/rrweb';
import { TargetingParameters, evaluateTargeting } from '@amplitude/targeting';
import { SessionReplayConfig } from './config';
import {
  BLOCK_CLASS,
  DEFAULT_SESSION_REPLAY_PROPERTY,
  MASK_TEXT_CLASS,
  SESSION_REPLAY_DEBUG_PROPERTY,
} from './constants';
import { SessionReplayEventsManager } from './events-manager';
import { generateHashCode, generateSessionReplayId, isSessionInSample, maskInputFn } from './helpers';
import { SessionIdentifiers } from './identifiers';
import { SessionReplayRemoteConfigFetch } from './remote-config-fetch';
import { SessionReplaySessionIDBStore } from './session-idb-store';
import {
  AmplitudeSessionReplay,
  SessionReplayEventsManager as AmplitudeSessionReplayEventsManager,
  SessionReplayRemoteConfigFetch as AmplitudeSessionReplayRemoteConfigFetch,
  SessionReplaySessionIDBStore as AmplitudeSessionReplaySessionIDBStore,
  SessionIdentifiers as ISessionIdentifiers,
  SessionReplayConfig as ISessionReplayConfig,
  SessionReplayOptions,
} from './typings/session-replay';

export class SessionReplay implements AmplitudeSessionReplay {
  name = '@amplitude/session-replay-browser';
  config: ISessionReplayConfig | undefined;
  identifiers: ISessionIdentifiers | undefined;
  remoteConfigFetch: AmplitudeSessionReplayRemoteConfigFetch | undefined;
  eventsManager: AmplitudeSessionReplayEventsManager | undefined;
  sessionIDBStore: AmplitudeSessionReplaySessionIDBStore | undefined;
  loggerProvider: ILogger;
  recordCancelCallback: ReturnType<typeof record> | null = null;
  sessionTargetingMatch = false;

  constructor() {
    this.loggerProvider = new Logger();
  }

  init(apiKey: string, options: SessionReplayOptions) {
    return returnWrapper(this._init(apiKey, options));
  }

  protected async _init(apiKey: string, options: SessionReplayOptions) {
    this.config = new SessionReplayConfig(apiKey, options);
    this.loggerProvider = this.config.loggerProvider;
    this.identifiers = new SessionIdentifiers(options, this.loggerProvider);
    this.sessionIDBStore = new SessionReplaySessionIDBStore({
      loggerProvider: this.config.loggerProvider,
      apiKey: this.config.apiKey,
    });

    this.remoteConfigFetch = new SessionReplayRemoteConfigFetch({
      config: this.config,
      sessionIDBStore: this.sessionIDBStore,
    });
    this.eventsManager = new SessionReplayEventsManager({ config: this.config, sessionIDBStore: this.sessionIDBStore });

    this.loggerProvider.log('Installing @amplitude/session-replay-browser.');

    const globalScope = getGlobalScope();
    if (globalScope) {
      globalScope.removeEventListener('blur', this.blurListener);
      globalScope.removeEventListener('focus', this.focusListener);
      globalScope.addEventListener('blur', this.blurListener);
      globalScope.addEventListener('focus', this.focusListener);
    }

    if (globalScope && globalScope.document && globalScope.document.hasFocus()) {
      await this.initialize(true);
    }
  }

  setSessionId(sessionId: number, deviceId?: string) {
    if (!this.identifiers) {
      this.loggerProvider.error('Session replay init has not been called, cannot set session id.');
      return;
    }

    if (deviceId) {
      this.identifiers.deviceId = deviceId;
    }
    // use a consistent device id.
    const deviceIdForReplayId = this.getDeviceId();
    if (sessionId && deviceIdForReplayId) {
      this.identifiers.sessionReplayId = generateSessionReplayId(sessionId, deviceIdForReplayId);
    } else {
      this.loggerProvider.error('Must provide either session replay id or session id when starting a new session.');
      return;
    }

    this.stopRecordingAndSendEvents(this.identifiers.sessionId);
    this.identifiers.sessionId = sessionId;
    this.eventsManager && this.eventsManager.resetSequence();
    this.recordEvents();
  }

  getSessionReplayDebugPropertyValue() {
    let apiKeyHash = '';
    if (this.config) {
      apiKeyHash = generateHashCode(this.config.apiKey).toString();
    }
    return JSON.stringify({
      appHash: apiKeyHash,
    });
  }

  getSessionReplayProperties() {
    if (!this.config || !this.identifiers) {
      this.loggerProvider.error('Session replay init has not been called, cannot get session recording properties.');
      return {};
    }

    // If the user is in debug mode, ignore the focus handler when tagging events.
    // this is a common mishap when someone is developing locally and not seeing events getting tagged.
    const ignoreFocus = !!this.config.debugMode;
    const shouldRecord = this.getShouldRecord(ignoreFocus);

    if (shouldRecord) {
      const eventProperties: { [key: string]: string | null } = {
        [DEFAULT_SESSION_REPLAY_PROPERTY]: this.identifiers.sessionReplayId ? this.identifiers.sessionReplayId : null,
      };
      if (this.config.debugMode) {
        eventProperties[SESSION_REPLAY_DEBUG_PROPERTY] = this.getSessionReplayDebugPropertyValue();
      }
      return eventProperties;
    }

    return {};
  }

  blurListener = () => {
    this.stopRecordingAndSendEvents();
  };

  focusListener = () => {
    void this.initialize();
  };

  evaluateTargeting = async (targetingParams?: Pick<TargetingParameters, 'event' | 'userProperties'>) => {
    if (!this.identifiers || !this.identifiers.sessionId || !this.remoteConfigFetch || !this.config) {
      this.loggerProvider.error('Session replay init has not been called, cannot evaluate targeting.');
      return;
    }

    try {
      const targetingConfig = await this.remoteConfigFetch.getTargetingConfig(this.identifiers.sessionId);
      console.log('targetingConfig', targetingConfig);
      if (targetingConfig && Object.keys(targetingConfig).length > 0) {
        const targetingResult = evaluateTargeting({
          flag: targetingConfig,
          sessionId: this.identifiers.sessionId,
          deviceId: this.getDeviceId(),
          ...targetingParams,
        });
        this.sessionTargetingMatch =
          this.sessionTargetingMatch === false && targetingResult.sr_targeting_config.key === 'on';
        // todo, need to save this in idb too
      } else {
        this.sessionTargetingMatch = true;
      }
    } catch (err: unknown) {
      const knownError = err as Error;
      this.config.loggerProvider.warn(knownError.message);
    }
  };

  stopRecordingAndSendEvents(sessionId?: number) {
    this.stopRecordingEvents();

    const sessionIdToSend = sessionId || this.identifiers?.sessionId;
    const deviceId = this.getDeviceId();
    this.eventsManager &&
      sessionIdToSend &&
      deviceId &&
      this.eventsManager.sendEvents({ sessionId: sessionIdToSend, deviceId });
  }

  async initialize(shouldSendStoredEvents = false) {
    if (!this.identifiers?.sessionId) {
      this.loggerProvider.warn(`Session is not being recorded due to lack of session id.`);
      return;
    }

    const deviceId = this.getDeviceId();
    this.eventsManager &&
      deviceId &&
      (await this.eventsManager.initialize({
        sessionId: this.identifiers.sessionId,
        shouldSendStoredEvents,
        deviceId,
      }));

    let userProperties;
    if (this.config?.instanceName) {
      const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
      userProperties = identityStore.getIdentity().userProperties;
    }
    await this.evaluateTargeting({ userProperties });

    this.recordEvents();
  }

  shouldOptOut() {
    let identityStoreOptOut: boolean | undefined;
    if (this.config?.instanceName) {
      const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
      identityStoreOptOut = identityStore.getIdentity().optOut;
    }

    return identityStoreOptOut !== undefined ? identityStoreOptOut : this.config?.optOut;
  }

  getShouldRecord(ignoreFocus = false) {
    if (!this.identifiers || !this.config) {
      this.loggerProvider.error(`Session is not being recorded due to lack of config, please call sessionReplay.init.`);
      return false;
    }
    const globalScope = getGlobalScope();
    if (!ignoreFocus && globalScope && globalScope.document && !globalScope.document.hasFocus()) {
      if (this.identifiers.sessionId) {
        this.loggerProvider.log(
          `Session ${this.identifiers.sessionId} temporarily not recording due to lack of browser focus.`,
        );
      }
      return false;
    } else if (this.shouldOptOut()) {
      if (this.identifiers.sessionId) {
        this.loggerProvider.log(`Opting session ${this.identifiers.sessionId} out of recording due to optOut config.`);
      }
      return false;
    } else if (!this.identifiers.sessionId) {
      this.loggerProvider.warn(`Session is not being recorded due to lack of session id.`);
      return false;
    }

    const isInSample = isSessionInSample(this.identifiers.sessionId, this.config.sampleRate);
    if (!isInSample) {
      this.loggerProvider.log(`Opting session ${this.identifiers.sessionId} out of recording due to sample rate.`);
    }
    return isInSample;
  }

  getBlockSelectors(): string | string[] | undefined {
    return this.config?.privacyConfig?.blockSelector;
  }

  recordEvents() {
    const shouldRecord = this.getShouldRecord();
    const sessionId = this.identifiers?.sessionId;
    if (!shouldRecord || !sessionId) {
      return;
    }
    this.stopRecordingEvents();
    this.recordCancelCallback = record({
      emit: (event) => {
        const globalScope = getGlobalScope();
        if ((globalScope && globalScope.document && !globalScope.document.hasFocus()) || !this.getShouldRecord()) {
          this.stopRecordingAndSendEvents();
          return;
        }
        const eventString = JSON.stringify(event);
        const deviceId = this.getDeviceId();
        deviceId && this.eventsManager && this.eventsManager.addEvent({ event: eventString, sessionId, deviceId });
      },
      packFn: pack,
      maskAllInputs: true,
      maskTextClass: MASK_TEXT_CLASS,
      blockClass: BLOCK_CLASS,
      // rrweb only exposes array type through its types, but arrays are also be supported. #class, ['#class', 'id']
      blockSelector: this.getBlockSelectors() as string,
      maskInputFn,
      recordCanvas: false,
      errorHandler: (error) => {
        const typedError = error as Error;
        this.loggerProvider.warn('Error while recording: ', typedError.toString());

        return true;
      },
    });
  }

  stopRecordingEvents = () => {
    try {
      this.recordCancelCallback && this.recordCancelCallback();
      this.recordCancelCallback = null;
    } catch (error) {
      const typedError = error as Error;
      this.loggerProvider.warn(`Error occurred while stopping recording: ${typedError.toString()}`);
    }
  };

  getDeviceId() {
    let identityStoreDeviceId: string | undefined;
    if (this.config?.instanceName) {
      const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
      identityStoreDeviceId = identityStore.getIdentity().deviceId;
    }

    return identityStoreDeviceId || this.identifiers?.deviceId;
  }

  getSessionId() {
    return this.identifiers?.sessionId;
  }

  async flush(useRetry = false) {
    if (this.eventsManager) {
      return this.eventsManager.flush(useRetry);
    }
  }

  shutdown() {
    const globalScope = getGlobalScope();
    if (globalScope) {
      globalScope.removeEventListener('blur', this.blurListener);
      globalScope.removeEventListener('focus', this.focusListener);
    }

    this.stopRecordingAndSendEvents();
  }
}
