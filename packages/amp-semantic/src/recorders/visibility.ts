import type { SemanticRecorder } from '../types';

/** Document visibility is independent of keyboard focus. */
export const visibilityRecorder: SemanticRecorder = {
  families: ['visibility'],
  setup(context) {
    const { document } = context.host;
    const readState = () => (document.visibilityState === 'hidden' ? 'hidden' : 'visible');
    let previous = readState();
    const onVisibility = () => {
      const state = readState();
      if (state === previous) return;
      previous = state;
      context.emit('visibility', { state });
    };
    document.addEventListener('visibilitychange', onVisibility, true);
    return () => document.removeEventListener('visibilitychange', onVisibility, true);
  },
};
