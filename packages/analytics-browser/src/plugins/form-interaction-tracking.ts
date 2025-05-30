import {
  DEFAULT_FORM_START_EVENT,
  DEFAULT_FORM_SUBMIT_EVENT,
  FORM_ID,
  FORM_NAME,
  FORM_DESTINATION,
} from '../constants';
import { BrowserConfig } from '../config';
import { getGlobalScope, Event, EnrichmentPlugin, BrowserClient } from '@amplitude/analytics-core';

interface EventListener {
  element: Element;
  type: 'change' | 'submit';
  handler: () => void;
}

export const formInteractionTracking = (): EnrichmentPlugin => {
  let observer: MutationObserver | undefined;
  let eventListeners: EventListener[] = [];

  const addEventListener = (element: Element, type: 'change' | 'submit', handler: () => void) => {
    element.addEventListener(type, handler);
    eventListeners.push({
      element,
      type,
      handler,
    });
  };

  const removeClickListeners = () => {
    eventListeners.forEach(({ element, type, handler }) => {
      /* istanbul ignore next */
      element?.removeEventListener(type, handler);
    });
    eventListeners = [];
  };

  const name = '@amplitude/plugin-form-interaction-tracking-browser';
  const type = 'enrichment';
  const setup = async (config: BrowserConfig, amplitude: BrowserClient) => {
    const initializeFormTracking = () => {
      /* istanbul ignore if */
      if (!amplitude) {
        // TODO: Add required minimum version of @amplitude/analytics-browser
        config.loggerProvider.warn(
          'Form interaction tracking requires a later version of @amplitude/analytics-browser. Form interaction events are not tracked.',
        );
        return;
      }

      /* istanbul ignore if */
      if (typeof document === 'undefined') {
        return;
      }

      const addFormInteractionListener = (form: HTMLFormElement) => {
        let hasFormChanged = false;

        addEventListener(form, 'change', () => {
          const formDestination = extractFormAction(form);
          if (!hasFormChanged) {
            amplitude.track(DEFAULT_FORM_START_EVENT, {
              [FORM_ID]: stringOrUndefined(form.id),
              [FORM_NAME]: stringOrUndefined(form.name),
              [FORM_DESTINATION]: formDestination,
            });
          }
          hasFormChanged = true;
        });

        addEventListener(form, 'submit', () => {
          const formDestination = extractFormAction(form);
          if (!hasFormChanged) {
            amplitude.track(DEFAULT_FORM_START_EVENT, {
              [FORM_ID]: stringOrUndefined(form.id),
              [FORM_NAME]: stringOrUndefined(form.name),
              [FORM_DESTINATION]: formDestination,
            });
          }

          amplitude.track(DEFAULT_FORM_SUBMIT_EVENT, {
            [FORM_ID]: stringOrUndefined(form.id),
            [FORM_NAME]: stringOrUndefined(form.name),
            [FORM_DESTINATION]: formDestination,
          });
          hasFormChanged = false;
        });
      };

      // Adds listener to existing anchor tags
      const forms = Array.from(document.getElementsByTagName('form'));
      forms.forEach(addFormInteractionListener);

      // Adds listener to anchor tags added after initial load
      /* istanbul ignore else */
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeName === 'FORM') {
                addFormInteractionListener(node as HTMLFormElement);
              }
              if ('querySelectorAll' in node && typeof node.querySelectorAll === 'function') {
                Array.from(node.querySelectorAll('form') as HTMLFormElement[]).map(addFormInteractionListener);
              }
            });
          });
        });

        observer.observe(document.body, {
          subtree: true,
          childList: true,
        });
      }
    };

    // If the document is already loaded, initialize immediately.
    if (document.readyState === 'complete') {
      initializeFormTracking();
    } else {
      // Otherwise, wait for the load event.
      // The form interaction plugin observes changes in the dom. For this to work correctly, the observer can only be setup
      // after the body is built. When Amplitude gets initialized in a script tag, the body tag is still unavailable. So register this
      // only after the window is loaded
      const window = getGlobalScope();
      /* istanbul ignore else*/
      if (window) {
        window.addEventListener('load', initializeFormTracking);
      } else {
        config.loggerProvider.debug('Form interaction tracking is not installed because global is undefined.');
      }
    }
  };
  const execute = async (event: Event) => event;
  const teardown = async () => {
    observer?.disconnect();
    removeClickListeners();
  };

  return {
    name,
    type,
    setup,
    execute,
    teardown,
  };
};

export const stringOrUndefined = <T>(name: T): T extends string ? string : undefined => {
  /* istanbul ignore if */
  if (typeof name !== 'string') {
    // We found instances where the value of `name` is an Element and not a string.
    // Elements may have circular references and would throw an error when passed to `JSON.stringify(...)`.
    // If a non-string value is seen, assume there is no value.
    return undefined as T extends string ? string : undefined;
  }

  return name as T extends string ? string : undefined;
};

// Extracts the form action attribute, and normalizes it to a valid URL to preserve the previous behavior of accessing the action property directly.
export const extractFormAction = (form: HTMLFormElement): string | null => {
  let formDestination = form.getAttribute('action');
  try {
    // eslint-disable-next-line no-restricted-globals
    formDestination = new URL(encodeURI(formDestination ?? ''), window.location.href).href;
  } catch {
    //
  }
  return formDestination;
};
