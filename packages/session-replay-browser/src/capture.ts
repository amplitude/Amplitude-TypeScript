import { getAnalyticsConnector, getGlobalScope } from '@amplitude/analytics-client-common';
import { Logger } from '@amplitude/analytics-core';
import { Logger as ILogger, LogLevel } from '@amplitude/analytics-types';
import { record, pack } from '@amplitude/rrweb';
import { listenerHandler, scrollCallback } from '@amplitude/rrweb-types';
import { createSessionReplayJoinedConfigGenerator } from './config/joined-config';
import { SessionReplayJoinedConfig } from './config/types';
import {
  BLOCK_CLASS,
  CustomRRwebEvent,
  INTERACTION_MAX_INTERVAL,
  INTERACTION_MIN_INTERVAL,
  MASK_TEXT_CLASS,
} from './constants';
import { createEventsManager } from './events/events-manager';
import { MultiEventManager } from './events/multi-manager';
import { getDebugConfig, isSessionInSample, maskFn } from './helpers';
import { clickBatcher, clickHook, clickNonBatcher } from './hooks/click';
import { ScrollWatcher } from './hooks/scroll';
import {
  DebugInfo,
  SessionReplayEventsManager as EventsManager,
  EventsManagerWithType,
  EventType,
  SessionReplayOptions,
} from './typings/session-replay';
import { VERSION } from './version';

type PageLeaveFn = (e: PageTransitionEvent | Event) => void;
type ScrollOptions = {
  scrollHook: scrollCallback;
  pageLeaveFns: PageLeaveFn[];
};

export class SessionReplayCapture {
  private readonly config: SessionReplayJoinedConfig;
  private readonly sessionId: number;
  private readonly deviceId: string;
  private readonly loggerProvider: ILogger;
  private readonly eventsManager: EventsManager<EventType, string>;
  private readonly canCaptureSession: boolean;
  // eslint-disable-next-line no-restricted-globals
  private readonly globalScope: typeof globalThis;

  private readonly eventListeners: Record<'blur' | 'focus' | 'pageleave', (e: PageTransitionEvent | Event) => void>;

  private readonly scrollHook?: scrollCallback;

  // If this is defined, we are capturing.
  private captureCallback: listenerHandler | null = null;

  constructor(
    manager: EventsManager<EventType, string>,
    config: SessionReplayJoinedConfig,
    sessionId: number,
    deviceId: string,
    // eslint-disable-next-line no-restricted-globals
    globalScope: typeof globalThis,
    scrollOptions?: ScrollOptions,
    loggerProvider: ILogger = new Logger(),
  ) {
    this.config = Object.freeze(config);
    this.eventsManager = Object.freeze(manager);
    this.loggerProvider = loggerProvider;
    this.globalScope = globalScope;

    this.sessionId = sessionId;
    this.deviceId = deviceId;
    this.scrollHook = scrollOptions?.scrollHook;
    this.canCaptureSession = this.checkCaptureEnabledAndSampleRate();

    this.eventListeners = {
      blur: () => {
        this.sendEvents();
      },
      focus: () => {
        this.start();
      },
      pageleave: (e: PageTransitionEvent | Event) => {
        scrollOptions?.pageLeaveFns.forEach((fn) => {
          fn(e);
        });
      },
    };
  }

  private registerEventListeners(teardown: boolean): void {
    const eventListenerFn = teardown ? this.globalScope.removeEventListener : this.globalScope.addEventListener;

    eventListenerFn('blur', this.eventListeners['blur']);
    eventListenerFn('focus', this.eventListeners['focus']);
    // prefer pagehide to unload events, this is the standard going forward. it is not
    // 100% reliable, but is bfcache-compatible.
    if (this.globalScope.self && 'onpagehide' in this.globalScope.self) {
      eventListenerFn('pagehide', this.eventListeners['pageleave']);
    } else {
      // this has performance implications, but is the only way we can reliably send events
      // in browser that don't support pagehide.
      eventListenerFn('beforeunload', this.eventListeners['pageleave']);
    }
  }

  private checkCaptureEnabledAndSampleRate(): boolean {
    if (!this.config.captureEnabled) {
      this.loggerProvider.log(
        `Session ${this.sessionId} not being captured due to capture being disabled for project or because the remote config could not be fetched.`,
      );
      return false;
    }

    const isInSample = isSessionInSample(this.sessionId, this.config.sampleRate);
    if (!isInSample) {
      this.loggerProvider.log(`Opting session ${this.sessionId} out of recording due to sample rate.`);
    }
    return isInSample;
  }

  private shouldOptOut() {
    let identityStoreOptOut: boolean | undefined;
    if (this.config.instanceName) {
      const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
      identityStoreOptOut = identityStore.getIdentity().optOut;
      return identityStoreOptOut ?? this.config.optOut;
    }

    return this.config.optOut;
  }

  private getMaskTextSelectors(): string | undefined {
    if (this.config.privacyConfig?.defaultMaskLevel === 'conservative') {
      return '*';
    }

    const maskSelector = this.config?.privacyConfig?.maskSelector;
    if (!maskSelector) {
      return;
    }

    return maskSelector as unknown as string;
  }

  private getBlockSelectors(): string | string[] | undefined {
    // For some reason, this defaults to empty array ([]) if undefined in the compiled script.
    // Empty arrays cause errors when being evaluated in Safari.
    // Force the selector to be undefined if it's an empty array.
    const blockSelector = this.config.privacyConfig?.blockSelector ?? [];
    if (blockSelector.length === 0) {
      return undefined;
    }
    return blockSelector;
  }

  private sendEvents() {
    this.eventsManager.sendCurrentSequenceEvents({ sessionId: this.sessionId, deviceId: this.deviceId });
  }

