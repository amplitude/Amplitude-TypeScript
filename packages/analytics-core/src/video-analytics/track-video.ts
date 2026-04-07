import {
  VideoHandler,
  VideoEvent,
  EmbeddedVideoPlayer,
  MuxElement,
  Vendor,
  VideoStopReason,
  TimeUpdateEvent,
} from './types';

function calculatePercentCompleted(currentTime: number, duration: number) {
  let percentCompleted = 0;
  if (Number.isFinite(currentTime) && Number.isFinite(duration) && duration > 0) {
    const rawPercent = (currentTime / duration) * 100;
    percentCompleted = Math.min(100, Math.max(0, rawPercent));
  }
  return percentCompleted;
}

function getVideoData(videoEl: HTMLVideoElement | MuxElement, stopReason?: VideoStopReason) {
  const currentTime = videoEl.currentTime;
  const duration = videoEl.duration;
  return {
    duration,
    start_time: currentTime,
    last_position: currentTime,
    percent_completed: calculatePercentCompleted(currentTime, duration),
    ...(stopReason !== undefined ? { stop_reason: stopReason } : {}),
  };
}

function getMuxMetadata(videoEl: MuxElement) {
  return {
    mux_playback_id: videoEl.getAttribute('playback-id'),
    mux_video_id: videoEl.getAttribute('metadata-video-id'),
    mux_video_title: videoEl.getAttribute('metadata-video-title'),
  };
}

/**
 * Track a standard HTML video element.
 *
 * @param videoEl - The HTML video element to track.
 * @param handlers - The video handlers to call when on video lifecycle events.
 * @returns A function to untrack the video.
 */
export function trackHtmlVideo(videoEl: HTMLVideoElement | MuxElement, handlers: VideoHandler, vendor?: Vendor) {
  const playHandler = () => {
    const startEvent: VideoEvent = {
      ...getVideoData(videoEl),
      ...(vendor === 'mux' ? getMuxMetadata(videoEl) : {}),
    };
    handlers.onPlay(startEvent);
  };
  videoEl.addEventListener('play', playHandler);

  const pauseHandler = () => {
    const pauseEvent: VideoEvent = {
      ...getVideoData(videoEl, 'paused'),
      ...(vendor === 'mux' ? getMuxMetadata(videoEl) : {}),
    };
    handlers.onPause(pauseEvent);
  };
  videoEl.addEventListener('pause', pauseHandler);

  const endedHandler = () => {
    const endedEvent: VideoEvent = {
      ...getVideoData(videoEl, 'ended'),
      ...(vendor === 'mux' ? getMuxMetadata(videoEl) : {}),
    };
    handlers.onEnded(endedEvent);
  };
  videoEl.addEventListener('ended', endedHandler);

  const seekingHandler = () => {
    const seekingEvent: VideoEvent = {
      ...getVideoData(videoEl, 'seeking'),
      ...(vendor === 'mux' ? getMuxMetadata(videoEl) : {}),
    };
    handlers.onSeeking(seekingEvent);
  };
  videoEl.addEventListener('seeking', seekingHandler);

  const seekedHandler = () => {
    const seekedEvent: VideoEvent = {
      ...getVideoData(videoEl),
      ...(vendor === 'mux' ? getMuxMetadata(videoEl) : {}),
    };
    handlers.onSeeked(seekedEvent);
  };
  videoEl.addEventListener('seeked', seekedHandler);

  const timeupdateHandler = () => {
    const media = videoEl as HTMLVideoElement;
    const timeupdateEvent: TimeUpdateEvent = {
      position: videoEl.currentTime,
      isSeeking: !!media.seeking,
    };
    handlers.onTimeUpdate(timeupdateEvent);
  };
  videoEl.addEventListener('timeupdate', timeupdateHandler);

  return () => {
    videoEl.removeEventListener('play', playHandler);
    videoEl.removeEventListener('pause', pauseHandler);
    videoEl.removeEventListener('ended', endedHandler);
    videoEl.removeEventListener('seeking', seekingHandler);
    videoEl.removeEventListener('seeked', seekedHandler);
    videoEl.removeEventListener('timeupdate', timeupdateHandler);
  };
}

async function getTimeUpdateInfo(player: EmbeddedVideoPlayer) {
  const [currentTime] = await Promise.all([new Promise<number>((resolve) => player.getCurrentTime(resolve))]);
  return { currentTime };
}

