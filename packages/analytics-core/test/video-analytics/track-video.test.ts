/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/no-floating-promises */

import { trackHtmlVideo, trackEmbeddedVideo } from '../../src/video-analytics/track-video';
import type { VideoHandler } from '../../src/video-analytics/types';
import { createMockEmbeddedVideoPlayer, createMockVideo } from './mock-video';

describe('trackHtmlVideo', () => {
  let video: HTMLVideoElement;
  let handler: VideoHandler;

  beforeEach(() => {
    const res = createMockVideo();
    video = res.video;
    handler = res.handler;
  });

  test('should track play, pause and ended events', () => {
    const untrack = trackHtmlVideo(video, handler);

    video.play();
    expect(handler.onPlay).toHaveBeenCalledWith({
      duration: 10,
      start_time: 0,
      last_position: 0,
      percent_completed: 0,
    });

    video.pause();
    expect(handler.onPause).toHaveBeenCalledWith({
      last_position: 5,
      start_time: 5,
      percent_completed: 50,
      duration: 10,
      stop_reason: 'paused',
    });

    (video as any).ended();
    expect(handler.onEnded).toHaveBeenCalledWith({
      last_position: 10,
      start_time: 10,
      percent_completed: 100,
      duration: 10,
      stop_reason: 'ended',
    });

    untrack();
    handler.onPlay = jest.fn();
    video.play();
    expect(handler.onPlay).not.toHaveBeenCalled();
  });

  test('should track seeking events', () => {
    const untrack = trackHtmlVideo(video, handler);

    video.play();
    (video as any).simulateSeek(7);
    expect(handler.onSeeking).toHaveBeenCalledWith({
      last_position: 7,
      start_time: 7,
      percent_completed: 70,
      duration: 10,
      stop_reason: 'seeking',
    });

    untrack();
    handler.onSeeking = jest.fn();
    (video as any).simulateSeek(1);
    expect(handler.onSeeking).not.toHaveBeenCalled();
  });

  test('should track seeked events', () => {
    const untrack = trackHtmlVideo(video, handler);

    video.play();
    (video as any).simulateSeek(7);
    (video as any).seeked();
    expect(handler.onSeeked).toHaveBeenCalledWith({
      last_position: 7,
      start_time: 7,
      percent_completed: 70,
      duration: 10,
    });

    untrack();
    handler.onSeeked = jest.fn();
    (video as any).seeked(2);
    expect(handler.onSeeked).not.toHaveBeenCalled();
  });

  test('should track timeupdate events', () => {
    const untrack = trackHtmlVideo(video, handler);

    video.play();
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 4 });
    video.dispatchEvent(new Event('timeupdate'));
    expect(handler.onTimeUpdate).toHaveBeenCalledWith({
      position: 4,
      isSeeking: false,
    });

    untrack();
    handler.onTimeUpdate = jest.fn();
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 6 });
    video.dispatchEvent(new Event('timeupdate'));
    expect(handler.onTimeUpdate).not.toHaveBeenCalled();
  });
});

