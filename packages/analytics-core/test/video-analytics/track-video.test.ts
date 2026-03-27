/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/no-floating-promises */

import { trackHtmlVideo, trackMuxHtmlVideo } from '../../src/video-analytics/track-video';
import type { VideoHandler } from '../../src/video-analytics/types';
import { createMockVideo } from './mock-video';

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
