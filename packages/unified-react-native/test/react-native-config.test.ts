import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const preset = require('../react-native.config') as {
  dependencies: Record<string, { root: string }>;
};

describe('React Native autolinking preset', () => {
  test('exposes every transitive native dependency', () => {
    expect(Object.keys(preset.dependencies).sort()).toEqual([
      '@amplitude/analytics-react-native',
      '@amplitude/experiment-react-native-client',
      '@amplitude/plugin-engagement-react-native',
      '@amplitude/plugin-session-replay-react-native',
      '@react-native-async-storage/async-storage',
    ]);
  });

  test.each(Object.entries(preset.dependencies))('resolves %s to its package root', (packageName, config) => {
    expect(config.root).toBe(path.dirname(require.resolve(`${packageName}/package.json`)));
  });
});
