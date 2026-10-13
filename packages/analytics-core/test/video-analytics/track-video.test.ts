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
      position: 0,
      percent_completed: 0,
    });

    video.pause();
    expect(handler.onPause).toHaveBeenCalledWith({
      position: 5,
      start_time: 5,
      percent_completed: 50,
      duration: 10,
      stop_reason: 'paused',
    });

    (video as any).ended();
    expect(handler.onEnded).toHaveBeenCalledWith({
      position: 10,
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

  test('should report the pause that precedes the end of the media as an ended event', () => {
    trackHtmlVideo(video, handler);

    video.play();
    Object.defineProperty(video, 'ended', { configurable: true, value: true });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 10 });
    video.dispatchEvent(new Event('pause'));
    video.dispatchEvent(new Event('ended'));

    expect(handler.onPause).not.toHaveBeenCalled();
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
    expect(handler.onEnded).toHaveBeenCalledWith({
      duration: 10,
      start_time: 10,
      position: 10,
      percent_completed: 100,
      stop_reason: 'ended',
    });

    // replaying restores normal pause reporting
    video.play();
    Object.defineProperty(video, 'ended', { configurable: true, value: false });
    video.pause();
    expect(handler.onPause).toHaveBeenCalledTimes(1);
  });

  test('should report a play event when the video is already playing when tracked', () => {
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 3 });

    trackHtmlVideo(video, handler);

    expect(handler.onPlay).toHaveBeenCalledTimes(1);
    expect(handler.onPlay).toHaveBeenCalledWith({
      duration: 10,
      start_time: 3,
      position: 3,
      percent_completed: 30,
    });
  });

  test('should not report a play event when the video is paused or ended when tracked', () => {
    trackHtmlVideo(video, handler);
    expect(handler.onPlay).not.toHaveBeenCalled();

    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    Object.defineProperty(video, 'ended', { configurable: true, value: true });
    trackHtmlVideo(video, handler);
    expect(handler.onPlay).not.toHaveBeenCalled();
  });

  test('should track seeking events', () => {
    const untrack = trackHtmlVideo(video, handler);

    video.play();
    (video as any).simulateSeek(7);
    expect(handler.onSeeking).toHaveBeenCalledWith({
      position: 7,
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
      position: 7,
      start_time: 7,
      percent_completed: 70,
      duration: 10,
    });

    untrack();
    handler.onSeeked = jest.fn();
    (video as any).seeked(2);
    expect(handler.onSeeked).not.toHaveBeenCalled();
  });

  test('should track error events', () => {
    const untrack = trackHtmlVideo(video, handler);

    video.play();
    (video as any).simulateError({ code: 2, message: 'network' });
    expect(handler.onError).toHaveBeenCalledWith('Media element error (code 2): network');

    (video as any).simulateError({ code: 4, message: '' });
    expect(handler.onError).toHaveBeenLastCalledWith('Media element error (code 4)');

    (video as any).simulateError(null);
    expect(handler.onError).toHaveBeenLastCalledWith('Media element error');

    untrack();
    handler.onError = jest.fn();
    (video as any).simulateError();
    expect(handler.onError).not.toHaveBeenCalled();
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

  test('should report the last timeupdate as ended when its src changes', () => {
    const untrack = trackHtmlVideo(video, handler);
    video.setAttribute('src', 'https://example.com/first.mp4');
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });

    video.dispatchEvent(new Event('loadstart'));
    video.dispatchEvent(new Event('timeupdate'));
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).not.toHaveBeenCalled();

    // loadstart can fire after the element already reflects the incoming source
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 0 });
    Object.defineProperty(video, 'duration', { configurable: true, value: Number.NaN });
    video.setAttribute('src', 'https://example.com/second.mp4');
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
    expect(handler.onEnded).toHaveBeenCalledWith({
      duration: 10,
      start_time: 4,
      position: 4,
      percent_completed: 40,
    });

    untrack();
    video.setAttribute('src', 'https://example.com/third.mp4');
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
  });

  test('should not report a src change as ended before a timeupdate', () => {
    trackHtmlVideo(video, handler);
    video.setAttribute('src', 'https://example.com/first.mp4');
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    video.dispatchEvent(new Event('loadstart'));

    video.setAttribute('src', 'https://example.com/second.mp4');
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).not.toHaveBeenCalled();
  });

  test('should report the first src change after tracking starts mid-playback', () => {
    trackHtmlVideo(video, handler);
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    video.dispatchEvent(new Event('timeupdate'));

    video.setAttribute('src', 'https://example.com/second.mp4');
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
    expect(handler.onEnded).toHaveBeenCalledWith({
      duration: 10,
      start_time: 4,
      position: 4,
      percent_completed: 40,
    });
  });

  test('should report ended when the media is emptied without a src attribute change', () => {
    trackHtmlVideo(video, handler);
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    video.dispatchEvent(new Event('timeupdate'));

    // e.g. hls.js re-attaching a MediaSource for a new playlist
    video.dispatchEvent(new Event('emptied'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
    expect(handler.onEnded).toHaveBeenCalledWith({
      duration: 10,
      start_time: 4,
      position: 4,
      percent_completed: 40,
    });
  });

  test('should report a src change once when emptied is followed by a reset timeupdate and loadstart', () => {
    trackHtmlVideo(video, handler);
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    video.dispatchEvent(new Event('timeupdate'));

    video.setAttribute('src', 'https://example.com/second.mp4');
    video.dispatchEvent(new Event('emptied'));
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 0 });
    Object.defineProperty(video, 'duration', { configurable: true, value: Number.NaN });
    video.dispatchEvent(new Event('timeupdate'));
    video.dispatchEvent(new Event('loadstart'));

    expect(handler.onEnded).toHaveBeenCalledTimes(1);

    // a later swap without any new progress is not reported
    video.setAttribute('src', 'https://example.com/third.mp4');
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
  });

  test('should report a srcObject change as ended', () => {
    const firstStream = {} as MediaStream;
    Object.defineProperty(video, 'srcObject', { configurable: true, writable: true, value: firstStream });
    trackHtmlVideo(video, handler);
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    video.dispatchEvent(new Event('timeupdate'));

    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).not.toHaveBeenCalled();

    (video as { srcObject: MediaStream }).srcObject = {} as MediaStream;
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
  });

  test('should report a <source> child change as ended', () => {
    video.removeAttribute('src');
    Object.defineProperty(video, 'currentSrc', { configurable: true, value: 'https://example.com/first.mp4' });
    trackHtmlVideo(video, handler);
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    video.dispatchEvent(new Event('timeupdate'));

    Object.defineProperty(video, 'currentSrc', { configurable: true, value: 'https://example.com/second.mp4' });
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
  });

  test('should fall back to the src attribute for elements without media source properties', () => {
    const el = document.createElement('mux-video') as unknown as HTMLVideoElement;
    el.setAttribute('src', 'https://example.com/first.m3u8');
    Object.defineProperty(el, 'currentTime', { configurable: true, value: 4 });
    Object.defineProperty(el, 'duration', { configurable: true, value: 10 });
    trackHtmlVideo(el, handler);
    el.dispatchEvent(new Event('timeupdate'));

    el.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).not.toHaveBeenCalled();

    el.setAttribute('src', 'https://example.com/second.m3u8');
    el.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
  });

  test('should not report a src change after the media already ended', () => {
    trackHtmlVideo(video, handler);
    video.play();
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 10 });
    video.dispatchEvent(new Event('timeupdate'));
    video.dispatchEvent(new Event('ended'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);

    video.setAttribute('src', 'https://example.com/second.mp4');
    video.dispatchEvent(new Event('emptied'));
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
  });

  test('should report ended for a view that resumes from timeupdate after a source change', () => {
    trackHtmlVideo(video, handler);
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    video.dispatchEvent(new Event('timeupdate'));

    video.setAttribute('src', 'https://example.com/second.mp4');
    video.dispatchEvent(new Event('emptied'));
    // the element stays unpaused across the swap, so the next view never fires `play`
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 0 });
    Object.defineProperty(video, 'duration', { configurable: true, value: Number.NaN });
    video.dispatchEvent(new Event('timeupdate'));
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
    expect(handler.onPlay).not.toHaveBeenCalled();

    Object.defineProperty(video, 'ended', { configurable: true, value: false });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 2 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    video.dispatchEvent(new Event('timeupdate'));
    expect(handler.onPlay).toHaveBeenCalledTimes(1);
    expect(handler.onPlay).toHaveBeenCalledWith({
      duration: 8,
      start_time: 2,
      position: 2,
      percent_completed: 25,
    });

    Object.defineProperty(video, 'currentTime', { configurable: true, value: 8 });
    Object.defineProperty(video, 'ended', { configurable: true, value: true });
    video.dispatchEvent(new Event('ended'));
    expect(handler.onEnded).toHaveBeenCalledTimes(2);
    expect(handler.onEnded).toHaveBeenLastCalledWith({
      duration: 8,
      start_time: 8,
      position: 8,
      percent_completed: 100,
      stop_reason: 'ended',
    });
  });

  test('should report a later source change for a view that resumes from timeupdate', () => {
    trackHtmlVideo(video, handler);
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    video.dispatchEvent(new Event('timeupdate'));

    video.setAttribute('src', 'https://example.com/second.mp4');
    video.dispatchEvent(new Event('emptied'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);

    Object.defineProperty(video, 'ended', { configurable: true, value: false });
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 6 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 12 });
    video.dispatchEvent(new Event('timeupdate'));

    video.setAttribute('src', 'https://example.com/third.mp4');
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).toHaveBeenCalledTimes(2);
    expect(handler.onEnded).toHaveBeenLastCalledWith({
      duration: 12,
      start_time: 6,
      position: 6,
      percent_completed: 50,
    });
  });

  test('should not report a source change from a leftover timeupdate after the media ended', () => {
    trackHtmlVideo(video, handler);
    video.play();
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 10 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    Object.defineProperty(video, 'ended', { configurable: true, value: true });
    video.dispatchEvent(new Event('ended'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);

    video.dispatchEvent(new Event('timeupdate'));
    video.setAttribute('src', 'https://example.com/second.mp4');
    video.dispatchEvent(new Event('emptied'));
    video.dispatchEvent(new Event('loadstart'));
    expect(handler.onEnded).toHaveBeenCalledTimes(1);
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
      position: 0,
      percent_completed: 0,
      ...muxMetadata,
    });

    video.pause();
    expect(handler.onPause).toHaveBeenCalledWith({
      position: 5,
      start_time: 5,
      percent_completed: 50,
      duration: 10,
      stop_reason: 'paused',
      ...muxMetadata,
    });

    (video as any).ended();
    expect(handler.onEnded).toHaveBeenCalledWith({
      position: 10,
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
      position: 4,
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
      position: 3,
      start_time: 3,
      percent_completed: 30,
      duration: 10,
      ...muxMetadata,
    });
  });

  test('should report a src change as ended with Mux metadata from the last timeupdate', () => {
    trackHtmlVideo(video, handler, 'mux');

    const muxMetadata = {
      mux_playback_id: video.getAttribute('playback-id'),
      mux_video_id: video.getAttribute('metadata-video-id'),
      mux_video_title: video.getAttribute('metadata-video-title'),
    };

    video.setAttribute('src', 'https://example.com/first.m3u8');
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 2 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    video.dispatchEvent(new Event('loadstart'));
    video.dispatchEvent(new Event('timeupdate'));

    video.removeAttribute('playback-id');
    video.removeAttribute('metadata-video-id');
    video.removeAttribute('metadata-video-title');
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 0 });
    video.setAttribute('src', 'https://example.com/second.m3u8');
    video.dispatchEvent(new Event('loadstart'));

    expect(handler.onEnded).toHaveBeenCalledWith({
      duration: 10,
      start_time: 2,
      position: 2,
      percent_completed: 20,
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
        position: 0,
        start_time: 0,
        percent_completed: 0,
        duration: 10,
      });

      player.setCurrentTime(5);
      player.emit('pause');
      await jest.runAllTimersAsync();
      expect(handler.onPause).toHaveBeenCalledWith({
        position: 5,
        start_time: 5,
        percent_completed: 50,
        duration: 10,
        stop_reason: 'paused',
      });

      player.setCurrentTime(10);
      player.emit('ended');
      await jest.runAllTimersAsync();
      expect(handler.onEnded).toHaveBeenCalledWith({
        position: 10,
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

    test('should report a play event when the player is already playing when ready', async () => {
      player.setPaused(false);
      player.setCurrentTime(4);
      trackEmbeddedVideo(player, handler);
      player.emit('ready');
      await jest.runAllTimersAsync();
      expect(handler.onPlay).toHaveBeenCalledTimes(1);
      expect(handler.onPlay).toHaveBeenCalledWith({
        position: 4,
        start_time: 4,
        percent_completed: 40,
        duration: 10,
      });
    });

    test('should not report a play event when the player is paused when ready', async () => {
      trackEmbeddedVideo(player, handler);
      player.emit('ready');
      await jest.runAllTimersAsync();
      expect(handler.onPlay).not.toHaveBeenCalled();
    });

    test('should not check the paused state when the player does not support getPaused', async () => {
      player.setPaused(false);
      delete (player as Partial<typeof player>).getPaused;
      trackEmbeddedVideo(player, handler);
      player.emit('ready');
      await jest.runAllTimersAsync();
      expect(handler.onPlay).not.toHaveBeenCalled();
      expect(handler.onError).not.toHaveBeenCalled();
    });

    test('should call the error handler when getPaused throws', async () => {
      player.getPaused = jest.fn().mockImplementation(() => {
        throw new Error('Error getting paused state');
      });
      trackEmbeddedVideo(player, handler);
      player.emit('ready');
      await jest.runAllTimersAsync();
      expect(handler.onPlay).not.toHaveBeenCalled();
      expect(handler.onError).toHaveBeenCalledWith(expect.stringContaining("from 'ready' handler"));
    });

    test('should track seeking events', async () => {
      const untrack = trackEmbeddedVideo(player, handler);
      player.emit('ready');
      player.setCurrentTime(6);
      player.emit('seeking');
      await jest.runAllTimersAsync();
      expect(handler.onSeeking).toHaveBeenCalledWith({
        position: 6,
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
        position: 8,
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
        position: 0,
        start_time: 0,
        percent_completed: 0,
        duration: 10,
        ...muxMetadata,
      });

      player.setCurrentTime(5);
      player.emit('pause');
      await jest.runAllTimersAsync();
      expect(handler.onPause).toHaveBeenCalledWith({
        position: 5,
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
        position: 10,
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
        position: 2,
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
        position: 4,
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
        position: 0,
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
