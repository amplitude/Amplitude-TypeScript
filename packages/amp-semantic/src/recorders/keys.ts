import type { SemanticRecorder } from '../types';

const NON_CHARACTER =
  /^(Escape|Enter|Tab|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|F[1-9]|F1[0-2])$/;
const SHORTCUT = /^[kpf]$/i;

/** Explicit allowlists, never a stream of typed characters or input contents. */
export const keysRecorder: SemanticRecorder = {
  families: ['keys'],
  setup(context) {
    const { document } = context.host;
    const { helpers } = context;
    const onKey = (event: KeyboardEvent) => {
      if (
        !context.enabled('keys') ||
        event.repeat ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.getModifierState('AltGraph')
      )
        return;
      let key = event.key;
      if (!NON_CHARACTER.test(key)) {
        // Alt/AltGraph can produce characters; accept only deliberate Ctrl/Meta commands.
        if (event.altKey || event.ctrlKey === event.metaKey || !SHORTCUT.test(key)) return;
        key = key.toUpperCase();
      }
      const path = event.composedPath();
      const elements = path.filter((node): node is Element => (node as Node).nodeType === 1);
      const target = elements[0];
      if (!target || elements.some((element) => helpers.blocked(element))) return;
      if (target.matches('input[type="password"], input[type="hidden"]')) return;
      const description = helpers.name(target);
      context.emit('keys', {
        key: [
          event.ctrlKey ? 'Ctrl' : '',
          event.metaKey ? 'Meta' : '',
          event.altKey ? 'Alt' : '',
          event.shiftKey ? 'Shift' : '',
          key,
        ]
          .filter(Boolean)
          .join('+'),
        target: {
          id: helpers.id(target),
          role: helpers.role(target),
          // Also protect input/button values and contenteditable text when unmasked.
          name:
            description.source === 'value' ||
            (description.source === 'text' && !!target.closest('input,textarea,select,[contenteditable]'))
              ? null
              : description.name,
        },
      });
    };
    const cleanup = () => document.removeEventListener('keydown', onKey, true);
    context.onCleanup(cleanup);
    document.addEventListener('keydown', onKey, true);
    return cleanup;
  },
};
