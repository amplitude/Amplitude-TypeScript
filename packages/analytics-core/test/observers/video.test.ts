/**
 * @jest-environment jsdom
 */

jest.mock('../../src/video-analytics/track-video', () => ({
  trackHtmlVideo: jest.fn(() => jest.fn()),
  trackEmbeddedVideo: jest.fn(() => jest.fn()),
}));

import { trackHtmlVideo, trackEmbeddedVideo } from '../../src/video-analytics/track-video';
import { EmbeddedVideoPlayer, VideoHandler } from '../../src/video-analytics/types';
import { VideoObserver } from '../../src/index';

describe('VideoObserver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should call trackHtmlVideo for a non-embedded HTML video element', () => {
      const video = document.createElement('video');
      new VideoObserver({
        videoEl: video,
        onStateChange: jest.fn(),
      });
      expect(trackHtmlVideo).toHaveBeenCalledTimes(1);
    });

    it('should call trackEmbeddedVideo when isEmbedded is true and vendor is mux', () => {
      const player = null;
      new VideoObserver({
        videoEl: player as unknown as any,
        onStateChange: jest.fn(),
        vendor: 'mux',
        isEmbedded: true,
      });
      expect(trackEmbeddedVideo).toHaveBeenCalledTimes(1);
    });
  });

  describe('player state changes', () => {
    let internalHandler: VideoHandler;
    let videoObserver: VideoObserver;
    let onStateChange: jest.Mock;

    beforeEach(() => {
      // trackEmbeddedVideo returns untrack; capture the handler when it is *registered*,
      // not when destroy() runs the returned function.
      (trackEmbeddedVideo as jest.Mock).mockImplementation(
        (_player: EmbeddedVideoPlayer, handler: VideoHandler, _metadata: Record<string, string | number | boolean>) => {
          internalHandler = handler;
          return jest.fn();
        },
      );
      onStateChange = jest.fn();
      const mockPlayer = null;
      videoObserver = new VideoObserver({
        videoEl: mockPlayer as unknown as any,
        onStateChange,
        vendor: 'mux',
        isEmbedded: true,
      });
    });

    afterEach(() => {
      videoObserver.destroy();
    });

    it('should track state changes', () => {
      internalHandler.onPlay({
        duration: 10,
        last_position: undefined,
      });
      expect(onStateChange).toHaveBeenCalledWith(
        { playbackState: 'paused', lastEvent: undefined },
        expect.objectContaining({
          playbackState: 'playing',
          lastEvent: { duration: 10, last_position: undefined },
        }),
      );
      internalHandler.onPause({
        last_position: 5,
        percent_completed: 50,
        duration: 10,
        stop_reason: 'paused',
      });
      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          playbackState: 'playing',
          lastEvent: { duration: 10, last_position: undefined },
        }),
        expect.objectContaining({
          playbackState: 'paused',
          lastEvent: {
            last_position: 5,
            percent_completed: 50,
            duration: 10,
            stop_reason: 'paused',
          },
        }),
      );
      internalHandler.onEnded({
        last_position: 10,
        percent_completed: 100,
        duration: 10,
        stop_reason: 'ended',
      });
      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          playbackState: 'paused',
          lastEvent: {
            last_position: 5,
            percent_completed: 50,
            duration: 10,
            stop_reason: 'paused',
          },
        }),
        expect.objectContaining({
          playbackState: 'ended',
          lastEvent: {
            last_position: 10,
            percent_completed: 100,
            duration: 10,
            stop_reason: 'ended',
          },
        }),
      );
      internalHandler.onError('test error');
    });

    it('should not transition to seeking when onSeeking is called', () => {
      internalHandler.onPlay({
        duration: 10,
        last_position: undefined,
      });
      expect(onStateChange).toHaveBeenCalledTimes(1);
      internalHandler.onSeeking({
        duration: 10,
        last_position: undefined,
        stop_reason: 'seeking',
      });
      internalHandler.onTimeUpdate({ position: 5, isSeeking: true });
      expect(onStateChange).toHaveBeenCalledTimes(2);
      expect(onStateChange).toHaveBeenCalledWith(
        { playbackState: 'paused', lastEvent: undefined },
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
      );
    });

    it('should clear isSeeking and sync position on onSeeked', () => {
      internalHandler.onSeeking({
        duration: 10,
        last_position: undefined,
      });
      internalHandler.onSeeked({
        duration: 10,
        last_position: 8,
      });
      expect(onStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isSeeking: true,
        }),
        expect.objectContaining({
          isSeeking: false,
        }),
      );
    });

    describe('watch time (onTimeUpdate)', () => {
      it('should not add position delta to watch time when not playing', () => {
        internalHandler.onTimeUpdate({ position: 4, isSeeking: false });
        expect(onStateChange).not.toHaveBeenCalled();
      });

      it('should accumulate watch time from last_position while playing (delta from lastEvent.last_position)', () => {
        internalHandler.onPlay({ duration: 10, last_position: 0 });
        onStateChange.mockClear();

        internalHandler.onTimeUpdate({ position: 2, isSeeking: false });
        expect(onStateChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ playbackState: 'playing', lastEvent: { duration: 10, last_position: 0 } }),
          expect.objectContaining({ playbackState: 'playing', watchTime: 2 }),
        );

        internalHandler.onTimeUpdate({ position: 5, isSeeking: false });
        expect(onStateChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ playbackState: 'playing', watchTime: 2 }),
          expect.objectContaining({ playbackState: 'playing', watchTime: 5 }),
        );

        // seeking should not add to watch time
        internalHandler.onTimeUpdate({ position: 20, isSeeking: true });
        internalHandler.onTimeUpdate({ position: 23, isSeeking: false });
        expect(onStateChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ playbackState: 'playing', watchTime: 5 }),
          expect.objectContaining({ playbackState: 'playing', watchTime: 8 }),
        );
      });

      it('should use last_position on lastEvent as the previous position when present', () => {
        internalHandler.onPlay({ duration: 10, last_position: 0 });
        internalHandler.onTimeUpdate({ position: 3, isSeeking: false });
        internalHandler.onPause({
          duration: 10,
          last_position: 3,
          percent_completed: 30,
          stop_reason: 'paused',
        });
        onStateChange.mockClear();

        internalHandler.onPlay({ duration: 10, last_position: 3 });
        internalHandler.onTimeUpdate({ position: 5, isSeeking: false });

        expect(onStateChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ playbackState: 'playing', watchTime: 3 }),
          expect.objectContaining({ playbackState: 'playing', watchTime: 5 }),
        );
      });
    });
  });
});
