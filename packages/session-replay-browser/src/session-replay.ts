import { getAnalyticsConnector, getGlobalScope } from '@amplitude/analytics-client-common';
import { Logger, returnWrapper } from '@amplitude/analytics-core';
import { Logger as ILogger } from '@amplitude/analytics-types';
import { pack, record } from '@amplitude/rrweb';
import { TargetingParameters } from '@amplitude/targeting';
import { createSessionReplayJoinedConfigGenerator } from './config/joined-config';
import { SessionReplayJoinedConfig, SessionReplayJoinedConfigGenerator } from './config/types';
import {
  BLOCK_CLASS,
  DEFAULT_SESSION_REPLAY_PROPERTY,
  MASK_TEXT_CLASS,
  SESSION_REPLAY_DEBUG_PROPERTY,
} from './constants';
import { createEventsManager } from './events/events-manager';
import { generateHashCode, isSessionInSample, maskFn } from './helpers';
import { SessionIdentifiers } from './identifiers';
import {
  AmplitudeSessionReplay,
  SessionReplayEventsManager as AmplitudeSessionReplayEventsManager,
  SessionReplayRemoteConfigFetch as AmplitudeSessionReplayRemoteConfigFetch,
  SessionReplaySessionIDBStore as AmplitudeSessionReplaySessionIDBStore,
  SessionIdentifiers as ISessionIdentifiers,
  SessionReplayOptions,
} from './typings/session-replay';

export class SessionReplay implements AmplitudeSessionReplay {
  name = '@amplitude/session-replay-browser';
  config: SessionReplayJoinedConfig | undefined;
  joinedConfigGenerator: SessionReplayJoinedConfigGenerator | undefined;
  identifiers: ISessionIdentifiers | undefined;
  remoteConfigFetch: AmplitudeSessionReplayRemoteConfigFetch | undefined;
  eventsManager: AmplitudeSessionReplayEventsManager | undefined;
  sessionIDBStore: AmplitudeSessionReplaySessionIDBStore | undefined;
  loggerProvider: ILogger;
  recordCancelCallback: ReturnType<typeof record> | null = null;

  constructor() {
    this.loggerProvider = new Logger();
  }

  init(apiKey: string, options: SessionReplayOptions) {
    return returnWrapper(this._init(apiKey, options));
  }

  removeInvalidSelectors() {
    if (!this.config?.privacyConfig) {
      return;
    }

    // This allows us to not search the DOM.
    const fragment = document.createDocumentFragment();

    const dropInvalidSelectors = (selectors: string[] | string = []): string[] | undefined => {
      if (typeof selectors === 'string') {
        selectors = [selectors];
      }
      selectors = selectors.filter((selector: string) => {
        try {
          fragment.querySelector(selector);
        } catch {
          this.loggerProvider.warn(`[session-replay-browser] omitting selector "${selector}" because it is invalid`);
          return false;
        }
        return true;
      });
      if (selectors.length === 0) {
        return undefined;
      }
      return selectors;
    };
    this.config.privacyConfig.blockSelector = dropInvalidSelectors(this.config.privacyConfig.blockSelector);
    this.config.privacyConfig.maskSelector = dropInvalidSelectors(this.config.privacyConfig.maskSelector);
    this.config.privacyConfig.unmaskSelector = dropInvalidSelectors(this.config.privacyConfig.unmaskSelector);
  }

  protected async _init(apiKey: string, options: SessionReplayOptions) {
    this.loggerProvider = options.loggerProvider || new Logger();
    this.identifiers = new SessionIdentifiers({ sessionId: options.sessionId, deviceId: options.deviceId });
    this.joinedConfigGenerator = await createSessionReplayJoinedConfigGenerator(apiKey, options);
    this.config = await this.joinedConfigGenerator.generateJoinedConfig(this.identifiers.sessionId);
    this.loggerProvider.debug(
      JSON.stringify(
        { name: 'session replay joined privacy config', privacyConfig: this.config.privacyConfig },
        null,
        2,
      ),
    );

    this.removeInvalidSelectors();

    this.eventsManager = await createEventsManager({
      config: this.config,
      sessionId: this.identifiers.sessionId,
    });

    this.loggerProvider.log('Installing @amplitude/session-replay-browser.');

    const globalScope = getGlobalScope();
    if (globalScope) {
      globalScope.removeEventListener('blur', this.blurListener);
      globalScope.removeEventListener('focus', this.focusListener);
      globalScope.addEventListener('blur', this.blurListener);
      globalScope.addEventListener('focus', this.focusListener);
    }

    if (globalScope && globalScope.document && globalScope.document.hasFocus()) {
      this.initialize(true);
    }
  }

  setSessionId(sessionId: number, deviceId?: string) {
    return returnWrapper(this.asyncSetSessionId(sessionId, deviceId));
  }

  async asyncSetSessionId(sessionId: number, deviceId?: string) {
    const previousSessionId = this.identifiers && this.identifiers.sessionId;
    if (previousSessionId) {
      this.stopRecordingAndSendEvents(previousSessionId);
    }

    const deviceIdForReplayId = deviceId || this.getDeviceId();
    this.identifiers = new SessionIdentifiers({
      sessionId: sessionId,
      deviceId: deviceIdForReplayId,
    });

    // If there is no previous session id, SDK is being initialized for the first time,
    // and config was just fetched in initialization, so no need to fetch it a second time
    if (this.joinedConfigGenerator && previousSessionId) {
      this.config = await this.joinedConfigGenerator.generateJoinedConfig(this.identifiers.sessionId);
    }
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
    this.initialize();
  };

