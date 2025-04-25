import { Types } from '@amplitude/analytics-browser';
import { VERSION } from './version';

const LIBPREFIX = 'amplitude-ts-unified';

export const libraryPlugin = (): Types.BeforePlugin => {
  return {
    type: 'before',
    name: '@amplitude/unified-library-plugin',
    async execute(event: Types.Event): Promise<Types.Event | null> {
      event.library = `${LIBPREFIX}/${VERSION}-${event.library ?? ''}`;
      return event;
    },
  };
};
