import { getAnalyticsConnector, getGlobalScope } from '@amplitude/analytics-client-common';
import { Logger, returnWrapper } from '@amplitude/analytics-core';
import { Event, Logger as ILogger, LogLevel } from '@amplitude/analytics-types';
import { pack, record } from '@amplitude/rrweb';
import { scrollCallback } from '@amplitude/rrweb-types';
import { createSessionReplayJoinedConfigGenerator } from './config/joined-config';
import { SessionReplayJoinedConfig, SessionReplayJoinedConfigGenerator } from './config/types';
import {
  BLOCK_CLASS,
  DEFAULT_SESSION_REPLAY_PROPERTY,
  INTERACTION_MAX_INTERVAL,
  INTERACTION_MIN_INTERVAL,
  MASK_TEXT_CLASS,
  SESSION_REPLAY_DEBUG_PROPERTY,
} from './constants';
import { createEventsManager } from './events/events-manager';
import { MultiEventManager } from './events/multi-manager';
import { generateHashCode, isSessionInSample, maskFn } from './helpers';
import { clickBatcher, clickHook } from './hooks/click';
import { ScrollWatcher } from './hooks/scroll';
import { SessionIdentifiers } from './identifiers';
import { evaluateTargetingAndStore } from './targeting/targeting-manager';
import {
  AmplitudeSessionReplay,
  SessionReplayEventsManager as AmplitudeSessionReplayEventsManager,
  EventType,
  EventsManagerWithType,
  SessionIdentifiers as ISessionIdentifiers,
  SessionReplayOptions,
} from './typings/session-replay';

type PageLeaveFn = (e: PageTransitionEvent | Event) => void;

export class SessionReplay implements AmplitudeSessionReplay {
  name = '@amplitude/session-replay-browser';
  config: SessionReplayJoinedConfig | undefined;
  joinedConfigGenerator: SessionReplayJoinedConfigGenerator | undefined;
  identifiers: ISessionIdentifiers | undefined;
  eventsManager?: AmplitudeSessionReplayEventsManager<'replay' | 'interaction', string>;
  loggerProvider: ILogger;
  recordCancelCallback: ReturnType<typeof record> | null = null;
  sessionTargetingMatch = false;

  // Visible for testing
  pageLeaveFns: PageLeaveFn[] = [];
  private scrollHook?: scrollCallback;

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

  private teardownEventListeners = (teardown: boolean) => {
    const globalScope = getGlobalScope();
    if (globalScope) {
      globalScope.removeEventListener('blur', this.blurListener);
      globalScope.removeEventListener('focus', this.focusListener);
      !teardown && globalScope.addEventListener('blur', this.blurListener);
      !teardown && globalScope.addEventListener('focus', this.focusListener);
      // prefer pagehide to unload events, this is the standard going forward. it is not
      // 100% reliable, but is bfcache-compatible.
      if (globalScope.self && 'onpagehide' in globalScope.self) {
        globalScope.removeEventListener('pagehide', this.pageLeaveListener);
        !teardown && globalScope.addEventListener('pagehide', this.pageLeaveListener);
      } else {
        // this has performance implications, but is the only way we can reliably send events
        // in browser that don't support pagehide.
        globalScope.removeEventListener('beforeunload', this.pageLeaveListener);
        !teardown && globalScope.addEventListener('beforeunload', this.pageLeaveListener);
      }
    }
  };