  /**
   * Immediately sends all events.
   */
  async flush(useRetry = false) {
    return this.eventsManager.flush(useRetry);
  }

  /**
   * Adds a custom RRweb event that can be used for individual replay debugging.
   */
  async debug(eventName: CustomRRwebEvent, eventData: Record<string, unknown> = {}): Promise<void> {
    try {
      let debugInfo: DebugInfo | undefined = undefined;
      if (this.config) {
        debugInfo = {
          config: getDebugConfig(this.config),
          version: VERSION,
        };
      }
      // Check first to ensure we are recording
      if (this.captureCallback) {
        record.addCustomEvent(eventName, {
          ...eventData,
          ...debugInfo,
        });
      } else {
        this.loggerProvider.debug(
          `Not able to add custom replay capture event ${eventName} due to no ongoing recording.`,
        );
      }
    } catch (e) {
      this.loggerProvider.debug('Error while adding custom replay capture event: ', e);
    }
  }

  /**
   * Whether or not to control capturing based off of web events.
   */
  listen(enable: boolean): void {
    this.registerEventListeners(!enable);
  }

  /**
   * Returns true if this client is able to capture either because the session is in the sample or
   * the user has not opted out.
   */
  canCapture(): boolean {
    return this.canCaptureSession && !this.shouldOptOut();
  }

  /**
   * Starts RRweb capture, does nothing if capture already started. To restart capture caller must call
   * `stop` first.
   * @returns true if capture is successfully started.
   */
  start() {
    const shouldRecord = this.captureCallback == null && this.canCapture();
    if (!shouldRecord) {
      return;
    }
    const { privacyConfig } = this.config;
    this.loggerProvider.log(`Session Replay capture beginning for session ID ${this.sessionId}.`);
    this.captureCallback =
      record({
        emit: (event) => {
          if (this.shouldOptOut()) {
            this.loggerProvider.log(`Opting session ${this.sessionId} out of recording due to optOut config.`);
            this.stop();
            this.sendEvents();
            return;
          }
          const eventString = JSON.stringify(event);
          this.eventsManager.addEvent({
            event: { type: 'replay', data: eventString },
            sessionId: this.sessionId,
            deviceId: this.deviceId,
          });
        },
        packFn: pack,
        inlineStylesheet: this.config?.shouldInlineStylesheet,
        hooks: {
          mouseInteraction: clickHook({
            eventsManager: this.eventsManager,
            sessionId: this.sessionId,
            deviceIdFn: () => this.deviceId,
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

          // this.loggerProvider.warn('Error while capturing replay: ', typedError.toString());
          // Return true so that we don't clutter user's consoles with internal rrweb errors
          return true;
        },
      }) ?? null;

    void this.debug(CustomRRwebEvent.DEBUG_INFO);
    return this.captureCallback != null;
  }

  /**
   * Stops RRweb capture, but does not remove event listeners or send events.
   * @returns true if the capture was successfully stopped.
   */
  stop(): boolean {
    try {
      this.loggerProvider.log(`Session Replay capture stopping for session ID ${this.sessionId}`);
      if (this.captureCallback) {
        this.captureCallback();
        this.captureCallback = null;
      }
    } catch (error) {
      const typedError = error as Error;
      this.loggerProvider.warn(`Error occurred while stopping replay capture: ${typedError.toString()}`);
      return false;
    }
    return true;
  }

  /**
   * Initializes a client for session replay capture, but capture only starts on focus or if manually called.
   */
  static async init(
    apiKey: string,
    sessionId: number,
    deviceId: string,
    options: SessionReplayOptions,
  ): Promise<SessionReplayCapture> {
    const loggerProvider = options.loggerProvider || new Logger();
    Object.prototype.hasOwnProperty.call(options, 'logLevel') && loggerProvider.enable(options.logLevel as LogLevel);

    const joinedConfigGenerator = await createSessionReplayJoinedConfigGenerator(apiKey, options);
    const config = await joinedConfigGenerator.generateJoinedConfig(sessionId);

    let scrollOptions: ScrollOptions | undefined = undefined;

    if (sessionId && config.interactionConfig?.enabled) {
      const scrollWatcher = ScrollWatcher.default(
        {
          sessionId,
          type: 'interaction',
        },
        config,
      );
      const pageLeaveFns = [scrollWatcher.send(() => deviceId)];
      const scrollHook = scrollWatcher.hook.bind(scrollWatcher);

      scrollOptions = {
        pageLeaveFns,
        scrollHook,
      };
    }

    const managers: EventsManagerWithType<EventType, string>[] = [];
    const rrwebEventManager = await createEventsManager<'replay'>({
      config,
      sessionId,
      type: 'replay',
    });
    managers.push({ name: 'replay', manager: rrwebEventManager });

    if (config.interactionConfig?.enabled) {
      const payloadBatcher = config.interactionConfig.batch ? clickBatcher : clickNonBatcher;
      const interactionEventManager = await createEventsManager<'interaction'>({
        config,
        sessionId,
        type: 'interaction',
        minInterval: config.interactionConfig.trackEveryNms ?? INTERACTION_MIN_INTERVAL,
        maxInterval: INTERACTION_MAX_INTERVAL,
        payloadBatcher,
      });
      managers.push({ name: 'interaction', manager: interactionEventManager });
    }

    const eventsManager = new MultiEventManager<'replay' | 'interaction', string>(...managers);

    const globalScope = getGlobalScope();
    if (!globalScope) {
      throw new Error('Cannot capture without global scope.');
    }

    const client = new SessionReplayCapture(
      eventsManager,
      config,
      sessionId,
      deviceId,
      globalScope,
      scrollOptions,
      loggerProvider,
    );
    client.loggerProvider.log('Installing @amplitude/session-replay-browser.');
    client.registerEventListeners(false);
    return client;
  }
}
