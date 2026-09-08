import { libraryPlugin } from '../src/library';
import { VERSION } from '../src/version';

test('adds the unified React Native library to events', async () => {
  const plugin = libraryPlugin();
  const event = { event_type: 'test', library: 'analytics-react-native/1.0.0' };

  await expect(plugin.execute?.(event)).resolves.toMatchObject({
    library: `amplitude-ts-unified-react-native/${VERSION}-analytics-react-native/1.0.0`,
  });
});

test('handles events without an existing library', async () => {
  const plugin = libraryPlugin();

  await expect(plugin.execute?.({ event_type: 'test' })).resolves.toMatchObject({
    library: `amplitude-ts-unified-react-native/${VERSION}-`,
  });
});