  evaluateTargeting = async (targetingParams?: Pick<TargetingParameters, 'event' | 'userProperties'>) => {
    if (!this.identifiers || !this.identifiers.sessionId || !this.remoteConfigFetch || !this.config) {
      this.loggerProvider.error('Session replay init has not been called, cannot evaluate targeting.');
      return;
    }

    await this.remoteConfigFetch.evaluateTargeting({
      sessionId: this.identifiers.sessionId,
      deviceId: this.getDeviceId(),
      ...targetingParams,
    });
  };

  stopRecordingAndSendEvents(sessionId?: number) {
    this.stopRecordingEvents();

    const sessionIdToSend = sessionId || this.identifiers?.sessionId;
    const deviceId = this.getDeviceId();
    this.eventsManager &&
      sessionIdToSend &&
      deviceId &&
      this.eventsManager.sendCurrentSequenceEvents({ sessionId: sessionIdToSend, deviceId });
  }

  initialize(shouldSendStoredEvents = false) {
    if (!this.identifiers?.sessionId) {
      this.loggerProvider.log(`Session is not being recorded due to lack of session id.`);
      return;
    }

    const deviceId = this.getDeviceId();
    if (!deviceId) {
      this.loggerProvider.log(`Session is not being recorded due to lack of device id.`);
      return;
    }

    this.eventsManager &&
      shouldSendStoredEvents &&
      this.eventsManager.sendStoredEvents({
        deviceId,
      });

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
    if (!this.identifiers || !this.config || !this.identifiers.sessionId) {
      this.loggerProvider.error(`Session is not being recorded due to lack of config, please call sessionReplay.init.`);
      return false;
    }
    if (!this.config.captureEnabled) {
      this.loggerProvider.log(
        `Session ${this.identifiers.sessionId} not being captured due to capture being disabled for project.`,
      );
      return false;
    }

    const globalScope = getGlobalScope();
    if (!ignoreFocus && globalScope && globalScope.document && !globalScope.document.hasFocus()) {
      this.loggerProvider.log(
        `Session ${this.identifiers.sessionId} temporarily not recording due to lack of browser focus.`,
      );
      return false;
    }

    if (this.shouldOptOut()) {
      this.loggerProvider.log(`Opting session ${this.identifiers.sessionId} out of recording due to optOut config.`);
      return false;
    }

    const isInSample = isSessionInSample(this.identifiers.sessionId, this.config.sampleRate);
    if (!isInSample) {
      this.loggerProvider.log(`Opting session ${this.identifiers.sessionId} out of recording due to sample rate.`);
    }
    return isInSample;
  }

  getBlockSelectors(): string | string[] | undefined {
    // For some reason, this defaults to empty array ([]) if undefined in the compiled script.
    // Empty arrays cause errors when being evaluated in Safari.
    // Force the selector to be undefined if it's an empty array.
    const blockSelector = this.config?.privacyConfig?.blockSelector ?? [];
    if (blockSelector.length === 0) {
      return undefined;
    }
    return blockSelector;
  }

  getMaskTextSelectors(): string | undefined {
    if (this.config?.privacyConfig?.defaultMaskLevel === 'conservative') {
      return '*';
    }

    const maskSelector = this.config?.privacyConfig?.maskSelector;
    if (!maskSelector) {
      return;
    }

    return maskSelector as unknown as string;
  }

  recordEvents() {
    const shouldRecord = this.getShouldRecord();
    const sessionId = this.identifiers?.sessionId;
    if (!shouldRecord || !sessionId || !this.config) {
      return;
    }
    this.stopRecordingEvents();
    const privacyConfig = this.config.privacyConfig;

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
      inlineStylesheet: this.config.shouldInlineStylesheet,
      maskAllInputs: true,
      maskTextClass: MASK_TEXT_CLASS,
      blockClass: BLOCK_CLASS,
      // rrweb only exposes string type through its types, but arrays are also be supported. #class, ['#class', 'id']
      blockSelector: this.getBlockSelectors() as string | undefined,
      maskInputFn: maskFn('input', privacyConfig),
      maskTextFn: maskFn('text', privacyConfig),
      // rrweb only exposes string type through its types, but arrays are also be supported. since rrweb uses .matches() which supports arrays.
      maskTextSelector: this.getMaskTextSelectors(),
      recordCanvas: false,
      errorHandler: (error) => {
        const typedError = error as Error & { _external_?: boolean };

        // styled-components relies on this error being thrown and bubbled up, rrweb is otherwise suppressing it
        if (typedError.message.includes('insertRule') && typedError.message.includes('CSSStyleSheet')) {
          throw typedError;
        }

        // rrweb does monkey patching on certain window functions such as CSSStyleSheet.proptype.insertRule,
        // and errors from external clients calling these functions can get suppressed. Styled components depend
        // on these errors being re-thrown.
        if (typedError._external_) {
          throw typedError;
        }

        this.loggerProvider.warn('Error while recording: ', typedError.toString());
        // Return true so that we don't clutter user's consoles with internal rrweb errors
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