async function getIframeMetadata(
  player: EmbeddedVideoPlayer,
  elem: HTMLIFrameElement,
  vendor: Vendor | null,
  stopReason?: VideoStopReason,
) {
  const [duration, currentTime] = await Promise.all([
    new Promise<number>((resolve) => player.getDuration(resolve)),
    new Promise<number>((resolve) => player.getCurrentTime(resolve)),
  ]);

  const vendorMetadata: Record<string, string | null | undefined> = {};
  if (vendor === 'mux') {
    let url;
    try {
      url = new URL(elem.getAttribute('src') as string);
      vendorMetadata.mux_video_title = url.searchParams.get('metadata-video-title');
      vendorMetadata.mux_video_id = url.searchParams.get('metadata-video-id');
      vendorMetadata.mux_playback_id = url.pathname.split('/').pop();
    } catch (error) {
      // invalid or no src url, skip the header metadata
    }
  }
  return {
    duration,
    start_time: currentTime,
    last_position: currentTime,
    percent_completed: calculatePercentCompleted(currentTime, duration),
    ...(stopReason !== undefined ? { stop_reason: stopReason } : {}),
    ...vendorMetadata,
  };
}

export function trackEmbeddedVideo(player: EmbeddedVideoPlayer, handlers: VideoHandler, vendor: Vendor | null = null) {
  const onUnsubscribe: (() => void)[] = [];
  const readyHandler = () => {
    const { elem } = player;
    const playHandler = () => {
      getIframeMetadata(player, elem, vendor)
        .then((playerState) => {
          handlers.onPlay(playerState);
        })
        .catch((error) => {
          handlers.onError(`Error getting iframe metadata from 'play' handler: ${error as string}`);
        });
    };
    player.on('play', playHandler);
    onUnsubscribe.push(() => player.off('play', playHandler));

    const pauseHandler = () => {
      getIframeMetadata(player, elem, vendor, 'paused')
        .then((playerState) => {
          handlers.onPause(playerState);
        })
        .catch((error) => {
          handlers.onError(`Error getting iframe metadata from 'pause' handler: ${error as string}`);
        });
    };
    player.on('pause', pauseHandler);
    onUnsubscribe.push(() => player.off('pause', pauseHandler));

    const endedHandler = () => {
      getIframeMetadata(player, elem, vendor, 'ended')
        .then((playerState) => {
          handlers.onEnded(playerState);
        })
        .catch((error) => {
          handlers.onError(`Error getting iframe metadata from 'ended' handler: ${error as string}`);
        });
    };
    player.on('ended', endedHandler);
    onUnsubscribe.push(() => player.off('ended', endedHandler));

    const seekingHandler = () => {
      getIframeMetadata(player, elem, vendor, 'seeking')
        .then((playerState) => {
          handlers.onSeeking(playerState);
        })
        .catch((error) => {
          handlers.onError(`Error getting iframe metadata from 'seeking' handler: ${error as string}`);
        });
    };
    player.on('seeking', seekingHandler);
    onUnsubscribe.push(() => player.off('seeking', seekingHandler));

    const seekedHandler = () => {
      getIframeMetadata(player, elem, vendor)
        .then((playerState) => {
          handlers.onSeeked(playerState);
        })
        .catch((error) => {
          handlers.onError(`Error getting iframe metadata from 'seeked' handler: ${error as string}`);
        });
    };
    player.on('seeked', seekedHandler);
    onUnsubscribe.push(() => player.off('seeked', seekedHandler));

    const timeupdateHandler = () => {
      getTimeUpdateInfo(player)
        .then(({ currentTime }) => {
          const timeupdateEvent: TimeUpdateEvent = {
            position: currentTime,
            isSeeking: false,
          };
          handlers.onTimeUpdate(timeupdateEvent);
        })
        .catch((error) => {
          handlers.onError(`Error getting iframe metadata from 'timeupdate' handler: ${error as string}`);
        });
    };
    player.on('timeupdate', timeupdateHandler);
    onUnsubscribe.push(() => player.off('timeupdate', timeupdateHandler));
  };
  player.on('ready', readyHandler);

  return () => {
    player.off('ready', readyHandler);
    onUnsubscribe.forEach((unsubscribe) => unsubscribe());
  };
}
