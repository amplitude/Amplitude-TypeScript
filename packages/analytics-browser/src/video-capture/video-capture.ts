import {
  VideoState,
  VideoObserver,
  BrowserClient,
  EmbeddedVideoPlayer,
  VideoVendor,
  UUID,
  BaseEvent,
  getHeartbeatInstance,
} from '@amplitude/analytics-core';
import {
  DEFAULT_CONTENT_STARTED_EVENT,
  DEFAULT_CONTENT_STOPPED_EVENT,
  DELIVERY_MODE,
  DURATION,
  ERROR_MESSAGE,
  PERCENT_COMPLETED,
  PLAY_ID,
  POSITION,
  START_TIME,
  STOP_REASON,
  WATCH_DURATION,
} from '../constants';

/** Playback states where a view session is still in progress (e.g. buffering). */
const ACTIVE_PLAYBACK_STATES = new Set<VideoState['playbackState']>(['playing', 'waiting']);

/**
 * Observer fields that never reach event properties: `last_position` is an observer internal,
 * and `percent_completed`/`stop_reason` describe the player event rather than the play session,
 * which tracks its own values.
 */
const OMITTED_VIDEO_EVENT_PROPERTIES = new Set(['last_position', PERCENT_COMPLETED, STOP_REASON]);

/**
 * Copy remaining player-event fields (vendor metadata such as `mux_playback_id`, ids, titles)
 * onto the Amplitude event, dropping empty values so absent metadata is omitted.
 */
function parseVideoEventProperties(lastEvent: VideoState['lastEvent']): Record<string, string | number | boolean> {
  const properties: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(lastEvent ?? {})) {
    if (OMITTED_VIDEO_EVENT_PROPERTIES.has(key) || value === null || value === undefined) {
      continue;
    }
    properties[key] = value as string | number | boolean;
  }
  return properties;
}

export class VideoCapture {
  private videoEl: HTMLMediaElement | null = null;
  private heartbeat: ReturnType<typeof getHeartbeatInstance>;
  private embeddedVideoPlayer: EmbeddedVideoPlayer | null = null;
  private vendor?: VideoVendor;
  private extraEventProperties: Record<string, string | number | boolean> = {};
  private stopEvent: BaseEvent | null = null;
  private listeners: ((previousState: VideoState, nextState: VideoState) => void)[] = [];
  private onRemoveListeners: (() => void)[] = [];
  private playId: string | null = null;
  private playStartTime: number | null = null;

  constructor(private readonly amplitude: BrowserClient) {
    this.heartbeat = getHeartbeatInstance(this.amplitude);
  }

  /**
   * Specify a video or audio element to capture events from
   *
   * @param videoEl - The HTML video or audio element to capture events from.
   * @returns The VideoCapture instance.
   */
  withVideoElement(videoEl: HTMLMediaElement): VideoCapture {
    this.videoEl = videoEl;
    return this;
  }

  /**
   * Specify an embedded video player.js instance to capture events from
   * @param player - The embedded video player.js instance to capture events from.
   * @returns The VideoCapture instance.
   */
  withEmbeddedPlayer(player: EmbeddedVideoPlayer): VideoCapture {
    this.embeddedVideoPlayer = player;
    return this;
  }

  /**
   * Specify a vendor to capture extra vendor-specific event properties
   *
   * @param vendor - The vendor of the video player. Currently only "mux" is supported.
   * @returns The VideoCapture instance.
   */
  withVendor(vendor: VideoVendor): VideoCapture {
    this.vendor = vendor;
    return this;
  }

  /**
   * Specify extra event properties to include in all captured events
   *
   * @param properties - The extra event properties to include in the Amplitude event.
   * @returns The VideoCapture instance.
   */
  withExtraEventProperties(properties: Record<string, string | number | boolean>): VideoCapture {
    this.extraEventProperties = properties;
    return this;
  }

