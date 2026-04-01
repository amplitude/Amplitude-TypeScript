/**
 * @jest-environment jsdom
 */

jest.mock('../../src/video-analytics/track-video', () => ({
  trackHtmlVideo: jest.fn(() => jest.fn()),
  trackMuxEmbeddedVideo: jest.fn(() => jest.fn()),
}));

import { trackHtmlVideo, trackMuxEmbeddedVideo } from '../../src/video-analytics/track-video';
import { VideoObserver } from '../../src/observers/video';
import { MuxEmbeddedPlayer, VideoHandler } from '../../src/video-analytics/types';

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

    it('should call trackMuxEmbeddedVideo when isEmbedded is true and vendor is mux', () => {
      const player = null;
      new VideoObserver({
        videoEl: player as unknown as any,
        onStateChange: jest.fn(),
        vendor: 'mux',
        isEmbedded: true,
      });
      expect(trackMuxEmbeddedVideo).toHaveBeenCalledTimes(1);
    });
  });

  describe('player state changes', () => {
    let internalHandler: VideoHandler;
    let videoObserver: VideoObserver;
    let onStateChange: jest.Mock;

    beforeEach(() => {
      // trackMuxEmbeddedVideo returns untrack; capture the handler when it is *registered*,
      // not when destroy() runs the returned function.
      (trackMuxEmbeddedVideo as jest.Mock).mockImplementation(
        (_player: MuxEmbeddedPlayer, handler: VideoHandler, _metadata: Record<string, string | number | boolean>) => {
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
        program_duration: 10,
      });
      expect(onStateChange).toHaveBeenCalledWith(
        { videoState: 'paused', lastEvent: undefined },
        { videoState: 'playing', lastEvent: { program_duration: 10 } },
      );
      internalHandler.onPause({
        last_position: 5,
        percent_completed: 50,
        program_duration: 10,
      });
      expect(onStateChange).toHaveBeenCalledWith(
        { videoState: 'playing', lastEvent: { program_duration: 10 } },
        {
          videoState: 'paused',
          lastEvent: { last_position: 5, percent_completed: 50, program_duration: 10 },
        },
      );
      internalHandler.onEnded({
        last_position: 10,
        percent_completed: 100,
        program_duration: 10,
      });
      expect(onStateChange).toHaveBeenCalledWith(
        {
          videoState: 'paused',
          lastEvent: { last_position: 5, percent_completed: 50, program_duration: 10 },
        },
        {
          videoState: 'ended',
          lastEvent: { last_position: 10, percent_completed: 100, program_duration: 10 },
        },
      );
      internalHandler.onError('test error');
    });
  });
});
