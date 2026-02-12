/* istanbul ignore file */
/* eslint-disable no-restricted-globals */
import { AMPLITUDE_VISUAL_TAGGING_SELECTOR_SCRIPT_URL, AMPLITUDE_VISUAL_TAGGING_HIGHLIGHT_CLASS } from '../constants';
import { ActionType, BaseWindowMessenger, asyncLoadScript } from '@amplitude/analytics-core';
import { VERSION } from '../version';
import { DataExtractor } from '../data-extractor';

export type Action =
  | 'ping'
  | 'pong'
  | 'page-loaded'
  | 'selector-loaded'
  | 'initialize-visual-tagging-selector'
  | 'close-visual-tagging-selector'
  | 'element-selected'
  | 'track-selector-mode-changed'
  | 'track-selector-moved'
  | 'initialize-background-capture'
  | 'close-background-capture'
  | 'background-capture-loaded'
  | 'background-capture-complete';

interface InitializeVisualTaggingSelectorData {
  actionType: ActionType;
}

interface ElementSelectedData {
  '[Amplitude] Element Hierarchy'?: string;
  '[Amplitude] Element Tag'?: string;
  '[Amplitude] Element Text'?: string;
  '[Amplitude] Page URL'?: string;
  elementScreenshot?: Blob;
}

interface TrackSelectorModeChangedData {
  newMode: string;
  pageUrl?: string;
}

interface TrackSelectorMovedData {
  newEditorLocation: string;
  pageUrl?: string;
}

export type ActionData = {
  ping: null | undefined;
  pong: null | undefined;
  'page-loaded': null | undefined;
  'selector-loaded': null | undefined;
  'initialize-visual-tagging-selector': InitializeVisualTaggingSelectorData | null | undefined;
  'close-visual-tagging-selector': null | undefined;
  'element-selected': ElementSelectedData;
  'track-selector-mode-changed': TrackSelectorModeChangedData;
  'track-selector-moved': TrackSelectorMovedData;
  'initialize-background-capture': null | undefined;
  'close-background-capture': null | undefined;
  'background-capture-loaded': null | undefined;
  'background-capture-complete': { [key: string]: string | null };
};

export interface Message<A extends Action> {
  action: A;
  data?: ActionData[A];
}

/**
 * Brand key to track whether visual tagging has been enabled on a messenger.
 */
const VISUAL_TAGGING_BRAND = '__AMPLITUDE_VISUAL_TAGGING__' as const;

/**
 * Enable visual tagging on a messenger instance.
 * The first call registers the handlers; subsequent calls are no-ops.
 *
 * @param messenger - The messenger to enable visual tagging on
 * @param options - Visual tagging configuration
 */
export function enableVisualTagging(
  messenger: BaseWindowMessenger,
  options: {
    isElementSelectable?: (action: InitializeVisualTaggingSelectorData['actionType'], element: Element) => boolean;
    cssSelectorAllowlist?: string[];
    actionClickAllowlist?: string[];
    dataExtractor: DataExtractor;
  },
): void {
  // Idempotency guard — works across bundle boundaries
  const branded = messenger as unknown as Record<string, unknown>;
  if (branded[VISUAL_TAGGING_BRAND] === true) {
    return;
  }
  branded[VISUAL_TAGGING_BRAND] = true;

  const { dataExtractor, isElementSelectable, cssSelectorAllowlist, actionClickAllowlist } = options;

  let amplitudeVisualTaggingSelectorInstance: any = null;

  const onSelect = (data: ElementSelectedData) => {
    messenger.notify({ action: 'element-selected', data });
  };

  const onTrack = (type: string, properties: { [key: string]: string | null }) => {
    if (type === 'selector-mode-changed') {
      messenger.notify({ action: 'track-selector-mode-changed', data: properties });
    } else if (type === 'selector-moved') {
      messenger.notify({ action: 'track-selector-moved', data: properties });
    }
  };

  messenger.registerActionHandler(
    'initialize-visual-tagging-selector',
    (actionData: InitializeVisualTaggingSelectorData) => {
      asyncLoadScript(AMPLITUDE_VISUAL_TAGGING_SELECTOR_SCRIPT_URL)
        .then(() => {
          // eslint-disable-next-line
          amplitudeVisualTaggingSelectorInstance = (window as any)?.amplitudeVisualTaggingSelector?.({
            getEventTagProps: dataExtractor.getEventTagProps,
            isElementSelectable: (element: Element) => {
              if (isElementSelectable) {
                return isElementSelectable(actionData?.actionType || 'click', element);
              }
              return true;
            },
            onTrack,
            onSelect,
            visualHighlightClass: AMPLITUDE_VISUAL_TAGGING_HIGHLIGHT_CLASS,
            messenger,
            cssSelectorAllowlist,
            actionClickAllowlist,
            extractDataFromDataSource: dataExtractor.extractDataFromDataSource,
            dataExtractor,
            diagnostics: {
              autocapture: {
                version: VERSION,
              },
            },
          });
          messenger.notify({ action: 'selector-loaded' });
        })
        .catch(() => {
          messenger.logger?.warn('Failed to initialize visual tagging selector');
        });
    },
  );

  messenger.registerActionHandler('close-visual-tagging-selector', () => {
    // eslint-disable-next-line
    amplitudeVisualTaggingSelectorInstance?.close?.();
  });
}