describe('trackHtmlVideo with Mux vendor', () => {
  let video: HTMLVideoElement;
  let handler: VideoHandler;

  beforeEach(() => {
    const res = createMockVideo({ isMux: true });
    video = res.video;
    handler = res.handler;
  });

  test('should track play, pause and ended events', () => {
    const untrack = trackHtmlVideo(video, handler, 'mux');

    const muxMetadata = {
      mux_playback_id: video.getAttribute('playback-id'),
      mux_video_id: video.getAttribute('metadata-video-id'),
      mux_video_title: video.getAttribute('metadata-video-title'),
    };

    video.play();
    expect(handler.onPlay).toHaveBeenCalledWith({
      duration: 10,
      start_time: 0,
      last_position: 0,
      percent_completed: 0,
      ...muxMetadata,
    });

    video.pause();
    expect(handler.onPause).toHaveBeenCalledWith({
      last_position: 5,
      start_time: 5,
      percent_completed: 50,
      duration: 10,
      stop_reason: 'paused',
      ...muxMetadata,
    });

    (video as any).ended();
    expect(handler.onEnded).toHaveBeenCalledWith({
      last_position: 10,
      start_time: 10,
      percent_completed: 100,
      duration: 10,
      stop_reason: 'ended',
      ...muxMetadata,
    });

    untrack();
    handler.onPlay = jest.fn();
    video.play();
    expect(handler.onPlay).not.toHaveBeenCalled();
  });

  test('should track seeking events with Mux metadata', () => {
    trackHtmlVideo(video, handler, 'mux');

    const muxMetadata = {
      mux_playback_id: video.getAttribute('playback-id'),
      mux_video_id: video.getAttribute('metadata-video-id'),
      mux_video_title: video.getAttribute('metadata-video-title'),
    };

    video.play();
    (video as any).simulateSeek(4);
    expect(handler.onSeeking).toHaveBeenCalledWith({
      last_position: 4,
      start_time: 4,
      percent_completed: 40,
      duration: 10,
      stop_reason: 'seeking',
      ...muxMetadata,
    });
  });

  test('should track seeked events with Mux metadata', () => {
    trackHtmlVideo(video, handler, 'mux');

    const muxMetadata = {
      mux_playback_id: video.getAttribute('playback-id'),
      mux_video_id: video.getAttribute('metadata-video-id'),
      mux_video_title: video.getAttribute('metadata-video-title'),
    };

    video.play();
    (video as any).simulateSeek(3);
    (video as any).seeked();
    expect(handler.onSeeked).toHaveBeenCalledWith({
      last_position: 3,
      start_time: 3,
      percent_completed: 30,
      duration: 10,
      ...muxMetadata,
    });
  });

  test('should track timeupdate events with Mux metadata', () => {
    trackHtmlVideo(video, handler, 'mux');

    video.play();
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 2.5 });
    video.dispatchEvent(new Event('timeupdate'));
    expect(handler.onTimeUpdate).toHaveBeenCalledWith({
      position: 2.5,
      isSeeking: false,
    });
  });
});

