import { transformSync } from '@babel/core';
import autocaptureTransformer, { PACKAGE_NAME, PLUGIN_NAME } from '../src';

describe('@amplitude/babel-plugin-autocapture-transformer', () => {
  it('exports the package and plugin names', () => {
    expect(PACKAGE_NAME).toBe('@amplitude/babel-plugin-autocapture-transformer');
    expect(PLUGIN_NAME).toBe(PACKAGE_NAME);
  });

  it('registers as a passthrough babel plugin', () => {
    const plugin = autocaptureTransformer();
    expect(plugin.name).toBe(PLUGIN_NAME);
    expect(plugin.visitor).toEqual({});
  });

  it('leaves source unchanged', () => {
    const input = `function HomeScreen() {
  return <Button title="Go" onPress={() => console.log('pressed')} />;
}`;

    const result = transformSync(input, {
      plugins: [autocaptureTransformer],
      presets: ['@babel/preset-typescript', '@babel/preset-react'],
      filename: 'App.tsx',
      configFile: false,
      babelrc: false,
    });

    expect(result?.code).not.toContain('capture(');
    expect(result?.code).not.toContain('amplitudeAutocaptureRuntime');
  });
});
