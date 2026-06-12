import {
  getAnalyticsConnector,
  getGlobalScope,
  ILogger,
  Logger,
  LogLevel,
  returnWrapper,
  SpecialEventType,
  generateHashCode,
  getOrCreateWindowMessenger,
  enableBackgroundCapture,
  AMPLITUDE_ORIGINS_MAP,
} from '@amplitude/analytics-core';

// Import only specific types to avoid pulling in the entire rrweb-types package
import { eventWithTime, EventType as RRWebEventType, scrollCallback } from '@amplitude/rrweb-types';
import { createSessionReplayJoinedConfigGenerator } from './config/joined-config';
import {
  LoggingConfig,
  SessionReplayJoinedConfig,
  SessionReplayJoinedConfigGenerator,
  SessionReplayLocalConfig,
  SessionReplayMetadata,
  SessionReplayRemoteConfig,
} from './config/types';
import {
  BLOCK_CLASS,
  CustomRRwebEvent,
  DEFAULT_SESSION_REPLAY_PROPERTY,
  INTERACTION_MAX_INTERVAL,
  INTERACTION_MIN_INTERVAL,
  MASK_TEXT_CLASS,
  SESSION_REPLAY_DEBUG_PROPERTY,
  SESSION_REPLAY_EU_URL,
  SESSION_REPLAY_SERVER_URL,
  SESSION_REPLAY_STAGING_URL,
} from './constants';
import {
  getServerUrl,
  getDebugConfig,
  getEffectiveMaskLevel,
  getPageUrl,
  getStorageSize,
  getCurrentUrl,
  maskFn,
  maskAttributeFn,
} from './helpers';
import { EventCompressor } from './events/event-compressor';
import { createEventsManager, EventsManagerWithBeacon } from './events/events-manager';
import { MultiEventManager } from './events/multi-manager';
import { clickBatcher, ClickHandler, clickNonBatcher } from './hooks/click';
import { ScrollWatcher } from './hooks/scroll';
import { SessionIdentifiers } from './identifiers';
import { SafeLoggerProvider } from './logger';
import {
  getOrInitReplayStartTime,
  pruneStaleReplayStartTimes,
  removeReplayStartTime,
  setReplayStartTime,
} from './replay-start-time-store';
import { evaluateTargetingAndStore } from './targeting/targeting-manager';
import {
  AmplitudeSessionReplay,
  SessionReplayEventsManager as AmplitudeSessionReplayEventsManager,
  DebugInfo,
  EventsManagerWithType,
  EventType,
  SessionIdentifiers as ISessionIdentifiers,
  SessionReplayOptions,
  SessionReplayTargetingInput,
} from './typings/session-replay';
import { isSessionInSample } from './sampling';
import { VERSION } from './version';

// Import only the type for NetworkRequestEvent to keep type safety
import type { NetworkObservers, NetworkRequestEvent } from './observers';
import { createUrlTrackingPlugin, subscribeToUrlChanges } from './plugins/url-tracking-plugin';
import type { RecordFunction } from './utils/rrweb';
import { isInIframe, CrossOriginIframeCoordinator, listenForParentSignals } from './cross-origin-iframes';

type PageLeaveFn = (e: PageTransitionEvent | Event) => void;

export class SessionReplay implements AmplitudeSessionReplay {
  name = '@amplitude/session-replay-browser';
  config: SessionReplayJoinedConfig | undefined;
  joinedConfigGenerator: SessionReplayJoinedConfigGenerator | undefined;
  identifiers: ISessionIdentifiers | undefined;
  eventsManager?: AmplitudeSessionReplayEventsManager<'replay' | 'interaction', string>;
  loggerProvider: ILogger;
  recordCancelCallback: ReturnType<RecordFunction> | null = null;
  eventCount = 0;
  eventCompressor: EventCompressor | undefined;
  sessionTargetingMatch = false;
  private lastTargetingParams?: SessionReplayTargetingInput;
  private lastShouldRecordDecision?: boolean;

  // Public on purpose. `pageLeaveFns` is iterated by `pageLeaveListener`,
  // `rrwebEventManager` is dereferenced in `asyncSetSessionId` to drop the beacon buffer
  // at a session boundary, and `sessionStartTime` drives `isBelowMinSessionDuration()`.
  // Tests also stub/inspect these — privatizing them would break both production callers
  // and the gate's test coverage.
  pageLeaveFns: PageLeaveFn[] = [];
  sessionStartTime: number | undefined;
  rrwebEventManager: EventsManagerWithBeacon<'replay'> | undefined;
  /**
   * Count of sendEvents() calls suppressed by the min-session-duration gate for the
   * current session. Drives the REPLAY_GATE_DECISION rrweb event on first send-after-pass.
   */
  private suppressedSendCount = 0;
  /** True once REPLAY_GATE_DECISION has been emitted for the current session. */
  private hasEmittedGateDecision = false;
  private scrollHook?: scrollCallback;
  private clickHandler?: ClickHandler;
  private networkObservers?: NetworkObservers;
  private metadata: SessionReplayMetadata | undefined;

  // Cache the dynamically imported record function
  private recordFunction: RecordFunction | null = null;
  private recordEventsInFlight = false;
  private pendingEmitEvents: Array<{ event: eventWithTime; sessionId: string | number }> = [];

  /** Current page URL, kept in sync with SPA navigations for URL-based masking */
  private currentPageUrl = '';

  private recordEventsPendingShouldLogMetadata: boolean | null = null;

  /** Cleanup for URL change listener used to re-evaluate targeting on SPA route changes */
  private urlChangeCleanup: (() => void) | null = null;
  private crossOriginIframeCoordinator: CrossOriginIframeCoordinator | null = null;
  private crossOriginParentSignalCleanup: (() => void) | null = null;
  /** Monotonic counter to ignore stale URL-change targeting results */
  private latestUrlChangeTargetingEvaluationId = 0;

