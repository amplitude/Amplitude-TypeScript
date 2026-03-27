import { VideoHandler, StartVideoEvent, PauseVideoEvent, EndedVideoEvent } from './types';

function getPlayData(videoEl: HTMLVideoElement) {
  return {
    program_duration: videoEl.duration,
  };
}

function getPauseData(videoEl: HTMLVideoElement) {
  return {
    ...getPlayData(videoEl),
    last_position: videoEl.currentTime,
    percent_completed: (videoEl.currentTime / videoEl.duration) * 100,
  };
}

function getEndData(videoEl: HTMLVideoElement) {
  return {
    ...getPauseData(videoEl),
  };
}

/**
 * Track a standard HTML video element.
 *
 * @param videoEl - The HTML video element to track.
 * @param handlers - The video handlers to call when on video lifecycle events.
 * @param customMetadata - Custom metadata to add to all the video events.
 * @returns A function to untrack the video.
 */
export function trackHtmlVideo(
  videoEl: HTMLVideoElement,
  handlers: VideoHandler,
  customMetadata: Record<string, string | number | boolean>,
) {
  const playHandler = () => {
    const startEvent: StartVideoEvent = {
      ...getPlayData(videoEl),
      ...customMetadata,
    };
    handlers.onPlay(startEvent);
  };
  videoEl.addEventListener('play', playHandler);

  const pauseHandler = () => {
    const pauseEvent: PauseVideoEvent = {
      ...getPauseData(videoEl),
      ...customMetadata,
    };
    handlers.onPause(pauseEvent);
  };
  videoEl.addEventListener('pause', pauseHandler);

  const endedHandler = () => {
    const endedEvent: EndedVideoEvent = {
      ...getEndData(videoEl),
      ...customMetadata,
    };
    handlers.onEnded(endedEvent);
  };
  videoEl.addEventListener('ended', endedHandler);

  return () => {
    videoEl.removeEventListener('play', playHandler);
    videoEl.removeEventListener('pause', pauseHandler);
    videoEl.removeEventListener('ended', endedHandler);
  };
}

/**
 * Track a Mux HTML video element.
 *
 * @param videoEl - The HTML Mux video element to track.
 * @param handlers - The video handlers to call when on video lifecycle events.
 * @param customMetadata - Custom metadata to add to all the video events.
 * @returns A function to untrack the video.
 */
export function trackMuxHtmlVideo(
  videoEl: HTMLVideoElement,
  handlers: VideoHandler,
  customMetadata: Record<string, string | number | boolean>,
) {
  const muxMetadata = {
    mux_playback_id: videoEl.getAttribute('playback-id'),
    mux_video_id: videoEl.getAttribute('metadata-video-id'),
    mux_video_title: videoEl.getAttribute('metadata-video-title'),
  };
  const playHandler = () => {
    const startEvent: StartVideoEvent = {
      ...getPlayData(videoEl),
      ...muxMetadata,
      ...customMetadata,
    };
    handlers.onPlay(startEvent);
  };
  videoEl.addEventListener('play', playHandler);

  const pauseHandler = () => {
    const pauseEvent: PauseVideoEvent = {
      ...getPauseData(videoEl),
      ...muxMetadata,
      ...customMetadata,
    };
    handlers.onPause(pauseEvent);
  };
  videoEl.addEventListener('pause', pauseHandler);

  const endedHandler = () => {
    const endedEvent: EndedVideoEvent = {
      ...getEndData(videoEl),
      ...muxMetadata,
      ...customMetadata,
    };
    handlers.onEnded(endedEvent);
  };
  videoEl.addEventListener('ended', endedHandler);

  return () => {
    videoEl.removeEventListener('play', playHandler);
    videoEl.removeEventListener('pause', pauseHandler);
    videoEl.removeEventListener('ended', endedHandler);
  };
}

// export function trackMuxEmbeddedVideo;

// export function trackYoutubeEmbeddedVideo;

// export function trackVimeoEmbeddedVideo;