describe('trackEmbeddedVideo', () => {
  let player: ReturnType<typeof createMockEmbeddedVideoPlayer>['player'];
  let handler: VideoHandler;

  beforeEach(() => {
    jest.useFakeTimers();
    ({ player } = createMockEmbeddedVideoPlayer());
    handler = {
      onPlay: jest.fn(),
      onPause: jest.fn(),
      onEnded: jest.fn(),
      onError: jest.fn(),
      onSeeking: jest.fn(),
      onSeeked: jest.fn(),
      onTimeUpdate: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('no vendor', () => {
    test('should track play, pause and ended events', async () => {
      const untrack = trackEmbeddedVideo(player, handler);
      player.emit('ready');
      player.emit('play');
      await jest.runAllTimersAsync();
      expect(handler.onPlay).toHaveBeenCalledWith({
        last_position: 0,
        start_time: 0,
        percent_completed: 0,
        duration: 10,
      });

      player.setCurrentTime(5);
      player.emit('pause');
      await jest.runAllTimersAsync();
      expect(handler.onPause).toHaveBeenCalledWith({
        last_position: 5,
        start_time: 5,
        percent_completed: 50,
        duration: 10,
        stop_reason: 'paused',
      });

      player.setCurrentTime(10);
      player.emit('ended');
      await jest.runAllTimersAsync();
      expect(handler.onEnded).toHaveBeenCalledWith({
        last_position: 10,
        start_time: 10,
        percent_completed: 100,
        duration: 10,
        stop_reason: 'ended',
      });

      untrack();
      handler.onPlay = jest.fn();
      player.emit('play');
      await jest.runAllTimersAsync();
      expect(handler.onPlay).not.toHaveBeenCalled();
    });

    test('should track seeking events', async () => {
      const untrack = trackEmbeddedVideo(player, handler);
      player.emit('ready');
      player.setCurrentTime(6);
      player.emit('seeking');
      await jest.runAllTimersAsync();
      expect(handler.onSeeking).toHaveBeenCalledWith({
        last_position: 6,
        start_time: 6,
        percent_completed: 60,
        duration: 10,
        stop_reason: 'seeking',
      });

      untrack();
      handler.onSeeking = jest.fn();
      player.emit('seeking');
      await jest.runAllTimersAsync();
      expect(handler.onSeeking).not.toHaveBeenCalled();
    });

    test('should track seeked events', async () => {
      const untrack = trackEmbeddedVideo(player, handler);
      player.emit('ready');
      player.setCurrentTime(8);
      player.emit('seeked');
      await jest.runAllTimersAsync();
      expect(handler.onSeeked).toHaveBeenCalledWith({
        last_position: 8,
        start_time: 8,
        percent_completed: 80,
        duration: 10,
      });

      untrack();
      handler.onSeeked = jest.fn();
      player.emit('seeked');
      await jest.runAllTimersAsync();
      expect(handler.onSeeked).not.toHaveBeenCalled();
    });

    test('should track timeupdate events', async () => {
      const untrack = trackEmbeddedVideo(player, handler);
      player.emit('ready');
      player.setCurrentTime(4);
      player.emit('timeupdate');
      await jest.runAllTimersAsync();
      expect(handler.onTimeUpdate).toHaveBeenCalledWith({
        position: 4,
        isSeeking: false,
      });

      untrack();
      handler.onTimeUpdate = jest.fn();
      player.emit('timeupdate');
      await jest.runAllTimersAsync();
      expect(handler.onTimeUpdate).not.toHaveBeenCalled();
    });

    test('should set isSeeking on timeupdate before async seeking metadata resolves', async () => {
      const untrack = trackEmbeddedVideo(player, handler);
      player.emit('ready');
      player.setCurrentTime(6);
      player.emit('seeking');
      player.emit('timeupdate');
      await jest.runAllTimersAsync();
      expect(handler.onTimeUpdate).toHaveBeenCalledWith({
        position: 6,
        isSeeking: true,
      });
      untrack();
    });
  });

  describe('with Mux vendor', () => {
    test('should track play, pause and ended events', async () => {
      const untrack = trackEmbeddedVideo(player, handler, 'mux');

      player.emit('ready');

      const muxMetadata = {
        mux_playback_id: 'dE02GfTAlJD4RcqNAlgiS2m00LqbdFqlBm',
        mux_video_id: 'video-123',
        mux_video_title: 'My Video',
      };

      player.setCurrentTime(0);
      player.emit('play');
      await jest.runAllTimersAsync();
      expect(handler.onPlay).toHaveBeenCalledWith({
        last_position: 0,
        start_time: 0,
        percent_completed: 0,
        duration: 10,
        ...muxMetadata,
      });

      player.setCurrentTime(5);
      player.emit('pause');
      await jest.runAllTimersAsync();
      expect(handler.onPause).toHaveBeenCalledWith({
        last_position: 5,
        start_time: 5,
        percent_completed: 50,
        duration: 10,
        stop_reason: 'paused',
        ...muxMetadata,
      });

      player.setCurrentTime(10);
      player.emit('ended');
      await jest.runAllTimersAsync();
      expect(handler.onEnded).toHaveBeenCalledWith({
        last_position: 10,
        start_time: 10,
        percent_completed: 100,
        duration: 10,
        stop_reason: 'ended',
        ...muxMetadata,
      });

      untrack();
      handler.onPlay = jest.fn();
      player.emit('play');
      await jest.runAllTimersAsync();
      expect(handler.onPlay).not.toHaveBeenCalled();
    });

    test('should track seeking events with Mux metadata', async () => {
      trackEmbeddedVideo(player, handler, 'mux');
      player.emit('ready');

      const muxMetadata = {
        mux_playback_id: 'dE02GfTAlJD4RcqNAlgiS2m00LqbdFqlBm',
        mux_video_id: 'video-123',
        mux_video_title: 'My Video',
      };

      player.setCurrentTime(2);
      player.emit('seeking');
      await jest.runAllTimersAsync();
      expect(handler.onSeeking).toHaveBeenCalledWith({
        last_position: 2,
        start_time: 2,
        percent_completed: 20,
        duration: 10,
        stop_reason: 'seeking',
        ...muxMetadata,
      });
    });

    test('should track seeked events with Mux metadata', async () => {
      trackEmbeddedVideo(player, handler, 'mux');
      player.emit('ready');

      const muxMetadata = {
        mux_playback_id: 'dE02GfTAlJD4RcqNAlgiS2m00LqbdFqlBm',
        mux_video_id: 'video-123',
        mux_video_title: 'My Video',
      };

      player.setCurrentTime(4);
      player.emit('seeked');
      await jest.runAllTimersAsync();
      expect(handler.onSeeked).toHaveBeenCalledWith({
        last_position: 4,
        start_time: 4,
        percent_completed: 40,
        duration: 10,
        ...muxMetadata,
      });
    });

    test('should track timeupdate events with Mux metadata', async () => {
      trackEmbeddedVideo(player, handler, 'mux');
      player.emit('ready');

      player.setCurrentTime(3);
      player.emit('timeupdate');
      await jest.runAllTimersAsync();
      expect(handler.onTimeUpdate).toHaveBeenCalledWith({
        position: 3,
        isSeeking: false,
      });
    });

    test('should work when there is no src url', async () => {
      player.elem.setAttribute('src', null as unknown as string);
      const untrack = trackEmbeddedVideo(player, handler, 'mux');
      player.emit('ready');
      player.emit('play');
      await jest.runAllTimersAsync();
      expect(handler.onPlay).toHaveBeenCalledWith({
        last_position: 0,
        start_time: 0,
        duration: 10,
        percent_completed: 0,
      });
      untrack();
      handler.onPlay = jest.fn();
      player.emit('play');
      await jest.runAllTimersAsync();
      expect(handler.onPlay).not.toHaveBeenCalled();
    });

    describe('when there is an error getting the metadata', () => {
      let originalGetDuration: typeof player.getDuration;
      beforeEach(() => {
        originalGetDuration = player.getDuration;
        player.getDuration = jest.fn().mockImplementation(() => {
          throw new Error('Error getting duration');
        });
        trackEmbeddedVideo(player, handler);
        player.emit('ready');
      });

      afterEach(() => {
        player.getDuration = originalGetDuration;
      });

      test('should call the error handler (play)', async () => {
        player.emit('play');
        await jest.runAllTimersAsync();
        expect(handler.onError).toHaveBeenCalledTimes(1);
      });

      test('should call the error handler (pause)', async () => {
        player.emit('pause');
        await jest.runAllTimersAsync();
        expect(handler.onError).toHaveBeenCalledTimes(1);
      });

      test('should call the error handler (ended)', async () => {
        player.emit('ended');
        await jest.runAllTimersAsync();
        expect(handler.onError).toHaveBeenCalledTimes(1);
      });

      test('should call the error handler (seeking)', async () => {
        player.emit('seeking');
        await jest.runAllTimersAsync();
        expect(handler.onError).toHaveBeenCalledTimes(1);
        expect(handler.onError).toHaveBeenCalledWith(expect.stringContaining("from 'seeking' handler"));
      });

      test('should call the error handler (seeked)', async () => {
        player.emit('seeked');
        await jest.runAllTimersAsync();
        expect(handler.onError).toHaveBeenCalledTimes(1);
        expect(handler.onError).toHaveBeenCalledWith(expect.stringContaining("from 'seeked' handler"));
      });

      test('should call the error handler (timeupdate)', async () => {
        const originalGetCurrentTime = player.getCurrentTime;
        player.getCurrentTime = jest.fn().mockImplementation(() => {
          throw new Error('Error getting current time');
        });
        try {
          player.emit('timeupdate');
          await jest.runAllTimersAsync();
          expect(handler.onError).toHaveBeenCalledTimes(1);
          expect(handler.onError).toHaveBeenCalledWith(expect.stringContaining("from 'timeupdate' handler"));
        } finally {
          player.getCurrentTime = originalGetCurrentTime;
        }
      });
    });
  });
});
