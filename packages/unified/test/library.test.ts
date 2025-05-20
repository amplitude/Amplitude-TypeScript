import { libraryPlugin } from '../src/library';
import { Types } from '@amplitude/analytics-browser';
import { VERSION } from '../src/version';

describe('libraryPlugin', () => {
  test('should prepend the correct library prefix and version to an event', async () => {
    const plugin = libraryPlugin();
    const originalLibrary = 'amplitude-ts/2.11.0';
    const event: Types.Event = { event_type: 'test_event', library: originalLibrary };
    const result = await plugin.execute?.(event);

    expect(result?.library).toMatch(`amplitude-ts-unified/${VERSION}-${originalLibrary}`);
  });

  test('should handle when library is undefined', async () => {
    const plugin = libraryPlugin();
    const event: Types.Event = { event_type: 'test_event' };
    const result = await plugin.execute?.(event);

    expect(result?.library).toMatch(`amplitude-ts-unified/${VERSION}-`);
  });

  it('should have the correct plugin type and name', () => {
    const plugin = libraryPlugin();

    expect(plugin.type).toBe('enrichment');
    expect(plugin.name).toBe('@amplitude/unified-library-plugin');
  });
});
