type VideoHandler = {
  onPlay: (startEvent: StartVideoEvent) => void;
  onPause: (pauseEvent: PauseVideoEvent) => void;
  onEnded: (endedEvent: EndedVideoEvent) => void;
};

type BaseVideoEvent = {
  program_duration: number;
  playback_id?: string | undefined;
  video_id?: string | undefined;
  video_title?: string | undefined;
  content_id?: string | undefined;
  content_type?: string | undefined;
  session_id?: string | undefined;
  [key: string]: string | number | boolean | undefined | null;
};

type MuxVideoMetadata = {
  mux_playback_id?: string | undefined | null;
  mux_video_id?: string | undefined | null;
  mux_video_title?: string | undefined | null;
};

type StartVideoEvent = BaseVideoEvent & MuxVideoMetadata;

type PauseVideoEvent = BaseVideoEvent &
  MuxVideoMetadata & {
    last_position?: number | undefined | null;
    percent_completed: number;
  };

type EndedVideoEvent = PauseVideoEvent; // & { ... }

export {
  VideoHandler,
  BaseVideoEvent,
  MuxVideoMetadata,
  StartVideoEvent,
  PauseVideoEvent,
  EndedVideoEvent,
};