  protected async _init(apiKey: string, options: SessionReplayOptions) {
    this.loggerProvider = options.loggerProvider || new Logger();
    Object.prototype.hasOwnProperty.call(options, 'logLevel') &&
      this.loggerProvider.enable(options.logLevel as LogLevel);
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

    if (options.sessionId && this.config.interactionConfig?.enabled) {
      const scrollWatcher = ScrollWatcher.default(
        {
          sessionId: options.sessionId,
          type: 'interaction',
        },
        this.config,
      );
      this.pageLeaveFns = [scrollWatcher.send(this.getDeviceId.bind(this))];
      this.scrollHook = scrollWatcher.hook.bind(scrollWatcher);
    }

    this.removeInvalidSelectors();

    const managers: EventsManagerWithType<EventType, string>[] = [];
    const rrwebEventManager = await createEventsManager<'replay'>({
      config: this.config,
      sessionId: this.identifiers.sessionId,
      type: 'replay',
    });
    managers.push({ name: 'replay', manager: rrwebEventManager });

    if (this.config.interactionConfig?.enabled) {
      const interactionEventManager = await createEventsManager<'interaction'>({
        config: this.config,
        sessionId: this.identifiers.sessionId,
        type: 'interaction',
        minInterval: this.config.interactionConfig.trackEveryNms ?? INTERACTION_MIN_INTERVAL,
        maxInterval: INTERACTION_MAX_INTERVAL,
        payloadBatcher: clickBatcher,
      });
      managers.push({ name: 'interaction', manager: interactionEventManager });
    }

    this.eventsManager = new MultiEventManager<'replay' | 'interaction', string>(...managers);

    this.loggerProvider.log('Installing @amplitude/session-replay-browser.');

    this.teardownEventListeners(false);

    const globalScope = getGlobalScope();
    if (globalScope && globalScope.document && globalScope.document.hasFocus()) {
      await this.initialize(true);
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
    await this.evaluateTargetingAndRecord();
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
  /**
   * This is an instance member so that if init is called multiple times
   * it doesn't add another listener to the page leave event. This is to
   * prevent duplicate listener actions from firing.
   */
  private pageLeaveListener = (e: PageTransitionEvent | Event) => {
    this.pageLeaveFns.forEach((fn) => {
      fn(e);
    });
  };

  evaluateTargetingAndRecord = async (options?: { event?: Event }) => {
    if (!this.identifiers || !this.identifiers.sessionId || !this.config) {
      this.loggerProvider.error('Session replay init has not been called, cannot evaluate targeting.');
      return;
    }

    let userProperties;
    if (this.config.instanceName) {
      const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
      userProperties = identityStore.getIdentity().userProperties;
    }
    this.sessionTargetingMatch = await evaluateTargetingAndStore({
      sessionId: this.identifiers.sessionId,
      config: this.config,
      targetingParams: { userProperties, event: options?.event },
    });

    if (this.sessionTargetingMatch) {
      this.recordEvents();
    }
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

  async initialize(shouldSendStoredEvents = false) {
    if (!this.identifiers?.sessionId) {
      this.loggerProvider.log(`Session is not being recorded due to lack of session id.`);
      return;
    }

    const deviceId = this.getDeviceId();
    if (!deviceId) {
      this.loggerProvider.log(`Session is not being recorded due to lack of device id.`);
      return;
    }
    this.eventsManager && shouldSendStoredEvents && this.eventsManager.sendStoredEvents({ deviceId });

    await this.evaluateTargetingAndRecord();
  }

  shouldOptOut() {
    let identityStoreOptOut: boolean | undefined;
    if (this.config?.instanceName) {
      const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
      identityStoreOptOut = identityStore.getIdentity().optOut;
    }

    return identityStoreOptOut !== undefined ? identityStoreOptOut : this.config?.optOut;
  }

  getShouldRecord = (ignoreFocus = false) => {
    if (!this.identifiers || !this.config || !this.identifiers.sessionId) {
      this.loggerProvider.warn(`Session is not being recorded due to lack of config, please call sessionReplay.init.`);
      return false;
    }
    if (!this.config.captureEnabled) {
      this.loggerProvider.log(
        `Session ${this.identifiers.sessionId} not being captured due to capture being disabled for project.`,
      );
      return false;
    }

    if (!this.sessionTargetingMatch) {
      this.loggerProvider.log(
        `Session ${this.identifiers.sessionId} not recording due to not matching targeting conditions.`,
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
      return false;
    }

    return true;
  };

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
        this.eventsManager &&
          deviceId &&
          this.eventsManager.addEvent({ event: { type: 'replay', data: eventString }, sessionId, deviceId });
      },
      packFn: pack,
      inlineStylesheet: this.config.shouldInlineStylesheet,
      hooks: {
        mouseInteraction:
          this.eventsManager &&
          clickHook({
            eventsManager: this.eventsManager,
            sessionId,
            deviceIdFn: this.getDeviceId.bind(this),
          }),
        scroll: this.scrollHook,
      },
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
    return this.eventsManager?.flush(useRetry);
  }

  shutdown() {
    this.teardownEventListeners(true);
    this.stopRecordingAndSendEvents();
  }
}
