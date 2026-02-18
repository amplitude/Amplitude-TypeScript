/* istanbul ignore file */
/* eslint-disable no-restricted-globals */
import { AMPLITUDE_VISUAL_TAGGING_SELECTOR_SCRIPT_URL, AMPLITUDE_VISUAL_TAGGING_HIGHLIGHT_CLASS } from '../constants';
import {
  ILogger,
  ActionType,
  BaseWindowMessenger,
  AMPLITUDE_ORIGIN,
  asyncLoadScript,
  enableBackgroundCapture,
} from '@amplitude/analytics-core';
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
 * WindowMessenger extends BaseWindowMessenger with autocapture-specific
 * visual tagging functionality. Background capture is handled by the base class.
 */
export class WindowMessenger extends BaseWindowMessenger {
  constructor({ origin = AMPLITUDE_ORIGIN }: { origin?: string } = {}) {
    super({ origin });
  }

  setup(
    {
      logger,
      endpoint,
      isElementSelectable,
      cssSelectorAllowlist,
      actionClickAllowlist,
      dataExtractor,
    }: {
      logger?: ILogger;
      endpoint?: string;
      isElementSelectable?: (action: InitializeVisualTaggingSelectorData['actionType'], element: Element) => boolean;
      cssSelectorAllowlist?: string[];
      actionClickAllowlist?: string[];
      dataExtractor: DataExtractor;
    } = { dataExtractor: new DataExtractor({}) },
  ) {
    // Enable background capture on this messenger (idempotent)
    enableBackgroundCapture(this);

    // Register visual tagging action handlers
    let amplitudeVisualTaggingSelectorInstance: any = null;

    this.registerActionHandler(
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
              onTrack: this.onTrack,
              onSelect: this.onSelect,
              visualHighlightClass: AMPLITUDE_VISUAL_TAGGING_HIGHLIGHT_CLASS,
              messenger: this,
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
            this.notify({ action: 'selector-loaded' });
          })
          .catch(() => {
            this.logger?.warn('Failed to initialize visual tagging selector');
          });
      },
    );

    this.registerActionHandler('close-visual-tagging-selector', () => {
      // eslint-disable-next-line
      amplitudeVisualTaggingSelectorInstance?.close?.();
    });

    // Call base setup (sets up message listener, idempotent)
    super.setup({ logger, endpoint });
  }

  private onSelect = (data: ElementSelectedData) => {
    this.notify({ action: 'element-selected', data });
  };

  private onTrack = (type: string, properties: { [key: string]: string | null }) => {
    if (type === 'selector-mode-changed') {
      this.notify({ action: 'track-selector-mode-changed', data: properties });
    } else if (type === 'selector-moved') {
      this.notify({ action: 'track-selector-moved', data: properties });
    }
  };
}
