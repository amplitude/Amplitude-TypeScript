export type Vendor = 'mux'; // | 'vimeo' | 'youtube' | 'other'

export type VideoHandler = {
  onPlay: (startEvent: VideoEvent) => void;
  onPause: (pauseEvent: VideoEvent) => void;
  onEnded: (endedEvent: VideoEvent) => void;
  onSeeking: (seekingEvent: VideoEvent) => void;
  onError: (error: string) => void;
};

export type VideoEvent = {
  program_duration: number;
  playback_id?: string | undefined;
  video_id?: string | undefined;
  video_title?: string | undefined;
  content_id?: string | undefined;
  content_type?: string | undefined;
  session_id?: string | undefined;
  mux_playback_id?: string | undefined | null;
  mux_video_id?: string | undefined | null;
  mux_video_title?: string | undefined | null;
  mux_session_id?: string | undefined | null;
  last_position?: number | undefined | null;
  percent_completed?: number;
};

type EmbeddedVideoPlayer = {
  getCurrentTime: (cb: (time: number) => void) => void;
  getDuration: (cb: (duration: number) => void) => void;
  on: (event: string, callback: () => void) => void;
  off: (event: string, callback: () => void) => void;
  elem: HTMLIFrameElement;
};

type MuxElement = EventTarget &
  Element & { duration: number; currentTime: number; play?: () => Promise<unknown>; pause?: () => void };

export { MuxElement, EmbeddedVideoPlayer };