  constructor() {
    this.loggerProvider = new SafeLoggerProvider(new Logger());
  }

  init(apiKey: string, options: SessionReplayOptions) {
    return returnWrapper(this._init(apiKey, options));
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

  /**
   * Subscribes to SPA URL changes via the URL tracking plugin. Always keeps
   * `currentPageUrl` in sync (needed for URL-based masking). When a targeting
   * config is present it also re-evaluates targeting on every navigation.
   */
  private setupUrlChangeListener(): void {
    // If init() runs multiple times, remove the previous URL-change subscription first
    // so we don't leak callbacks and trigger duplicate targeting evaluations.
    this.urlChangeCleanup?.();

    const globalScope = getGlobalScope() as Window | undefined;
    if (!globalScope?.location) {
      return;
    }

    const hasTargeting = !!this.config?.targetingConfig;

    const onUrlChange = (href: string): void => {
      this.currentPageUrl = href;

      if (hasTargeting) {
        const evaluationId = ++this.latestUrlChangeTargetingEvaluationId;
        void this.evaluateTargetingAndCapture(
          {
            userProperties: {},
            event: undefined,
            page: { url: href },
          },
          false,
          false,
          true,
        );
        this.loggerProvider.debug(`Queued URL-change targeting re-evaluation #${evaluationId} for ${href}.`);
      }
    };
    type UrlUnsubscribe = (scope: Window | undefined, cb: (href: string) => void) => () => void;
    const unsubscribe = (subscribeToUrlChanges as UrlUnsubscribe)(globalScope, onUrlChange);

    this.urlChangeCleanup = (): void => {
      unsubscribe();
      this.urlChangeCleanup = null;
    };
  }

  /**
   * Single source of truth for the min_session_duration_ms gate. Returns true when the
   * current session has not yet reached the configured threshold (and we have both a
   * configured value and a recorded start time). Returns false when there's no
   * threshold, no recorded start time, or the threshold has been met — i.e. it
   * answers "should this batch be suppressed?".
   *
   * Centralizing the check means future changes (clock-skew tolerance, switching to
   * performance.now(), etc.) are one-line edits.
   */
  private isBelowMinSessionDuration(): boolean {
    const minSessionDurationMs = this.config?.minSessionDurationMs;
    if (minSessionDurationMs === undefined || this.sessionStartTime === undefined) {
      return false;
    }
    return Date.now() - this.sessionStartTime < minSessionDurationMs;
  }

  private getCurrentPageForTargeting(): SessionReplayTargetingInput['page'] {
    const currentUrl = getGlobalScope()?.location?.href;
    return currentUrl != null ? { url: currentUrl } : undefined;
  }

  protected async _init(apiKey: string, options: SessionReplayOptions) {
    // Re-init should always tear down any previous URL-change subscription, even when the
    // next config has no targeting config and we don't subscribe again.
    this.urlChangeCleanup?.();

    this.loggerProvider = new SafeLoggerProvider(options.loggerProvider || new Logger());
    Object.prototype.hasOwnProperty.call(options, 'logLevel') &&
      this.loggerProvider.enable(options.logLevel as LogLevel);
    this.currentPageUrl = getCurrentUrl();
    this.identifiers = new SessionIdentifiers({ sessionId: options.sessionId, deviceId: options.deviceId });
    // Persist replay start time per sessionId so the min_session_duration_ms gate
    // measures replay duration (survives page reloads within a session) rather than
    // page-load duration. Storage failures fall back to a transient Date.now().
    const now = Date.now();
    pruneStaleReplayStartTimes(apiKey, now, this.loggerProvider);
    this.sessionStartTime =
      options.sessionId !== undefined
        ? getOrInitReplayStartTime(apiKey, options.sessionId, now, this.loggerProvider) ?? now
        : now;
    this.joinedConfigGenerator = await createSessionReplayJoinedConfigGenerator(apiKey, options);
    const { joinedConfig, localConfig, remoteConfig } = await this.joinedConfigGenerator.generateJoinedConfig();
    this.config = joinedConfig;

    this.setMetadata(
      options.sessionId,
      joinedConfig,
      localConfig,
      remoteConfig,
      options.version?.version,
      VERSION,
      options.version?.type,
    );

    this.pageLeaveFns = [];

    if (options.sessionId && this.config.interactionConfig?.enabled) {
      const scrollWatcher = ScrollWatcher.default(
        {
          sessionId: options.sessionId,
          type: 'interaction',
        },
        this.config,
      );
      this.pageLeaveFns = [scrollWatcher.send(this.getDeviceId.bind(this)).bind(scrollWatcher)];
      this.scrollHook = scrollWatcher.hook.bind(scrollWatcher);
      this.clickHandler = new ClickHandler(this.loggerProvider, scrollWatcher);
    }

    const managers: EventsManagerWithType<EventType, string>[] = [];
    let { storeType } = this.config;
    if (storeType === 'idb' && !getGlobalScope()?.indexedDB) {
      storeType = 'memory';
      this.loggerProvider.warn('Could not use preferred indexedDB storage, reverting to in memory option.');
    }
    this.loggerProvider.log(`Using ${storeType} for event storage.`);
    let compressionWorkerScript: string | undefined;
    let trackDestinationWorkerScript: string | undefined;
    const globalScope = getGlobalScope();
    if (this.config.useWebWorker && globalScope && globalScope.Worker) {
      const { compressionScript, trackDestinationScript } = await import('./worker');
      compressionWorkerScript = compressionScript;
      trackDestinationWorkerScript = trackDestinationScript;
    }

    let rrwebEventManager: EventsManagerWithBeacon<'replay'> | undefined;
    try {
      rrwebEventManager = await createEventsManager<'replay'>({
        config: this.config,
        type: 'replay',
        minInterval: this.config.flushIntervalConfig?.minIntervalMs,
        maxInterval: this.config.flushIntervalConfig?.maxIntervalMs,
        storeType,
        trackDestinationWorkerScript,
        shouldSend: () => !this.isBelowMinSessionDuration(),
      });
      this.rrwebEventManager = rrwebEventManager;
      managers.push({ name: 'replay', manager: rrwebEventManager });
    } catch (error) {
      const typedError = error as Error;
      this.loggerProvider.warn(`Error occurred while creating replay events manager: ${typedError.toString()}`);
    }

    if (this.config.interactionConfig?.enabled) {
      const payloadBatcher = this.config.interactionConfig.batch ? clickBatcher : clickNonBatcher;
      try {
        const interactionEventManager = await createEventsManager<'interaction'>({
          config: this.config,
          type: 'interaction',
          minInterval: this.config.interactionConfig.trackEveryNms ?? INTERACTION_MIN_INTERVAL,
          maxInterval: INTERACTION_MAX_INTERVAL,
          payloadBatcher,
          storeType,
          trackDestinationWorkerScript,
        });
        managers.push({ name: 'interaction', manager: interactionEventManager });
      } catch (error) {
        const typedError = error as Error;
        this.loggerProvider.warn(`Error occurred while creating interaction events manager: ${typedError.toString()}`);
      }
    }

    this.eventsManager = new MultiEventManager<'replay' | 'interaction', string>(...managers);
    // To prevent too many threads.
    if (this.eventCompressor) {
      this.eventCompressor.terminate();
    }

    this.eventCompressor = new EventCompressor(
      this.eventsManager,
      this.config,
      this.getDeviceId(),
      compressionWorkerScript,
      () => this.sendEvents(),
    );

    // Flush any events that arrived while eventCompressor was not yet ready
    // (e.g. a concurrent setSessionId() call that raced _init()'s async setup).
    if (this.pendingEmitEvents.length > 0) {
      const pending = this.pendingEmitEvents.splice(0);
      for (const { event, sessionId } of pending) {
        this.eventCompressor.enqueueEvent(event, sessionId);
      }
    }

    // Register beacon fallback for page exit. sendBeacon survives page unload
    // and delivers any incremental events that haven't been flushed via fetch yet.
    //
    // Known cross-session race: if asyncSetSessionId fired and its async
    // storeCurrentSequence hasn't resolved before unload, the beacon buffer can still
    // hold previous-session events. The gate below reads the *new* session's
    // sessionStartTime, so legitimately-sendable old-session events get suppressed.
    // Follow-up: track start time per buffered batch instead of globally.
    this.pageLeaveFns = [
      ...this.pageLeaveFns,
      () => {
        if (!this.config || !this.identifiers?.sessionId || !rrwebEventManager) return;
        const events = rrwebEventManager.getBeaconEvents();
        if (!events.length) return;
        const deviceId = this.getDeviceId();
        if (!deviceId) return;
        if (this.isBelowMinSessionDuration()) return;
        rrwebEventManager.trackDestination.sendBeacon({
          events,
          sessionId: this.identifiers.sessionId,
          deviceId,
          apiKey: this.config.apiKey,
          serverZone: this.config.serverZone,
        });
      },
    ];

    await this.initializeNetworkObservers();

    // Enable background capture when this page is opened by the Amplitude app
    // (window.opener exists). Uses the shared messenger singleton so that if
    // autocapture is also loaded, both share a single messenger and script load.
    if (getGlobalScope()?.opener) {
      const messenger = getOrCreateWindowMessenger();
      enableBackgroundCapture(messenger);
      messenger.setup({
        logger: this.loggerProvider,
        ...(this.config.serverZone && { endpoint: AMPLITUDE_ORIGINS_MAP[this.config.serverZone] }),
      });
    }

    this.loggerProvider.log('Installing @amplitude/session-replay-browser.');

    this.teardownEventListeners(false);

    await this.evaluateTargetingAndCapture(
      { userProperties: options.userProperties, page: this.getCurrentPageForTargeting() },
      true,
    );

    const needsUrlTracking = this.config.targetingConfig || (this.config.privacyConfig?.urlMaskLevels?.length ?? 0) > 0;
    if (needsUrlTracking) {
      this.setupUrlChangeListener();
    }
  }

  setSessionId(sessionId: string | number, deviceId?: string) {
    return returnWrapper(this.asyncSetSessionId(sessionId, deviceId));
  }

  async asyncSetSessionId(
    sessionId: string | number,
    deviceId?: string,
    options?: { userProperties?: { [key: string]: any } },
  ) {
    const previousSessionId = this.identifiers?.sessionId;
    const currentDeviceId = this.getDeviceId();
    // Standalone SDK callers may poll setSessionId with a stable bucket id (e.g. hour-aligned
    // timestamps) and only need a no-op when the bucket hasn't rolled. Without this guard,
    // the rest of asyncSetSessionId still runs: sendEvents, targeting reset, config refetch,
    // and recordEvents (stop + restart rrweb). Proceed when deviceId changes or
    // userProperties are passed so targeting can re-evaluate on Identify.
    if (
      previousSessionId !== undefined &&
      previousSessionId === sessionId &&
      (deviceId === undefined || deviceId === currentDeviceId) &&
      !options?.userProperties
    ) {
      return;
    }

    // Invalidate any in-flight URL-change re-evaluations from the previous session.
    this.latestUrlChangeTargetingEvaluationId++;
    this.sessionTargetingMatch = false;
    this.lastShouldRecordDecision = undefined; // Reset targeting decision for new session
    if (previousSessionId) {
      this.sendEvents(previousSessionId);
    }

    const isSessionChange = previousSessionId !== sessionId;

    // Drop any beacon-buffered events from the previous session BEFORE installing the
    // new identifiers / start time. Otherwise the page-leave beacon path could attribute
    // old-session events to the new session id, and the gate (using the new start time)
    // would compute the wrong elapsed duration. Skip on a redundant same-sessionId call —
    // the buffer belongs to the *continuing* session and should ship via beacon as normal.
    if (isSessionChange) {
      this.rrwebEventManager?.dropPendingBeaconEvents();
    }

    const deviceIdForReplayId = deviceId || this.getDeviceId();
    this.identifiers = new SessionIdentifiers({
      sessionId: sessionId,
      deviceId: deviceIdForReplayId,
    });

    // Gate state and persisted start time only get reset on an actual session boundary.
    // A redundant setSessionId(currentId) call would otherwise overwrite both the in-memory
    // and stored start time with a fresh Date.now() — restarting the gate clock for what is
    // supposed to be a continuing session.
    if (isSessionChange) {
      this.sessionStartTime = Date.now();
      this.suppressedSendCount = 0;
      this.hasEmittedGateDecision = false;
      if (this.config?.apiKey) {
        setReplayStartTime(this.config.apiKey, sessionId, this.sessionStartTime, this.loggerProvider);
        if (previousSessionId !== undefined) {
          removeReplayStartTime(this.config.apiKey, previousSessionId, this.loggerProvider);
        }
      }
    }

    // If there is no previous session id, SDK is being initialized for the first time,
    // and config was just fetched in initialization, so no need to fetch it a second time
    if (this.joinedConfigGenerator && previousSessionId) {
      const { joinedConfig } = await this.joinedConfigGenerator.generateJoinedConfig();
      this.config = joinedConfig;
    }

    if (this.config?.targetingConfig) {
      await this.evaluateTargetingAndCapture(
        { userProperties: options?.userProperties, page: this.getCurrentPageForTargeting() },
        false,
        true,
      );
    } else {
      await this.recordEvents();
    }
  }

  getSessionReplayProperties() {
    const config = this.config;
    const identifiers = this.identifiers;
    if (!config || !identifiers) {
      this.loggerProvider.warn('Session replay init has not been called, cannot get session replay properties.');
      return {};
    }

    const shouldRecord = this.getShouldRecord();
    let eventProperties: { [key: string]: string | null } = {};

    if (shouldRecord) {
      eventProperties = {
        [DEFAULT_SESSION_REPLAY_PROPERTY]: identifiers.sessionReplayId ? identifiers.sessionReplayId : null,
      };
      if (config.debugMode) {
        eventProperties[SESSION_REPLAY_DEBUG_PROPERTY] = JSON.stringify({
          appHash: generateHashCode(config.apiKey).toString(),
        });
      }
    }

    void this.addCustomRRWebEvent(
      CustomRRwebEvent.GET_SR_PROPS,
      {
        shouldRecord,
        eventProperties: eventProperties,
      },
      this.eventCount === 10,
    );
    if (this.eventCount === 10) {
      this.eventCount = 0;
    }
    this.eventCount++;

    return eventProperties;
  }

  blurListener = () => {
    this.sendEvents();
  };

  focusListener = () => {
    if (this.recordCancelCallback && this.recordFunction) {
      try {
        this.recordFunction.takeFullSnapshot(true);
      } catch (error) {
        this.loggerProvider.warn('Failed to take full snapshot on focus:', error);
      }
    } else if (!this.recordEventsInFlight) {
      void this.recordEvents(false);
    }
  };

  /**
   * This is an instance member so that if init is called multiple times
   * it doesn't add another listener to the page leave event. This is to
   * prevent duplicate listener actions from firing.
   */
  private pageLeaveListener = (e: PageTransitionEvent | Event) => {
    // Synchronously drain any events still queued in the requestIdleCallback
    // pipeline so they are available to send before the page unloads.
    this.eventCompressor?.flushQueue();
    this.sendEvents();
    this.pageLeaveFns.forEach((fn) => {
      fn(e);
    });
  };

  evaluateTargetingAndCapture = async (
    targetingParams: SessionReplayTargetingInput,
    isInit = false,
    forceRestart = false,
    forceTargetingReevaluation = false,
  ) => {
    if (!this.identifiers || !this.identifiers.sessionId || !this.config) {
      if (this.identifiers && !this.identifiers.sessionId) {
        this.loggerProvider.log('Session ID has not been set yet, cannot evaluate targeting for Session Replay.');
      } else {
        this.loggerProvider.warn('Session replay init has not been called, cannot evaluate targeting.');
      }
      return;
    }

    // Handle cases where there's no targeting config
    if (!this.config.targetingConfig) {
      if (isInit) {
        this.loggerProvider.log('Targeting config has not been set yet, cannot evaluate targeting.');
      } else {
        this.loggerProvider.log('No targeting config set, skipping initialization/recording for event.');
        return;
      }
    }

    // Store targeting parameters for use in getShouldRecord
    this.lastTargetingParams = targetingParams;

    // Re-evaluate only until we get the first match in this session.
    // Once matched, keep recording for the rest of the session.
    const targetingConfig = this.config.targetingConfig;
    const shouldReEvaluate = targetingConfig && !this.sessionTargetingMatch;
    if (shouldReEvaluate) {
      // Capture URL-change evaluation id so out-of-order async completions can be discarded.
      const urlChangeEvaluationId = forceTargetingReevaluation ? this.latestUrlChangeTargetingEvaluationId : undefined;
      let eventForTargeting = targetingParams.event;
      if (
        eventForTargeting &&
        Object.values(SpecialEventType).includes(eventForTargeting.event_type as SpecialEventType)
      ) {
        eventForTargeting = undefined;
      }

      const pageUrl = targetingParams.page?.url ?? getGlobalScope()?.location?.href ?? '';
      const pageForTargeting = targetingParams.page ?? (pageUrl !== '' ? { url: pageUrl } : undefined);

      const targetingMatch = await evaluateTargetingAndStore({
        sessionId: this.identifiers.sessionId,
        targetingConfig,
        loggerProvider: this.loggerProvider,
        apiKey: this.config.apiKey,
        targetingParams: {
          userProperties: targetingParams.userProperties,
          event: eventForTargeting,
          page: pageForTargeting,
        },
        urlChange: forceTargetingReevaluation,
      });

      if (
        forceTargetingReevaluation &&
        urlChangeEvaluationId !== undefined &&
        urlChangeEvaluationId !== this.latestUrlChangeTargetingEvaluationId
      ) {
        this.loggerProvider.debug(
          `Ignoring stale URL-change targeting result #${urlChangeEvaluationId}; latest is #${this.latestUrlChangeTargetingEvaluationId}.`,
        );
        return;
      }
      // Keep targeting match monotonic within a session: once true, always true.
      // This avoids races where an older in-flight evaluation resolves false after
      // a newer evaluation already resolved true.
      this.sessionTargetingMatch = this.sessionTargetingMatch || targetingMatch;

      this.loggerProvider.debug(
        JSON.stringify(
          {
            name: 'targeted replay capture config',
            sessionTargetingMatch: this.sessionTargetingMatch,
            event: eventForTargeting,
            targetingParams: targetingParams,
          },
          null,
          2,
        ),
      );
    }

    if (isInit) {
      void this.initialize(true);
    } else if (forceRestart || !this.recordCancelCallback) {
      this.loggerProvider.log('Recording events for session due to forceRestart or no ongoing recording.');
      await this.recordEvents();
    }
  };

  sendEvents(sessionId?: string | number) {
    const sessionIdToSend = sessionId || this.identifiers?.sessionId;
    const deviceId = this.getDeviceId();
    if (this.eventsManager && sessionIdToSend && deviceId) {
      if (this.isBelowMinSessionDuration()) {
        // Safe to dereference: isBelowMinSessionDuration() only returns true when both
        // this.config and this.sessionStartTime are defined.
        const startTime = this.sessionStartTime as number;
        const minMs = (this.config as SessionReplayJoinedConfig).minSessionDurationMs as number;
        this.loggerProvider.log(
          `Session ${sessionIdToSend} not sent: duration ${Date.now() - startTime}ms is below minimum ${minMs}ms.`,
        );
        // We deliberately do NOT clear the beacon buffer here. Blur/visibility-change
        // can call sendEvents() mid-session; if the session later crosses the threshold
        // those buffered events are legitimately sendable via beacon on page exit.
        // Cross-session leak is prevented in asyncSetSessionId, which drops the buffer
        // at the session transition. The page-leave path also gates independently.
        this.suppressedSendCount++;
        return;
      }
      // On the first send-after-pass for the session, emit a custom rrweb event so the
      // payload itself carries the gate verdict. Lets backend ingestion diff intended
      // vs actual replay counts to spot start-time-tracking regressions.
      //
      // Gate on recording being active too: addCustomRRWebEvent is a no-op when
      // recordCancelCallback/recordFunction aren't set yet (e.g. a blur-listener-fired
      // sendEvents reaches us before _recordEvents() activates on a reloaded long-lived
      // session). Tripping hasEmittedGateDecision unconditionally would lose the signal
      // for that session's first real send.
      if (
        !this.hasEmittedGateDecision &&
        this.config?.minSessionDurationMs !== undefined &&
        this.recordCancelCallback &&
        this.recordFunction
      ) {
        this.hasEmittedGateDecision = true;
        const elapsedMs = this.sessionStartTime !== undefined ? Date.now() - this.sessionStartTime : undefined;
        void this.addCustomRRWebEvent(
          CustomRRwebEvent.REPLAY_GATE_DECISION,
          {
            sessionId: sessionIdToSend,
            suppressedSendCount: this.suppressedSendCount,
            elapsedMs,
            minSessionDurationMs: this.config.minSessionDurationMs,
          },
          false,
        );
      }
      this.eventsManager.sendCurrentSequenceEvents({ sessionId: sessionIdToSend, deviceId });
    }
  }

  async initialize(shouldSendStoredEvents = false) {
    if (!this.identifiers?.sessionId) {
      this.loggerProvider.log(`Session is not being recorded due to lack of session id.`);
      return Promise.resolve();
    }

    const deviceId = this.getDeviceId();
    if (!deviceId) {
      this.loggerProvider.log(`Session is not being recorded due to lack of device id.`);
      return Promise.resolve();
    }
    this.eventsManager && shouldSendStoredEvents && void this.eventsManager.sendStoredEvents({ deviceId });

    return this.recordEvents();
  }

  shouldOptOut() {
    let identityStoreOptOut: boolean | undefined;
    if (this.config?.instanceName) {
      const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
      identityStoreOptOut = identityStore.getIdentity().optOut;
    }

    return identityStoreOptOut !== undefined ? identityStoreOptOut : this.config?.optOut;
  }

  getShouldRecord() {
    if (!this.identifiers || !this.config || !this.identifiers.sessionId) {
      this.loggerProvider.warn(`Session is not being recorded due to lack of config, please call sessionReplay.init.`);
      return false;
    }

    if (!this.config.captureEnabled) {
      this.loggerProvider.log(
        `Session ${this.identifiers.sessionId} not being captured due to capture being disabled for project or because the remote config could not be fetched.`,
      );
      return false;
    }

    if (this.shouldOptOut()) {
      this.loggerProvider.log(`Opting session ${this.identifiers.sessionId} out of recording due to optOut config.`);
      return false;
    }

    let shouldRecord = false;
    let message = '';
    let matched = false;

    // If targetingConfig exists, we'll use the sessionTargetingMatch to determine whether to record
    // Otherwise, we'll evaluate the session against the overall sample rate
    if (this.config.targetingConfig) {
      if (!this.sessionTargetingMatch) {
        message = `Not capturing replays for session ${this.identifiers.sessionId} due to not matching targeting conditions.`;
        this.loggerProvider.log(message);
        shouldRecord = false;
        matched = false;
      } else {
        message = `Capturing replays for session ${this.identifiers.sessionId} due to matching targeting conditions.`;
        this.loggerProvider.log(message);
        shouldRecord = true;
        matched = true;
      }
    } else {
      const isInSample = isSessionInSample(this.identifiers.sessionId, this.config.sampleRate);
      if (!isInSample) {
        message = `Opting session ${this.identifiers.sessionId} out of recording due to sample rate.`;
        this.loggerProvider.log(message);
        shouldRecord = false;
        matched = false;
      } else {
        shouldRecord = true;
        matched = true;
      }
    }

    // Only send custom rrweb event for targeting decision when the decision changes
    if (this.lastShouldRecordDecision !== shouldRecord && this.config.targetingConfig) {
      void this.addCustomRRWebEvent(CustomRRwebEvent.TARGETING_DECISION, {
        message,
        sessionId: this.identifiers.sessionId,
        matched,
        targetingParams: this.lastTargetingParams,
      });
      this.lastShouldRecordDecision = shouldRecord;
    }

    return shouldRecord;
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
    const privacyConfig = this.config?.privacyConfig;
    const effectiveLevel = privacyConfig ? getEffectiveMaskLevel(this.currentPageUrl, privacyConfig) : undefined;

    if (effectiveLevel === 'conservative') {
      return '*';
    }

    // If any urlMaskLevels rule uses 'conservative', always route all text nodes
    // through maskTextFn so the dynamic URL getter can decide at call time.
    // Without this, rrweb's static maskTextSelector would miss text nodes when
    // the user navigates from a non-conservative page to a conservative one.
    if (privacyConfig?.urlMaskLevels?.some((rule) => rule.maskLevel === 'conservative')) {
      return '*';
    }

    // If defaultMaskLevel is 'conservative' and URL rules exist, always route text through
    // maskTextFn — a page matching no rule falls back to the conservative default, and
    // rrweb must be set up at start to call maskTextFn for those text nodes.
    const urlMaskLevels = privacyConfig?.urlMaskLevels;
    if (privacyConfig?.defaultMaskLevel === 'conservative' && urlMaskLevels && urlMaskLevels.length > 0) {
      return '*';
    }

    const maskSelector = privacyConfig?.maskSelector;
    if (!maskSelector) {
      return;
    }

    return maskSelector as unknown as string;
  }

  async getRecordingPlugins(loggingConfig: LoggingConfig | undefined) {
    const plugins = [];

    // Add URL tracking plugin
    try {
      const urlTrackingPlugin = createUrlTrackingPlugin({
        ugcFilterRules: this.config?.interactionConfig?.ugcFilterRules || [],
        enablePolling: this.config?.enableUrlChangePolling || false,
        pollingInterval: this.config?.urlChangePollingInterval,
        captureDocumentTitle: this.config?.captureDocumentTitle,
      });

      plugins.push(urlTrackingPlugin);
    } catch (error) {
      this.loggerProvider.warn('Failed to create URL tracking plugin:', error);
    }

    // Default plugin settings -
    // {
    //   level: ['info', 'log', 'warn', 'error'],
    //   lengthThreshold: 10000,
    //   stringifyOptions: {
    //     stringLengthLimit: undefined,
    //     numOfKeysLimit: 50,
    //     depthOfLimit: 4,
    //   },
    //   logger: window.console,
    //   }
    if (loggingConfig?.console?.enabled) {
      try {
        // Dynamic import keeps console plugin separate and only loads when needed
        const { getRecordConsolePlugin } = await import('@amplitude/rrweb-plugin-console-record');
        plugins.push(getRecordConsolePlugin({ level: loggingConfig.console.levels }));
      } catch (error) {
        this.loggerProvider.warn('Failed to load console plugin:', error);
      }
    }

    return plugins.length > 0 ? plugins : undefined;
  }

  private async getRecordFunction(): Promise<RecordFunction | null> {
    if (this.recordFunction) {
      return this.recordFunction;
    }

    try {
      const { record } = await import('@amplitude/rrweb-record');
      this.recordFunction = record;
      return record;
    } catch (error) {
      this.loggerProvider.warn('Failed to load rrweb-record module:', error);
      return null;
    }
  }

  async recordEvents(shouldLogMetadata = true) {
    if (this.recordEventsInFlight) {
      this.recordEventsPendingShouldLogMetadata = shouldLogMetadata;
      return;
    }
    this.recordEventsInFlight = true;
    try {
      await this._recordEvents(shouldLogMetadata);
      while (this.recordEventsPendingShouldLogMetadata !== null) {
        const pendingArgs = this.recordEventsPendingShouldLogMetadata;
        this.recordEventsPendingShouldLogMetadata = null;
        await this._recordEvents(pendingArgs);
      }
    } finally {
      this.recordEventsInFlight = false;
      this.recordEventsPendingShouldLogMetadata = null;
    }
  }

  private async _recordEvents(shouldLogMetadata = true) {
    const config = this.config;
    const shouldRecord = this.getShouldRecord();
    const sessionId = this.identifiers?.sessionId;
    if (!shouldRecord || !sessionId || !config) {
      return;
    }
    this.stopRecordingEvents();

    const recordFunction = await this.getRecordFunction();

    // May be undefined if cannot import rrweb-record
    if (!recordFunction) {
      return;
    }

    await this.initializeNetworkObservers();

    const networkLoggingConfig = config.loggingConfig?.network;
    const trackUrl = getServerUrl(config.serverZone, config.trackServerUrl);
    const ignoredUrls = [SESSION_REPLAY_SERVER_URL, SESSION_REPLAY_EU_URL, SESSION_REPLAY_STAGING_URL, trackUrl];
    this.networkObservers?.start((event: NetworkRequestEvent) => {
      if (ignoredUrls.some((url) => event.url.startsWith(url))) return;
      void this.addCustomRRWebEvent(CustomRRwebEvent.FETCH_REQUEST, event);
    }, networkLoggingConfig);
    const { interactionConfig, loggingConfig } = config;

    const hooks = interactionConfig?.enabled
      ? {
          mouseInteraction:
            this.eventsManager &&
            this.clickHandler?.createHook({
              eventsManager: this.eventsManager,
              sessionId,
              deviceIdFn: this.getDeviceId.bind(this),
              mirror: recordFunction.mirror,
              ugcFilterRules: interactionConfig.ugcFilterRules ?? [],
              performanceOptions: config.performanceConfig?.interaction,
            }),
          scroll: this.scrollHook,
        }
      : {};

    const ugcFilterRules =
      interactionConfig?.enabled && interactionConfig.ugcFilterRules ? interactionConfig.ugcFilterRules : [];

    this.loggerProvider.log(`Session Replay capture beginning for ${sessionId}.`);

    try {
      const crossOriginIframesEnabled = !!config.crossOriginIframes?.enabled;
      const coordinateChildren = config.crossOriginIframes?.coordinateChildren !== false;
      const childMode = crossOriginIframesEnabled && isInIframe();

      if (childMode && coordinateChildren) {
        // Child mode: don't self-start; wait for a start signal from the parent.
        // (The previous listener, if any, was already removed by stopRecordingEvents above.)
        this.crossOriginParentSignalCleanup = listenForParentSignals({
          onStart: () => this._recordEventsInChildMode(recordFunction, sessionId, config, hooks),
          onStop: () => {
            try {
              // Only cancel the rrweb recording — do NOT call stopRecordingEvents() here,
              // which would clear crossOriginParentSignalCleanup and make the child deaf
              // to subsequent start/stop cycles from the parent.
              this.recordCancelCallback && this.recordCancelCallback();
              this.recordCancelCallback = null;
            } catch (error) {
              const typedError = error as Error;
              this.loggerProvider.warn(
                `Error occurred while stopping child iframe replay capture: ${typedError.toString()}`,
              );
            }
          },
        });
        return;
      }

      this.recordCancelCallback = recordFunction({
        ...this.buildRRWebRecordOptions(
          config,
          hooks,
          (event: eventWithTime) => {
            if (this.shouldOptOut()) {
              this.loggerProvider.log(`Opting session ${sessionId} out of recording due to optOut config.`);
              this.stopRecordingEvents();
              this.sendEvents();
              return;
            }

            if (event.type === RRWebEventType.Meta) {
              event.data.href = getPageUrl(event.data.href, ugcFilterRules);
            }

            if (this.eventCompressor) {
              // Schedule processing during idle time if the browser supports requestIdleCallback
              this.eventCompressor.enqueueEvent(event, sessionId);
            } else {
              // eventCompressor is not yet ready (concurrent call racing _init()).
              // Buffer the event so it can be flushed once the compressor is initialized.
              this.pendingEmitEvents.push({ event, sessionId });
            }
          },
          'Error while capturing replay: ',
        ),
        plugins: await this.getRecordingPlugins(loggingConfig),
        recordCrossOriginIframes: crossOriginIframesEnabled,
      });

      if (crossOriginIframesEnabled && !childMode && coordinateChildren) {
        if (!this.crossOriginIframeCoordinator) {
          this.crossOriginIframeCoordinator = new CrossOriginIframeCoordinator();
        }
        this.crossOriginIframeCoordinator.start();
      }

      void this.addCustomRRWebEvent(CustomRRwebEvent.DEBUG_INFO);
      if (shouldLogMetadata) {
        void this.addCustomRRWebEvent(CustomRRwebEvent.METADATA, this.metadata);
      }
    } catch (error) {
      this.loggerProvider.warn('Failed to initialize session replay:', error);
    }
  }

  private buildRRWebRecordOptions(
    config: SessionReplayJoinedConfig,
    hooks: { mouseInteraction?: any; scroll?: scrollCallback },
    emit: (event: eventWithTime) => void,
    errorLogPrefix: string,
  ): Parameters<RecordFunction>[0] {
    const { privacyConfig } = config;
    return {
      emit,
      inlineStylesheet: config.shouldInlineStylesheet,
      hooks,
      maskAllInputs: true,
      maskTextClass: MASK_TEXT_CLASS,
      blockClass: BLOCK_CLASS,
      blockSelector: this.getBlockSelectors() as string | undefined,
      applyBackgroundColorToBlockedElements: config.applyBackgroundColorToBlockedElements,
      maskInputFn: maskFn('input', privacyConfig, () => this.currentPageUrl),
      maskTextFn: maskFn('text', privacyConfig, () => this.currentPageUrl),
      maskAttributeFn: maskAttributeFn(privacyConfig, () => this.currentPageUrl),
      maskTextSelector: this.getMaskTextSelectors(),
      ...(config.fullSnapshotIntervalMs !== undefined && { checkoutEveryNms: config.fullSnapshotIntervalMs }),
      recordCanvas: false,
      captureAdoptedStyleSheets: config.captureAdoptedStyleSheets,
      // Strip nodes that are never rendered by the rrweb replay player.
      // None of these affect visual fidelity; omitting them reduces snapshot size.
      slimDOMOptions: {
        script: true,
        comment: true,
        headFavicon: true,
        headWhitespace: true,
        headMetaDescKeywords: true,
        headMetaSocial: true,
        headMetaRobots: true,
        headMetaHttpEquiv: true,
        headMetaAuthorship: true,
        headMetaVerification: true,
      },
      errorHandler: (error: unknown) => {
        const typedError = error as Error & { _external_?: boolean };
        // styled-components relies on this error being thrown and bubbled up, rrweb is otherwise suppressing it
        if (typedError.message.includes('insertRule') && typedError.message.includes('CSSStyleSheet')) {
          throw typedError;
        }
        // rrweb monkey-patches window functions like CSSStyleSheet.insertRule; errors from external callers
        // (e.g. styled-components) must be re-thrown so they aren't silently swallowed.
        if (typedError._external_) {
          throw typedError;
        }
        this.loggerProvider.warn(errorLogPrefix, typedError.toString());
        // Return true so that we don't clutter user's consoles with internal rrweb errors
        return true;
      },
    };
  }

  private _recordEventsInChildMode(
    recordFunction: RecordFunction,
    sessionId: string | number,
    config: SessionReplayJoinedConfig,
    hooks: { mouseInteraction?: any; scroll?: scrollCallback },
  ) {
    // In child mode, rrweb detects window.parent !== window and routes events via
    // postMessage to the parent instead of calling emit. The emit callback is unused.
    // Note: recording plugins (URL tracking, console capture) are intentionally omitted
    // here — the child's events are merged into the parent stream, so URL changes inside
    // the iframe should not be recorded as parent page-view events.
    try {
      // Stop only the previous rrweb recording. Do NOT call stopRecordingEvents() here:
      // that would clear crossOriginParentSignalCleanup — the very listener that invoked
      // this method — making the child permanently deaf to subsequent stop/start cycles.
      this.recordCancelCallback && this.recordCancelCallback();
      this.recordCancelCallback = null;
      this.recordCancelCallback = recordFunction({
        ...this.buildRRWebRecordOptions(
          config,
          hooks,
          () => {
            // no-op: child events are forwarded to parent via postMessage by rrweb
          },
          'Error while capturing replay (child iframe): ',
        ),
        recordCrossOriginIframes: true, // child mode is only entered when crossOriginIframes.enabled is true
      });
      this.loggerProvider.log(`Session Replay child iframe capture beginning for session ${sessionId}.`);
    } catch (error) {
      this.loggerProvider.warn('Failed to initialize session replay in child iframe mode:', error);
    }
  }

  addCustomRRWebEvent = async (
    eventName: CustomRRwebEvent,
    eventData: { [key: string]: any } = {},
    addStorageInfo = true,
  ) => {
    try {
      let debugInfo: DebugInfo | undefined = undefined;
      const config = this.config;
      // Only add debug info for non-metadata events
      if (config && eventName !== CustomRRwebEvent.METADATA) {
        debugInfo = {
          config: getDebugConfig(config),
          version: VERSION,
        };
        if (addStorageInfo) {
          const storageSizeData = await getStorageSize();
          debugInfo = {
            ...storageSizeData,
            ...debugInfo,
          };
        }
      }
      // Check first to ensure we are recording
      if (this.recordCancelCallback && this.recordFunction) {
        this.recordFunction.addCustomEvent(eventName, {
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
  };

  stopRecordingEvents = () => {
    try {
      this.loggerProvider.log('Session Replay capture stopping.');
      this.recordCancelCallback && this.recordCancelCallback();
      this.recordCancelCallback = null;
      this.networkObservers?.stop();
      this.crossOriginIframeCoordinator?.stop();
      this.crossOriginIframeCoordinator = null;
      // Remove the child-mode parent signal listener so a later mode change
      // (e.g. crossOriginIframes disabled) does not leave a stale listener.
      this.crossOriginParentSignalCleanup?.();
      this.crossOriginParentSignalCleanup = null;
    } catch (error) {
      const typedError = error as Error;
      this.loggerProvider.warn(`Error occurred while stopping replay capture: ${typedError.toString()}`);
    }
  };

  getDeviceId() {
    return this.identifiers?.deviceId;
  }

  getSessionId() {
    return this.identifiers?.sessionId;
  }

  async flush(useRetry = false) {
    // Intentionally not gated on min_session_duration_ms. flush() forwards payloads
    // already queued in trackDestination, and every code path that queues into it —
    // sendCurrentSequenceEvents, addEvent's batch-split path, sendStoredEvents reading
    // sequencesToSend from IDB — has already passed the gate at the time of queuing.
    // A duplicate gate here would be unreachable.
    return this.eventsManager?.flush(useRetry);
  }

  shutdown() {
    this.urlChangeCleanup?.();
    this.crossOriginParentSignalCleanup?.();
    this.crossOriginParentSignalCleanup = null;
    this.teardownEventListeners(true);
    this.stopRecordingEvents();
    this.sendEvents();
  }

  private mapSDKType(sdkType: string | undefined) {
    if (sdkType === 'plugin') {
      return '@amplitude/plugin-session-replay-browser';
    }

    if (sdkType === 'segment') {
      return '@amplitude/segment-session-replay-plugin';
    }

    return null;
  }

  private setMetadata(
    sessionId: string | number | undefined,
    joinedConfig: SessionReplayJoinedConfig,
    localConfig: SessionReplayLocalConfig,
    remoteConfig: SessionReplayRemoteConfig | undefined,
    replaySDKVersion: string | undefined,
    standaloneSDKVersion: string | undefined,
    sdkType: string | undefined,
  ) {
    const hashValue = sessionId?.toString() ? generateHashCode(sessionId.toString()) : undefined;

    this.metadata = {
      joinedConfig,
      localConfig,
      remoteConfig,
      sessionId,
      hashValue,
      sampleRate: joinedConfig.sampleRate,
      replaySDKType: this.mapSDKType(sdkType),
      replaySDKVersion,
      standaloneSDKType: '@amplitude/session-replay-browser',
      standaloneSDKVersion,
    };
  }

  private async initializeNetworkObservers(): Promise<void> {
    if (this.config?.loggingConfig?.network?.enabled && !this.networkObservers) {
      try {
        const { NetworkObservers: NetworkObserversClass } = await import('./observers');
        this.networkObservers = new NetworkObserversClass();
      } catch (error) {
        this.loggerProvider.warn('Failed to import or instantiate NetworkObservers:', error);
      }
    }
  }
}
