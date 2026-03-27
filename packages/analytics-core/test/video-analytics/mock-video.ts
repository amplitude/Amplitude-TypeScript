import type { VideoHandler } from '../../src/video-analytics/types';

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
  };

  return { video, handler };
}
