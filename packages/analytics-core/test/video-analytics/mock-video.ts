import type { MuxEmbeddedPlayer, VideoHandler } from '../../src/video-analytics/types';

export type MockMuxEmbeddedPlayer = MuxEmbeddedPlayer & {
  emit: (event: string) => void;
  setCurrentTime: (time: number) => void;
};

/**
 * Minimal player.js-style mock for {@link trackMuxEmbeddedVideo} tests.
 */
export function createMockMuxEmbeddedPlayer(options?: {
  playbackId?: string;
  metadataVideoTitle?: string;
  metadataVideoId?: string;
}): { player: MockMuxEmbeddedPlayer } {
  const playbackId = options?.playbackId ?? 'dE02GfTAlJD4RcqNAlgiS2m00LqbdFqlBm';
  const metadataVideoTitle = options?.metadataVideoTitle ?? 'My Video';
  const metadataVideoId = options?.metadataVideoId ?? 'video-123';

  const params = new URLSearchParams({
    'metadata-video-title': metadataVideoTitle,
    'metadata-video-id': metadataVideoId,
  });
  const iframe = document.createElement('iframe');
  iframe.setAttribute('src', `https://player.mux.com/${playbackId}?${params.toString()}`);

  const listeners = new Map<string, Set<() => void>>();
  let currentTime = 0;
  const duration = 10;

  const on = (event: string, callback: () => void) => {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(callback);
  };

  const off = (event: string, callback: () => void) => {
    listeners.get(event)?.delete(callback);
  };

  const emit = (event: string) => {
    const cbs = listeners.get(event);
    if (cbs) {
      [...cbs].forEach((cb) => {
        cb();
      });
    }
  };

  const getDuration = (cb: (d: number) => void) => {
    cb(duration);
  };

  const getCurrentTime = (cb: (t: number) => void) => {
    cb(currentTime);
  };

  const player: MockMuxEmbeddedPlayer = {
    elem: iframe,
    on,
    off,
    getDuration,
    getCurrentTime,
    emit,
    setCurrentTime(t: number) {
      currentTime = t;
    },
  };

  return { player };
}

export function createMockVideo(options: { isMux: boolean } = { isMux: false }): {
  video: HTMLVideoElement;
  handler: VideoHandler;
} {
  const video = document.createElement('video');

  if (options.isMux) {
    video.setAttribute('playback-id', 'playback-id-123');
    video.setAttribute('metadata-video-id', 'video-id-123');
    video.setAttribute('metadata-video-title', 'video title');
  }

  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: jest.fn(() => {
      Object.defineProperty(video, 'duration', {
        configurable: true,
        value: 10,
      });
      video.dispatchEvent(new Event('play'));
      return Promise.resolve(undefined);
    }),
  });

  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: jest.fn(() => {
      Object.defineProperty(video, 'currentTime', {
        configurable: true,
        value: 5,
      });
      video.dispatchEvent(new Event('pause'));
      return Promise.resolve(undefined);
    }),
  });

  Object.defineProperty(HTMLMediaElement.prototype, 'ended', {
    configurable: true,
    value: jest.fn(() => {
      Object.defineProperty(video, 'currentTime', {
        configurable: true,
        value: 10,
      });
      video.dispatchEvent(new Event('ended'));
      return Promise.resolve(undefined);
    }),
  });

  video.src = 'https://example.com/video.mp4';
  video.width = 640;
  video.height = 360;
  video.muted = true;
  video.controls = true;

  document.body.appendChild(video);

  const handler: VideoHandler = {
    onPlay: jest.fn(),
    onPause: jest.fn(),
    onEnded: jest.fn(),
    onError: jest.fn(),
  };

  return { video, handler };
}
