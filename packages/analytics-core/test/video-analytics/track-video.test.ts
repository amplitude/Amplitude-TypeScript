/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  trackHtmlVideo,
  trackMuxEmbeddedVideo,
  trackMuxHtmlVideo,
  trackVimeoEmbeddedVideo,
  trackYoutubeEmbeddedVideo,
} from '../../src/video-analytics/track-video';
import type { VideoHandler } from '../../src/video-analytics/types';
import { createMockMuxEmbeddedPlayer, createMockVideo } from './mock-video';

async function flushAsyncHandlers() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('trackHtmlVideo', () => {
  let video: HTMLVideoElement;
  let handler: VideoHandler;

  beforeEach(() => {
    const res = createMockVideo();
    video = res.video;
    handler = res.handler;
  });

  test('should track play, pause and ended events', () => {
    const untrack = trackHtmlVideo(video, handler, { hello: 'world' });

    video.play();
    expect(handler.onPlay).toHaveBeenCalledWith({
      program_duration: 10,
      hello: 'world',
    });

    video.pause();
    expect(handler.onPause).toHaveBeenCalledWith({
      last_position: 5,
      percent_completed: 50,
      program_duration: 10,
      hello: 'world',
    });

    (video as any).ended();
    expect(handler.onEnded).toHaveBeenCalledWith({
      last_position: 10,
      percent_completed: 100,
      program_duration: 10,
      hello: 'world',
    });

    untrack();
    handler.onPlay = jest.fn();
    video.play();
    expect(handler.onPlay).not.toHaveBeenCalled();
  });
});

describe('trackMuxHtmlVideo', () => {
  let video: HTMLVideoElement;
  let handler: VideoHandler;

  beforeEach(() => {
    const res = createMockVideo({ isMux: true });
    video = res.video;
    handler = res.handler;
  });

  test('should track play, pause and ended events', () => {
    const untrack = trackMuxHtmlVideo(video, handler, { hello: 'world' });

    const muxMetadata = {
      mux_playback_id: video.getAttribute('playback-id'),
      mux_video_id: video.getAttribute('metadata-video-id'),
      mux_video_title: video.getAttribute('metadata-video-title'),
    };

    video.play();
    expect(handler.onPlay).toHaveBeenCalledWith({
      program_duration: 10,
      hello: 'world',
      mux_session_id: null,
      ...muxMetadata,
    });

    video.pause();
    expect(handler.onPause).toHaveBeenCalledWith({
      last_position: 5,
      percent_completed: 50,
      program_duration: 10,
      hello: 'world',
      mux_session_id: null,
      ...muxMetadata,
    });

    (video as any).ended();
    expect(handler.onEnded).toHaveBeenCalledWith({
      last_position: 10,
      percent_completed: 100,
      program_duration: 10,
      hello: 'world',
      mux_session_id: null,
      ...muxMetadata,
    });

    untrack();
    handler.onPlay = jest.fn();
    video.play();
    expect(handler.onPlay).not.toHaveBeenCalled();
  });
});

describe('trackMuxEmbeddedVideo', () => {
  let player: ReturnType<typeof createMockMuxEmbeddedPlayer>['player'];
  let handler: VideoHandler;

  beforeEach(() => {
    ({ player } = createMockMuxEmbeddedPlayer());
    handler = {
      onPlay: jest.fn(),
      onPause: jest.fn(),
      onEnded: jest.fn(),
      onError: jest.fn(),
    };
  });

  test('should track play, pause and ended events', async () => {
    const untrack = trackMuxEmbeddedVideo(player, handler, { hello: 'world' });

    player.emit('ready');

    const muxMetadata = {
      mux_playback_id: 'dE02GfTAlJD4RcqNAlgiS2m00LqbdFqlBm',
      mux_video_id: 'video-123',
      mux_video_title: 'My Video',
    };

    player.setCurrentTime(0);
    player.emit('play');
    await flushAsyncHandlers();
    expect(handler.onPlay).toHaveBeenCalledWith({
      current_time: 0,
      percent_completed: 0,
      program_duration: 10,
      hello: 'world',
      ...muxMetadata,
    });

    player.setCurrentTime(5);
    player.emit('pause');
    await flushAsyncHandlers();
    expect(handler.onPause).toHaveBeenCalledWith({
      current_time: 5,
      percent_completed: 50,
      program_duration: 10,
      hello: 'world',
      ...muxMetadata,
    });

    player.setCurrentTime(10);
    player.emit('ended');
    await flushAsyncHandlers();
    expect(handler.onEnded).toHaveBeenCalledWith({
      current_time: 10,
      percent_completed: 100,
      program_duration: 10,
      hello: 'world',
      ...muxMetadata,
    });

    untrack();
    handler.onPlay = jest.fn();
    player.emit('play');
    await flushAsyncHandlers();
    expect(handler.onPlay).not.toHaveBeenCalled();
  });

  test('should work when there is no src url', async () => {
    player.elem.setAttribute('src', null as unknown as string);
    const untrack = trackMuxEmbeddedVideo(player, handler, { foo: 'bar' });
    player.emit('ready');
    player.emit('play');
    await flushAsyncHandlers();
    expect(handler.onPlay).toHaveBeenCalledWith({
      current_time: 0,
      program_duration: 10,
      percent_completed: 0,
      foo: 'bar',
      mux_playback_id: null,
      mux_video_id: null,
      mux_video_title: null,
    });
    untrack();
    handler.onPlay = jest.fn();
    player.emit('play');
    await flushAsyncHandlers();
    expect(handler.onPlay).not.toHaveBeenCalled();
  });

  describe('when there is an error getting the metadata', () => {
    let originalGetDuration: typeof player.getDuration;
    beforeEach(() => {
      jest.useFakeTimers();
      originalGetDuration = player.getDuration;
      player.getDuration = jest.fn().mockImplementation(() => {
        throw new Error('Error getting duration');
      });
      trackMuxEmbeddedVideo(player, handler, { hello: 'world' });
      player.emit('ready');
    });

    afterEach(() => {
      jest.useRealTimers();
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
  });
});

describe('trackYoutubeEmbeddedVideo', () => {
  test('throws until implemented', () => {
    expect(() => trackYoutubeEmbeddedVideo()).toThrow('Not implemented');
  });
});

describe('trackVimeoEmbeddedVideo', () => {
  test('throws until implemented', () => {
    expect(() => trackVimeoEmbeddedVideo()).toThrow('Not implemented');
  });
});
