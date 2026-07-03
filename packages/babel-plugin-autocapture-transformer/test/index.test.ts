import { transformSync } from '@babel/core';
import autocaptureTransformer, { PACKAGE_NAME, PLUGIN_NAME } from '../src';

describe('@amplitude/babel-plugin-autocapture-transformer', () => {
  const transform = (input: string) =>
    transformSync(input, {
      plugins: [autocaptureTransformer],
      presets: ['@babel/preset-typescript', '@babel/preset-react'],
      filename: 'App.tsx',
      configFile: false,
      babelrc: false,
    });

  it('exports the package and plugin names', () => {
    expect(PACKAGE_NAME).toBe('@amplitude/babel-plugin-autocapture-transformer');
    expect(PLUGIN_NAME).toBe(PACKAGE_NAME);
  });

  it('wraps Button onPress handlers and adds track import', () => {
    const input = `function HomeScreen() {
  return <Button title="Go" onPress={() => console.log('pressed')} />;
}`;

    const result = transform(input);

    expect(result?.code).toContain('import { track } from "@amplitude/analytics-react-native"');
    expect(result?.code).toContain('track("[Amplitude] Element Clicked")');
    expect(result?.code).toContain("console.log('pressed')");
  });

  it('includes accessibility-label in track event properties', () => {
    const input = `function HomeScreen() {
  return (
    <Button
      accessibilityLabel="Online test label"
      title="Online test"
      onPress={() => track('RN Expo Online Test')}
    />
  );
}`;

    const result = transform(input);

    expect(result?.code).toMatchInlineSnapshot(`
      "import { track } from "@amplitude/analytics-react-native";
      function HomeScreen() {
        return /*#__PURE__*/React.createElement(Button, {
          accessibilityLabel: "Online test label",
          title: "Online test",
          onPress: (...args) => {
            track("[Amplitude] Element Clicked", {
              "accessibilityLabel": "Online test label"
            });
            (() => track('RN Expo Online Test'))(...args);
          }
        });
      }"
    `);
  });

  it('supports dynamic accessibilityLabel expressions', () => {
    const input = `function HomeScreen({ label }) {
  return <Button accessibilityLabel={label} title="Go" onPress={onPress} />;
}`;

    const result = transform(input);

    expect(result?.code).toContain('"accessibilityLabel": label');
  });

  it('wraps function reference onPress handlers', () => {
    const input = `function HomeScreen({ onPress }) {
  return <Button title="Go" onPress={onPress} />;
}`;

    const result = transform(input);

    expect(result?.code).toContain('import { track } from "@amplitude/analytics-react-native"');
    expect(result?.code).toMatch(/onPress\(\.\.\.args\)/);
  });

  it('adds track to an existing amplitude import instead of duplicating', () => {
    const input = `import { init } from '@amplitude/analytics-react-native';

function HomeScreen() {
  init('api-key');
  return <Button title="Go" onPress={() => console.log('pressed')} />;
}`;

    const result = transform(input);

    expect(result?.code).toMatch(/import \{ init, track \} from ['"]@amplitude\/analytics-react-native['"]/);
    expect(result?.code?.match(/import .*@amplitude\/analytics-react-native/g)?.length).toBe(1);
  });

  it('does not add import when no Button is transformed', () => {
    const input = `function HomeScreen() {
  return <Text onPress={() => console.log('pressed')} />;
}`;

    const result = transform(input);

    expect(result?.code).not.toContain('@amplitude/analytics-react-native');
    expect(result?.code).not.toContain('[Amplitude] Element Clicked');
  });
});
