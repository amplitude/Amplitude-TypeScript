import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BrowserConfig, CoreClient, EnrichmentPlugin, Event } from '@amplitude/analytics-types';
import { DEFAULT_NPS_EVENT, html } from './constants';

const ID = 'amp-nps';

export class NPSPlugin implements EnrichmentPlugin {
  name = '@amplitude/plugin-nps-browser';
  type = 'enrichment' as const;
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  client: CoreClient;

  async setup(config: BrowserConfig, client: CoreClient) {
    config.loggerProvider.log('Installing @amplitude/plugin-nps-browser.');

    this.config = config;
    this.client = client;
    const globalScope = getGlobalScope();
    if (globalScope && globalScope.document) {
      const wrappingDiv = globalScope.document.createElement('div');
      wrappingDiv.id = ID;
      wrappingDiv.innerHTML = html;
      this.addScoreSelectHandler(wrappingDiv);
      document.body.appendChild(wrappingDiv);
    }
  }

  onSelectScore(score: number) {
    console.log('selecting score');
    this.client.track(DEFAULT_NPS_EVENT, {
      score,
    });
  }

  addScoreSelectHandler(wrappingDiv: HTMLDivElement) {
    const globalScope = getGlobalScope();
    if (globalScope && globalScope.document) {
      const liElems = wrappingDiv.querySelectorAll('li');
      for (let i = 0; i < liElems.length; i++) {
        const liElem = liElems[i];
        liElem.addEventListener('click', () => this.onSelectScore(i));
      }
    }
  }

  async execute(event: Event) {
    return event;
  }

  async teardown(): Promise<void> {
    return Promise.resolve();
  }
}

export const npsPlugin: () => EnrichmentPlugin = () => {
  return new NPSPlugin();
};
