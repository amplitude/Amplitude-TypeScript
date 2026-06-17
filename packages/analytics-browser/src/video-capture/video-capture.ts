import {
  VideoState,
  VideoObserver,
  BrowserClient,
  EmbeddedVideoPlayer,
  VideoVendor,
  UUID,
  BaseEvent,
} from '@amplitude/analytics-core';
import Heartbeat from '@amplitude/analytics-core/src/heartbeat';

//const DEFAULT_HEARTBEAT_INTERVAL = 60_000;
const DEFAULT_HEARTBEAT_INTERVAL = 500;
const DEFAULT_HEARTBEAT_DELAY_TIMEOUT = 3_600_000; // 1 hour
export class VideoCapture {
  private videoEl: HTMLVideoElement | null = null;
  private heartbeat: Heartbeat | null = null;
  private embeddedVideoPlayer: EmbeddedVideoPlayer | null = null;
  private vendor?: VideoVendor;
  private extraEventProperties: Record<string, string | number | boolean> = {};
  private stopEvent: BaseEvent | null = null;
  private listeners: ((previousState: VideoState, nextState: VideoState) => void)[] = [];
  private onRemoveListeners: (() => void)[] = [];

  constructor(private readonly amplitude: BrowserClient) {}

  /**
   * Specify a video element to capture events from
   *
   * @param videoEl - The HTML video element to capture events from.
   * @returns The VideoCapture instance.
   */
  withVideoElement(videoEl: HTMLVideoElement): VideoCapture {
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
   * Track a "Video Content Started" event every time the video starts playing
   * @returns The VideoCapture instance.
   */
  captureVideoStarted(): VideoCapture {
    this.listeners.push((previousState, nextState) => {
      if (previousState.playbackState !== 'playing' && nextState.playbackState === 'playing') {
        // Queue up a stop event to go along with the start event
        const startEvent = {
          event_type: 'Video Content Started',
          event_properties: {
            ...nextState.lastEvent,
            ...this.extraEventProperties,
          },
        };
        this.stopEvent = {
          ...startEvent,
          event_type: 'Video Content Stopped',
          event_properties: {
            ...nextState.lastEvent,
            watch_duration: nextState.watchTime,
            position: nextState.position,
            percent_completed: ((nextState.position ?? 0) / (nextState.lastEvent?.duration ?? 0)) * 100,
            ...this.extraEventProperties,
          },
        };
        const start = this.heartbeat?.trackNoDelay(startEvent);
        const stop = this.heartbeat?.track(this.stopEvent);

        // if either start or stop fails, stop capturing
        void Promise.all([start, stop]).then((results) => {
          results.forEach((result) => {
            if (result && (result.code < 200 || result.code >= 400)) {
              // delayed event service is down, stop capturing
              // TODO: add a logging event here
              this.stop();
            }
          });
        });
      }
    });
    return this;
  }

  /**
   * Track a "Video Content Stopped" event every time the video stops playing
   * @returns The VideoCapture instance.
   */
  captureVideoStopped(): VideoCapture {
    this.listeners.push((previousState, nextState) => {
      // update the delayed event properties to have
      // the most up-to-date values
      if (this.stopEvent) {
        this.stopEvent.event_properties = {
          ...this.stopEvent.event_properties,
          watch_duration: nextState.watchTime,
          position: nextState.position,
          percent_completed: ((nextState.position ?? 0) / (nextState.lastEvent?.duration ?? 0)) * 100,
          ...this.extraEventProperties,
        };
      }
      if (previousState.playbackState === 'playing' && nextState.playbackState !== 'playing') {
        void this.heartbeat?.flush().then((results) => {
          results.forEach((result) => {
            if (result.code < 200 || result.code >= 400) {
              // delayed event service is down, stop capturing
              // TODO: add a logging event here
              this.stop();
            }
          });
        });
      }
    });
    return this;
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
    this.heartbeat = new Heartbeat(this.amplitude, DEFAULT_HEARTBEAT_INTERVAL, DEFAULT_HEARTBEAT_DELAY_TIMEOUT);
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

  stop() {
    this.onRemoveListeners.forEach((listener) => listener());
    this.onRemoveListeners = [];
  }
}

export type VideoCaptureOptions = {
  vendor?: VideoVendor;
  extraEventProperties?: Record<string, string | number | boolean>;
};

type UntrackVideoResult = () => void;

export type TrackVideoResult = UntrackVideoResult | Error;

/**
 * Track video analytics events for an HTML video element or embedded video player.js instance.
 *
 * Captures Video Started and Video Stopped events.
 *
 * @experimental This function is experimental and may not be stable.
 * @param amplitude - The Amplitude client instance.
 * @param videoEl - The HTML video element or embedded video player.js instance to capture events from.
 * @param options - The options for the video capture.
 * @returns A function to stop the video capture.
 */
export function trackVideo(
  amplitude: BrowserClient,
  videoEl: HTMLVideoElement | EmbeddedVideoPlayer,
  options: VideoCaptureOptions = {},
): TrackVideoResult {
  const videoCapture = new VideoCapture(amplitude);
  if (videoEl instanceof HTMLVideoElement) {
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
