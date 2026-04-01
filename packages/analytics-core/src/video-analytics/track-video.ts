import { VideoHandler, VideoEvent, MuxEmbeddedPlayer, MuxElement } from './types';

function getPlayData(videoEl: HTMLVideoElement | MuxElement) {
  return {
    program_duration: videoEl.duration,
  };
}

function calculatePercentCompleted(currentTime: number, duration: number) {
  let percentCompleted = 0;
  if (Number.isFinite(currentTime) && Number.isFinite(duration) && duration > 0) {
    const rawPercent = (currentTime / duration) * 100;
    // Clamp to [0, 100] to avoid invalid analytics values.
    percentCompleted = Math.min(100, Math.max(0, rawPercent));
  }
  return percentCompleted;
}

function getPauseData(videoEl: HTMLVideoElement | MuxElement) {
  const currentTime = videoEl.currentTime;
  const duration = videoEl.duration;

  return {
    ...getPlayData(videoEl),
    last_position: currentTime,
    percent_completed: calculatePercentCompleted(currentTime, duration),
  };
}

function getEndData(videoEl: HTMLVideoElement | MuxElement) {
  return {
    ...getPauseData(videoEl),
  };
}

function getMuxMetadata(videoEl: MuxElement) {
  return {
    mux_playback_id: videoEl.getAttribute('playback-id'),
    mux_video_id: videoEl.getAttribute('metadata-video-id'),
    mux_video_title: videoEl.getAttribute('metadata-video-title'),
    mux_session_id: videoEl.getAttribute('session-id'),
  };
}

/**
 * Track a standard HTML video element.
 *
 * @param videoEl - The HTML video element to track.
 * @param handlers - The video handlers to call when on video lifecycle events.
 * @returns A function to untrack the video.
 */
export function trackHtmlVideo(
  videoEl: HTMLVideoElement | MuxElement,
  handlers: VideoHandler,
  vendor?: 'mux', // if new vendors add them to this
) {
  const playHandler = () => {
    const startEvent: VideoEvent = {
      ...getPlayData(videoEl),
      ...(vendor === 'mux' ? getMuxMetadata(videoEl) : {}),
    };
    handlers.onPlay(startEvent);
  };
  videoEl.addEventListener('play', playHandler);

  const pauseHandler = () => {
    const pauseEvent: VideoEvent = {
      ...getPauseData(videoEl),
      ...(vendor === 'mux' ? getMuxMetadata(videoEl) : {}),
    };
    handlers.onPause(pauseEvent);
  };
  videoEl.addEventListener('pause', pauseHandler);

  const endedHandler = () => {
    const endedEvent: VideoEvent = {
      ...getEndData(videoEl),
      ...(vendor === 'mux' ? getMuxMetadata(videoEl) : {}),
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
 * @returns A function to untrack the video.
 */
export function trackMuxHtmlVideo(videoEl: MuxElement, handlers: VideoHandler) {
  return trackHtmlVideo(videoEl, handlers, 'mux');
}

async function getMuxIframeMetadata(player: MuxEmbeddedPlayer, elem: HTMLIFrameElement) {
  const [duration, currentTime] = await Promise.all([
    new Promise<number>((resolve) => player.getDuration(resolve)),
    new Promise<number>((resolve) => player.getCurrentTime(resolve)),
  ]);

  let url,
    metadataVideoTitle = null,
    metadataVideoId = null,
    playerId = null;
  try {
    url = new URL(elem.getAttribute('src') as string);
    metadataVideoTitle = url.searchParams.get('metadata-video-title');
    metadataVideoId = url.searchParams.get('metadata-video-id');
    playerId = url.pathname.split('/').pop();
  } catch (error) {
    // invalid or no src url, skip the header metadata
  }
  return {
    percent_completed: calculatePercentCompleted(currentTime, duration),
    program_duration: duration,
    last_position: currentTime,
    mux_video_title: metadataVideoTitle,
    mux_video_id: metadataVideoId,
    mux_playback_id: playerId,
  };
}

export function trackMuxEmbeddedVideo(player: MuxEmbeddedPlayer, handlers: VideoHandler) {
  const onUnsubscribe: (() => void)[] = [];
  const readyHandler = () => {
    const { elem } = player;
    const playHandler = () => {
      getMuxIframeMetadata(player, elem)
        .then((playerState) => {
          const startEvent: VideoEvent = {
            ...playerState,
          };
          handlers.onPlay(startEvent);
        })
        .catch((error) => {
          handlers.onError(`Error getting Mux iframe metadata from 'play' handler: ${error as string}`);
        });
    };
    player.on('play', playHandler);
    onUnsubscribe.push(() => player.off('play', playHandler));

    const pauseHandler = () => {
      getMuxIframeMetadata(player, elem)
        .then((playerState) => {
          const pauseEvent: VideoEvent = {
            ...playerState,
          };
          handlers.onPause(pauseEvent);
        })
        .catch((error) => {
          handlers.onError(`Error getting Mux iframe metadata from 'pause' handler: ${error as string}`);
        });
    };
    player.on('pause', pauseHandler);
    onUnsubscribe.push(() => player.off('pause', pauseHandler));

    const endedHandler = () => {
      getMuxIframeMetadata(player, elem)
        .then((playerState) => {
          const endedEvent: VideoEvent = {
            ...playerState,
          };
          handlers.onEnded(endedEvent);
        })
        .catch((error) => {
          handlers.onError(`Error getting Mux iframe metadata from 'ended' handler: ${error as string}`);
        });
    };
    player.on('ended', endedHandler);
    onUnsubscribe.push(() => player.off('ended', endedHandler));
  };
  player.on('ready', readyHandler);

  return () => {
    player.off('ready', readyHandler);
    onUnsubscribe.forEach((unsubscribe) => unsubscribe());
  };
}

export function trackYoutubeEmbeddedVideo() {
  throw new Error('Not implemented');
}

export function trackVimeoEmbeddedVideo() {
  throw new Error('Not implemented');
}