  /**
   * Track a "[Amplitude] Content Started" event every time the video starts playing
   * @returns The VideoCapture instance.
   */
  captureVideoStarted(): VideoCapture {
    this.listeners.push((previousState, nextState) => {
      if (!ACTIVE_PLAYBACK_STATES.has(previousState.playbackState) && nextState.playbackState === 'playing') {
        this.playId = UUID();
        /* istanbul ignore next */
        this.playStartTime = nextState.lastEvent?.start_time ?? 0;
        const now = new Date().getTime();
        const startEvent: BaseEvent = {
          insert_id: UUID(),
          event_type: DEFAULT_CONTENT_STARTED_EVENT,
          time: now,
          event_properties: {
            ...this.parseStartEventProperties(nextState),
            ...this.extraEventProperties,
            [PLAY_ID]: this.playId,
          },
        };
        this.stopEvent = {
          ...startEvent,
          insert_id: UUID(),
          event_type: DEFAULT_CONTENT_STOPPED_EVENT,
          time: now + 1,
          event_properties: {
            ...this.parseStopEventProperties(nextState),
            ...this.extraEventProperties,
            [STOP_REASON]: 'timeout',
            [PLAY_ID]: this.playId,
          },
        };
        this.heartbeat.trackNoDelay(startEvent).catch(this.stop.bind(this));
        this.heartbeat.track(this.stopEvent).catch(this.stop.bind(this));
      }
    });
    return this;
  }

  /**
   * Track a "[Amplitude] Content Stopped" event every time the video stops playing
   * @returns The VideoCapture instance.
   */
  captureVideoStopped(): VideoCapture {
    this.listeners.push((previousState, nextState) => {
      // update the delayed event properties to have
      // the most up-to-date values
      if (this.stopEvent) {
        this.stopEvent.event_properties = {
          ...this.stopEvent.event_properties,
          ...this.parseStopEventProperties(nextState),
          ...this.extraEventProperties,
        };
        this.stopEvent.time = new Date().getTime();
        void this.heartbeat.update(this.stopEvent);
      }
      if (
        ACTIVE_PLAYBACK_STATES.has(previousState.playbackState) &&
        !ACTIVE_PLAYBACK_STATES.has(nextState.playbackState)
      ) {
        this.flushStopEvent(nextState.playbackState);
      }
    });
    return this;
  }

  /**
   * End the current play session by ingesting its queued delayed stop event immediately.
   *
   * The heartbeat is shared by every capture on the same Amplitude client, so the event is
   * flushed rather than the heartbeat stopped, which would discard other captures' events.
   * Flushing also drops the event from the heartbeat queue once ingested, so the interval
   * winds down on its own. No-op when no play session is in progress.
   */
  private flushStopEvent(stopReason: string) {
    const stopEvent = this.stopEvent;
    if (!stopEvent) {
      return;
    }
    // the next play queues a fresh delayed stop event
    this.stopEvent = null;
    this.playStartTime = null;
    stopEvent.event_properties = {
      ...stopEvent.event_properties,
      [STOP_REASON]: stopReason,
    };
    this.heartbeat.trackNoDelay(stopEvent).catch(this.stop.bind(this));
  }

  // Placeholder: may need a generic state change listener to capture unusual events or to have
  // more control over the event tracking.
  // withStateChangeListener(listener: (previousState: VideoState, nextState: VideoState) => void): VideoCapture {

