export type VideoHandler = {
  onPlay: (startEvent: StartVideoEvent) => void;
  onPause: (pauseEvent: PauseVideoEvent) => void;
  onEnded: (endedEvent: EndedVideoEvent) => void;
  onError: (error: string) => void;
};

export type BaseVideoEvent = {
  program_duration: number;
  playback_id?: string | undefined;
  video_id?: string | undefined;
  video_title?: string | undefined;
  content_id?: string | undefined;
  content_type?: string | undefined;
  session_id?: string | undefined;
  [key: string]: string | number | boolean | undefined | null;
};

export type MuxVideoMetadata = {
  mux_playback_id?: string | undefined | null;
  mux_video_id?: string | undefined | null;
  mux_video_title?: string | undefined | null;
  mux_session_id?: string | undefined | null;
};

export type StartVideoEvent = BaseVideoEvent & MuxVideoMetadata;

export type PauseVideoEvent = BaseVideoEvent &
  MuxVideoMetadata & {
    last_position?: number | undefined | null;
    percent_completed: number;
  };

type MuxEmbeddedPlayer = {
  getCurrentTime: (cb: (time: number) => void) => void;
  getDuration: (cb: (duration: number) => void) => void;
  on: (event: string, callback: () => void) => void;
  off: (event: string, callback: () => void) => void;
  elem: HTMLIFrameElement;
};

type EndedVideoEvent = PauseVideoEvent; // & { ... }

type MuxElement = EventTarget &
  Element & { duration: number; currentTime: number; play?: () => Promise<unknown>; pause?: () => void };

export { EndedVideoEvent, MuxElement, MuxEmbeddedPlayer };
