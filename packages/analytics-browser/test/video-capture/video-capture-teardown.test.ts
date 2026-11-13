import type { BrowserClient, VideoStopCause } from '@amplitude/analytics-core';
import { VideoCapture, trackVideo } from '../../src/video-capture/video-capture';

describe('VideoCapture with HTML media observers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test.each([undefined, 'content_changed'] as const)(
    'accepts stop reason %s through the public trackVideo teardown',
    async (stopReason) => {
      const track = jest.fn().mockImplementation((eventType, eventProperties, options) => ({
        promise: Promise.resolve({
          event: { event_type: eventType, event_properties: eventProperties, ...options },
          code: 200,
          message: 'success',
        }),
      }));
      const client = { track, flush: jest.fn() } as unknown as BrowserClient;
      const video = document.createElement('video');
      Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
      const untrack = trackVideo(client, video);
      if (untrack instanceof Error) {
        throw untrack;
      }
      video.dispatchEvent(new Event('play'));
      await jest.advanceTimersByTimeAsync(0);
      track.mockClear();

      video.currentTime = 4;
      untrack(stopReason);
      untrack(stopReason);
      await jest.advanceTimersByTimeAsync(0);

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith(
        '[Streaming] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Stop Reason': stopReason ?? 'untracked',
          '[Streaming] Position Sec': 4,
        }),
        expect.objectContaining({ delay: { id: expect.any(String) } }),
      );
      track.mockClear();
      video.dispatchEvent(new Event('play'));
      await jest.advanceTimersByTimeAsync(60_000);
      expect(track).not.toHaveBeenCalled();
    },
  );

  test.each(['pagehide', 'untracked', 'content_changed'] as const)(
    'flushes the final player position once when stopped by %s',
    async (trigger) => {
      const track = jest.fn().mockImplementation((eventType, eventProperties, options) => ({
        promise: Promise.resolve({
          event: { event_type: eventType, event_properties: eventProperties, ...options },
          code: 200,
          message: 'success',
        }),
      }));
      const client = { track, flush: jest.fn() } as unknown as BrowserClient;
      const video = document.createElement('video');
      Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
      const capture = new VideoCapture(client)
        .withVideoElement(video)
        .captureVideoStarted()
        .captureVideoStopped()
        .start();

      video.dispatchEvent(new Event('play'));
      await jest.advanceTimersByTimeAsync(0);
      track.mockClear();
      video.currentTime = 4;
      const reason: VideoStopCause = trigger === 'pagehide' ? 'untracked' : trigger;
      if (trigger === 'pagehide') {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      } else {
        capture.stop(reason);
      }
      capture.stop(reason);
      await jest.advanceTimersByTimeAsync(0);

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith(
        '[Streaming] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Stop Reason': reason,
          '[Streaming] Position Sec': 4,
          '[Streaming] Percent Completed': 40,
        }),
        expect.objectContaining({ delay: { id: expect.any(String) } }),
      );
      track.mockClear();
      video.dispatchEvent(new Event('play'));
      video.dispatchEvent(new Event('ended'));
      await jest.advanceTimersByTimeAsync(60_000);
      expect(track).not.toHaveBeenCalled();
    },
  );
});
