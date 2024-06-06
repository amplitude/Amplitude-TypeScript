import { BrowserClient, Event, EnrichmentPlugin } from '@amplitude/analytics-types';
import {
  DEFAULT_FORM_START_EVENT,
  DEFAULT_FORM_SUBMIT_EVENT,
  FORM_ID,
  FORM_NAME,
  FORM_DESTINATION,
} from '../constants';
import { BrowserConfig } from '../config';
import { getGlobalScope } from '@amplitude/analytics-client-common';

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
    // The form interaction plugin observes changes in the dom. For this to work correctly, the observer can only be setup
    // after the body is built. When Amplitud gets initialized in a script tag, the body tag is still unavailable. So register this
    // only after the window is loaded
    /* istanbul ignore next */
    getGlobalScope()?.addEventListener('load', function () {
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
          if (!hasFormChanged) {
            amplitude.track(DEFAULT_FORM_START_EVENT, {
              [FORM_ID]: stringOrUndefined(form.id),
              [FORM_NAME]: stringOrUndefined(form.name),
              [FORM_DESTINATION]: form.action,
            });
          }
          hasFormChanged = true;
        });

        addEventListener(form, 'submit', () => {
          if (!hasFormChanged) {
            amplitude.track(DEFAULT_FORM_START_EVENT, {
              [FORM_ID]: stringOrUndefined(form.id),
              [FORM_NAME]: stringOrUndefined(form.name),
              [FORM_DESTINATION]: form.action,
            });
          }

          amplitude.track(DEFAULT_FORM_SUBMIT_EVENT, {
            [FORM_ID]: stringOrUndefined(form.id),
            [FORM_NAME]: stringOrUndefined(form.name),
            [FORM_DESTINATION]: form.action,
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
    });
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
