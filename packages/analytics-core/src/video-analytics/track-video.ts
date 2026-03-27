import { VideoHandler, StartVideoEvent, PauseVideoEvent, EndedVideoEvent, MuxEmbeddedPlayer } from './types';

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

async function getMuxIframeMetadata(player: MuxEmbeddedPlayer, elem: HTMLIFrameElement) {
  const [duration, currentTime] = await Promise.all([
    new Promise<number>((resolve) => player.getDuration(resolve)),
    new Promise<number>((resolve) => player.getCurrentTime(resolve)),
  ]);
  
  const url = new URL(elem.getAttribute('src') || '');
  const metadataVideoTitle = url.searchParams.get('metadata-video-title');
  const metadataVideoId = url.searchParams.get('metadata-video-id');
  const playerId = url.pathname.split('/').pop();
  return {
    percent_completed: (currentTime / duration) * 100,
    program_duration: duration,
    current_time: currentTime,
    mux_video_title: metadataVideoTitle,
    mux_video_id: metadataVideoId,
    mux_playback_id: playerId,
  };
}

export function trackMuxEmbeddedVideo(
  player: MuxEmbeddedPlayer,
  handlers: VideoHandler,
  customMetadata: Record<string, string | number | boolean>,
) {
  player.on('ready', () => {
    const { elem } = player;
    const playHandler = async () => {
      const playerState = await getMuxIframeMetadata(player, elem);
      const startEvent: StartVideoEvent = {
        ...playerState,
        ...customMetadata,
      };
      handlers.onPlay(startEvent);
    };
    player.on('play', playHandler);

    const pauseHandler = async () => {
      const playerState = await getMuxIframeMetadata(player, elem);
      const pauseEvent: PauseVideoEvent = {
        ...playerState,
        ...customMetadata,
      };
      handlers.onPause(pauseEvent);
    };
    player.on('pause', pauseHandler);
  
    const endedHandler = async () => {
      const playerState = await getMuxIframeMetadata(player, elem);
      const endedEvent: EndedVideoEvent = {
        ...playerState,
        ...customMetadata,
      };
      handlers.onEnded(endedEvent);
    };
    player.on('ended', endedHandler);
  });
}

// export function trackYoutubeEmbeddedVideo;

// export function trackVimeoEmbeddedVideo;
