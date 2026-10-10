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

function getVideoData(videoEl: HTMLMediaElement | MuxElement, stopReason?: VideoStopReason) {
  const currentTime = videoEl.currentTime;
  const duration = videoEl.duration;
  return {
    duration,
    position: currentTime,
    percent_completed: calculatePercentCompleted(currentTime, duration),
    ...(stopReason !== undefined ? { stop_reason: stopReason } : {}),
  };
}

function getMediaErrorMessage(error: MediaError | null | undefined) {
  if (!error) {
    return 'Media element error';
  }
  return `Media element error (code ${error.code})${error.message ? `: ${error.message}` : ''}`;
}

function getEffectiveSource(videoEl: HTMLMediaElement | MuxElement): MediaProvider | string | null {
  const media = videoEl as Partial<HTMLMediaElement>;
  return media.srcObject || media.currentSrc || media.src || videoEl.getAttribute('src');
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
export function trackHtmlVideo(videoEl: HTMLMediaElement | MuxElement, handlers: VideoHandler, vendor?: Vendor) {
  // reaching the end of the media fires `pause` right before `ended`, so end of media is
  // reported once, as `ended`
  let hasReportedEnded = false;

  const playHandler = () => {
    hasReportedEnded = false;
    const startEvent: VideoEvent = {
      ...getVideoData(videoEl),
      ...(vendor === 'mux' ? getMuxMetadata(videoEl) : {}),
    };
    handlers.onPlay(startEvent);
  };
  videoEl.addEventListener('play', playHandler);

  const endedHandler = () => {
    if (hasReportedEnded) {
      return;
    }
    hasReportedEnded = true;
    const endedEvent: VideoEvent = {
      ...getVideoData(videoEl, 'ended'),
      ...(vendor === 'mux' ? getMuxMetadata(videoEl) : {}),
    };
    handlers.onEnded(endedEvent);
  };
  videoEl.addEventListener('ended', endedHandler);

  const pauseHandler = () => {
    if ((videoEl as HTMLMediaElement).ended === true) {
      endedHandler();
      return;
    }
    const pauseEvent: VideoEvent = {
      ...getVideoData(videoEl, 'paused'),
      ...(vendor === 'mux' ? getMuxMetadata(videoEl) : {}),
    };
    handlers.onPause(pauseEvent);
  };
  videoEl.addEventListener('pause', pauseHandler);

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

  const errorHandler = () => {
    handlers.onError(getMediaErrorMessage((videoEl as HTMLMediaElement).error));
  };
  videoEl.addEventListener('error', errorHandler);

  let videoData: VideoEvent | null = null;
  const timeupdateHandler = () => {
    const media = videoEl as HTMLMediaElement;

    // if the video is playing again after being previously ended, resume playback
    const duration = videoEl.duration;
    const isUnloadedTick = typeof duration !== 'number' || Number.isNaN(duration);
    const isPlayheadMoving = !isUnloadedTick && media.ended !== true && media.paused === false;
    if (hasReportedEnded && videoData === null && isPlayheadMoving) {
      playHandler();
    }

    const timeupdateEvent: TimeUpdateEvent = {
      position: videoEl.currentTime,
      isSeeking: !!media.seeking,
    };
    handlers.onTimeUpdate(timeupdateEvent);

    if (hasReportedEnded && isUnloadedTick) {
      return;
    }
    // if a new video is loaded in place of the previous one, reset the ended flag
    if (hasReportedEnded && videoData === null && media.ended !== true) {
      hasReportedEnded = false;
    }

    // save the current video state to be used in 'ended' events if current video is unloadedWhen a source is replaced while the previous media is seeking, this onEnded transition preserves VideoObserver.state.isSeeking, and the subsequent onPlay transition preserves it again. Because aborting the old load need not emit seeked, every time update for the replacement then follows event.isSeeking || this.state.isSeeking and is treated as a seek indefinitely, so the new stream's play_time remains zero and its queued stop event is not updated. Clear the outstanding seeking state at the source-change boundary or when the replacement starts.
    videoData = getVideoData(videoEl);
    if (vendor === 'mux') {
      videoData = { ...videoData, ...getMuxMetadata(videoEl) };
    }
  };
  videoEl.addEventListener('timeupdate', timeupdateHandler);

  // report the media that was playing before a source change as over, using the last
  // timeupdate because the element has already been reset by the time we hear about it
  const endCurrentMedia = () => {
    if (videoData && !hasReportedEnded) {
      hasReportedEnded = true;
      handlers.onEnded(videoData);
    }
    videoData = null;
  };

  let currentSource = getEffectiveSource(videoEl);
  const loadStartHandler = () => {
    const nextSource = getEffectiveSource(videoEl);
    if (nextSource !== currentSource) {
      currentSource = nextSource;
      endCurrentMedia();
    }
  };
  videoEl.addEventListener('loadstart', loadStartHandler);

  // `emptied` fires whenever loaded media is torn down, which also covers swaps that keep the
  // same URL (e.g. hls.js re-attaching a MediaSource), `srcObject` and `<source>` changes
  videoEl.addEventListener('emptied', endCurrentMedia);
  const media = videoEl as HTMLMediaElement;

  // if the media is already playing when tracking begins, emit a play event
  if (media.paused === false && media.ended !== true) {
    playHandler();
  }

  return () => {
    videoEl.removeEventListener('play', playHandler);
    videoEl.removeEventListener('ended', endedHandler);
    videoEl.removeEventListener('pause', pauseHandler);
    videoEl.removeEventListener('seeking', seekingHandler);
    videoEl.removeEventListener('seeked', seekedHandler);
    videoEl.removeEventListener('error', errorHandler);
    videoEl.removeEventListener('timeupdate', timeupdateHandler);
    videoEl.removeEventListener('loadstart', loadStartHandler);
    videoEl.removeEventListener('emptied', endCurrentMedia);
  };
}

async function getTimeUpdateInfo(player: EmbeddedVideoPlayer) {
  const currentTime = await new Promise<number>((resolve) => player.getCurrentTime(resolve));
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
    position: currentTime,
    percent_completed: calculatePercentCompleted(currentTime, duration),
    ...(stopReason !== undefined ? { stop_reason: stopReason } : {}),
    ...vendorMetadata,
  };
}

export function trackEmbeddedVideo(player: EmbeddedVideoPlayer, handlers: VideoHandler, vendor: Vendor | null = null) {
  const onUnsubscribe: (() => void)[] = [];
  const readyHandler = () => {
    const { elem } = player;
    let isSeeking = false;

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

    const seekingHandler = () => {
      isSeeking = true;
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
      isSeeking = false;
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
            isSeeking: isSeeking,
          };
          handlers.onTimeUpdate(timeupdateEvent);
        })
        .catch((error) => {
          handlers.onError(`Error getting iframe metadata from 'timeupdate' handler: ${error as string}`);
        });
    };
    player.on('timeupdate', timeupdateHandler);
    onUnsubscribe.push(() => player.off('timeupdate', timeupdateHandler));

    // if the player is already playing when tracking begins, emit a play event
    if (player.getPaused) {
      try {
        player.getPaused((paused) => {
          if (paused === false) {
            playHandler();
          }
        });
      } catch (error) {
        handlers.onError(`Error getting paused state from 'ready' handler: ${error as string}`);
      }
    }
  };
  player.on('ready', readyHandler);

  return () => {
    player.off('ready', readyHandler);
    onUnsubscribe.forEach((unsubscribe) => unsubscribe());
  };
}
