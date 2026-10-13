import type { EnrichmentPlugin, Event } from '@amplitude/analytics-core';
import { VERSION } from './version';

const LIBRARY_PREFIX = 'amplitude-ts-unified-react-native';

export const libraryPlugin = (): EnrichmentPlugin => ({
  type: 'enrichment',
  name: '@amplitude/unified-react-native-library-plugin',
  async execute(event: Event): Promise<Event> {
    event.library = `${LIBRARY_PREFIX}/${VERSION}-${event.library ?? ''}`;
    return event;
  },
});