  /**
   * Start capturing analytics events for the video element
   * @returns The VideoCapture instance.
   * @throws An error if the video element is not specified.
   */
  start(): VideoCapture {
    const videoEl = this.videoEl ?? this.embeddedVideoPlayer;
    if (!videoEl) {
      throw new Error(
        'Video element not specified. Use withVideoElement() or withEmbeddedPlayer() to specify the video element.',
      );
    }
    if (this.videoEl && this.embeddedVideoPlayer) {
      throw new Error(
        'Both video element and embedded video player specified. Use only one of withVideoElement() or withEmbeddedPlayer() to specify the video element.',
      );
    }
    const videoObserver = new VideoObserver({
      videoEl,
      onStateChange: (previousState, nextState) => {
        this.listeners.forEach((listener) => listener(previousState, nextState));
      },
      vendor: this.vendor,
      isEmbedded: !!this.embeddedVideoPlayer,
    });

    this.onRemoveListeners.push(() => {
      videoObserver.destroy();
    });
    return this;
  }

  /**
   * Stop capturing analytics events for the video element.
   *
   * Observers are detached first so no playback state change can race with the final
   * event, then any in-progress play session is closed out.
   */
  stop() {
    this.onRemoveListeners.forEach((listener) => listener());
    this.onRemoveListeners = [];
    this.flushStopEvent('untracked');
  }

  parseStartEventProperties(nextState: VideoState): Record<string, string | number | boolean> {
    return {
      ...parseVideoEventProperties(nextState.lastEvent),
      [DURATION]: nextState.lastEvent?.duration ?? 0,
      [START_TIME]: nextState.lastEvent?.start_time ?? 0,
      [POSITION]: nextState.position ?? 0,
      [DELIVERY_MODE]: this.getDeliveryMode(),
    };
  }

  private getDeliveryMode(): 'video' | 'audio' {
    return this.videoEl instanceof HTMLAudioElement ? 'audio' : 'video';
  }

  parseStopEventProperties(nextState: VideoState): Record<string, string | number | boolean> {
    return {
      ...this.parseStartEventProperties(nextState),
      // lastEvent.start_time is the playhead at the time of the event, which for a stop event is
      // where playback ended, so the position captured when the play session began is preferred.
      [START_TIME]: this.playStartTime ?? nextState.lastEvent?.start_time ?? 0,
      [WATCH_DURATION]: nextState.watchTime ?? 0,
      [PERCENT_COMPLETED]: calculatePercentCompleted(nextState.position ?? 0, nextState.lastEvent?.duration ?? 0),
      ...(nextState.errorMessage ? { [ERROR_MESSAGE]: nextState.errorMessage } : {}),
    };
  }
}

function calculatePercentCompleted(currentTime: number, duration: number) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (currentTime / duration) * 100));
}

export type VideoCaptureOptions = {
  vendor?: VideoVendor;
  extraEventProperties?: Record<string, string | number | boolean>;
};

type UntrackVideoResult = () => void;

export type TrackVideoResult = UntrackVideoResult | Error;

/**
 * Track video analytics events for an HTML video or audio element or embedded video player.js instance.
 *
 * Captures [Amplitude] Content Started and [Amplitude] Content Stopped events.
 *
 * @experimental This function is experimental and may not be stable.
 * @param amplitude - The Amplitude client instance.
 * @param videoEl - The HTML video or audio element or embedded video player.js instance to capture events from.
 * @param options - The options for the video capture.
 * @returns A function to stop the video capture.
 */
export function trackVideo(
  amplitude: BrowserClient,
  videoEl: HTMLMediaElement | EmbeddedVideoPlayer,
  options: VideoCaptureOptions = {},
): TrackVideoResult {
  const videoCapture = new VideoCapture(amplitude);
  if (videoEl instanceof HTMLMediaElement) {
    videoCapture.withVideoElement(videoEl);
  } else {
    videoCapture.withEmbeddedPlayer(videoEl);
  }
  if (options.vendor) {
    videoCapture.withVendor(options.vendor);
  }
  const extraEventProperties = options.extraEventProperties ?? {};

  try {
    videoCapture
      .withExtraEventProperties({
        view_session_id: UUID(),
        ...extraEventProperties,
      })
      .captureVideoStarted()
      .captureVideoStopped()
      .start();
  } catch (error) {
    return error as Error;
  }

  return () => videoCapture.stop();
}
