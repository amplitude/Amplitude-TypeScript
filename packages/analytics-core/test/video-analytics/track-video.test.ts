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
      program_duration: 10,
    });

    video.pause();
    expect(handler.onPause).toHaveBeenCalledWith({
      last_position: 5,
      percent_completed: 50,
      program_duration: 10,
    });

    (video as any).ended();
    expect(handler.onEnded).toHaveBeenCalledWith({
      last_position: 10,
      percent_completed: 100,
      program_duration: 10,
    });

    untrack();
    handler.onPlay = jest.fn();
    video.play();
    expect(handler.onPlay).not.toHaveBeenCalled();
  });

  test('should track seeking events', () => {
    const untrack = trackHtmlVideo(video, handler);

    video.play();
    (video as any).seeking(7);
    expect(handler.onSeeking).toHaveBeenCalledWith({
      last_position: 7,
      percent_completed: 70,
      program_duration: 10,
    });

    untrack();
    handler.onSeeking = jest.fn();
    (video as any).seeking(1);
    expect(handler.onSeeking).not.toHaveBeenCalled();
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
      program_duration: 10,
      mux_session_id: null,
      ...muxMetadata,
    });

    video.pause();
    expect(handler.onPause).toHaveBeenCalledWith({
      last_position: 5,
      percent_completed: 50,
      program_duration: 10,
      mux_session_id: null,
      ...muxMetadata,
    });

    (video as any).ended();
    expect(handler.onEnded).toHaveBeenCalledWith({
      last_position: 10,
      percent_completed: 100,
      program_duration: 10,
      mux_session_id: null,
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
    (video as any).seeking(4);
    expect(handler.onSeeking).toHaveBeenCalledWith({
      last_position: 4,
      percent_completed: 40,
      program_duration: 10,
      mux_session_id: null,
      ...muxMetadata,
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
        percent_completed: 0,
        program_duration: 10,
      });

      player.setCurrentTime(5);
      player.emit('pause');
      await jest.runAllTimersAsync();
      expect(handler.onPause).toHaveBeenCalledWith({
        last_position: 5,
        percent_completed: 50,
        program_duration: 10,
      });

      player.setCurrentTime(10);
      player.emit('ended');
      await jest.runAllTimersAsync();
      expect(handler.onEnded).toHaveBeenCalledWith({
        last_position: 10,
        percent_completed: 100,
        program_duration: 10,
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
        percent_completed: 60,
        program_duration: 10,
      });

      untrack();
      handler.onSeeking = jest.fn();
      player.emit('seeking');
      await jest.runAllTimersAsync();
      expect(handler.onSeeking).not.toHaveBeenCalled();
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
        percent_completed: 0,
        program_duration: 10,
        ...muxMetadata,
      });

      player.setCurrentTime(5);
      player.emit('pause');
      await jest.runAllTimersAsync();
      expect(handler.onPause).toHaveBeenCalledWith({
        last_position: 5,
        percent_completed: 50,
        program_duration: 10,
        ...muxMetadata,
      });

      player.setCurrentTime(10);
      player.emit('ended');
      await jest.runAllTimersAsync();
      expect(handler.onEnded).toHaveBeenCalledWith({
        last_position: 10,
        percent_completed: 100,
        program_duration: 10,
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
        percent_completed: 20,
        program_duration: 10,
        ...muxMetadata,
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
        program_duration: 10,
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
    });
  });
});
