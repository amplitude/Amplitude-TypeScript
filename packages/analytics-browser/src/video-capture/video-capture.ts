import { VideoState, VideoObserver, BrowserClient, EmbeddedVideoPlayer, VideoVendor } from '@amplitude/analytics-core';

export class VideoCapture {
  private videoEl: HTMLVideoElement | null = null;
  private embeddedVideoPlayer: EmbeddedVideoPlayer | null = null;
  private vendor?: VideoVendor;
  private extraEventProperties: Record<string, string | number | boolean> = {};

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
  withVendor(vendor?: VideoVendor): VideoCapture {
    if (!vendor) {
      return this;
    }
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
        // placeholder for Heartbeat Start Event
        this.amplitude.track('Video Content Started', {
          ...this.extraEventProperties,
          ...nextState.lastEvent,
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
      if (previousState.playbackState === 'playing' && nextState.playbackState !== 'playing') {
        // placeholder for Heartbeat Stop Event
        this.amplitude.track('Video Content Stopped', {
          ...this.extraEventProperties,
          ...nextState.lastEvent,
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
): () => void {
  const videoCapture = new VideoCapture(amplitude);
  if (videoEl instanceof HTMLVideoElement) {
    videoCapture.withVideoElement(videoEl);
  } else {
    videoCapture.withEmbeddedPlayer(videoEl);
  }
  videoCapture
    .withVendor(options.vendor)
    .withExtraEventProperties(options.extraEventProperties ?? {})
    .captureVideoStarted()
    .captureVideoStopped()
    .start();

  return () => videoCapture.stop();
}
