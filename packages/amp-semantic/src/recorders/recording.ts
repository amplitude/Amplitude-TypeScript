import type { SemanticRecorder } from '../types';

/** The host identifies recording boundaries; this recorder only stamps and transports them. */
export const recordingRecorder: SemanticRecorder = {
  families: ['recording'],
  setup(context) {
    return context.on('recording', (signal) => context.emit('recording', signal));
  },
};
