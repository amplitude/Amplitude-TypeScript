import { transformSync } from '@babel/core';
import autocaptureTransformer, { PACKAGE_NAME, PLUGIN_NAME } from '../src';
import type { AutocaptureTransformerOptions } from '../src';

describe('@amplitude/babel-plugin-autocapture-transformer', () => {
  let fileCounter = 0;

  const transform = (input: string, options?: AutocaptureTransformerOptions) =>
    transformSync(input, {
      plugins: [[autocaptureTransformer, options]],
      presets: ['@babel/preset-typescript', '@babel/preset-react'],
      filename: `App-${++fileCounter}.tsx`,
      configFile: false,
      babelrc: false,
    })?.code;

  it('exports the package and plugin names', () => {
    expect(PACKAGE_NAME).toBe('@amplitude/babel-plugin-autocapture-transformer');
    expect(PLUGIN_NAME).toBe(PACKAGE_NAME);
  });

  it('wraps Button onPress handlers and adds ampCapture import', () => {
    const input = `function HomeScreen() {
  return <Button title="Go" onPress={() => console.log('pressed')} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('includes accessibility-label in track event properties', () => {
    const input = `function HomeScreen() {
  return (
    <Button
      accessibilityLabel="Online test label"
      title="Online test"
      onPress={func}
      testID="12345"
    />
  );
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('includes element and component for arrow function components', () => {
    const input = `const HomeScreen = () => {
  return <Button title="Go" onPress={onPress} />;
};`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('includes element and component for named function expressions', () => {
    const input = `(function HomeScreen() {
  return <Button title="Go" onPress={onPress} />;
})();`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('includes element and component for object property components', () => {
    const input = `const screens = {
  HomeScreen: () => <Button title="Go" onPress={onPress} />,
  'SettingsScreen': () => <Button title="Go" onPress={onPress} />,
};`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('includes element and component for object method components', () => {
    const input = `const screens = {
  HomeScreen() {
    return <Button title="Go" onPress={onPress} />;
  },
};`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('includes element and component for class components', () => {
    const input = `class HomeScreen extends React.Component {
  render() {
    return <Button title="Go" onPress={this.onPress} />;
  }
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('includes element and component for named class expressions', () => {
    const input = `const Screen = class HomeScreen extends React.Component {
  render() {
    return <Button title="Go" onPress={this.onPress} />;
  }
};`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('includes element and component for anonymous class expressions assigned to a variable', () => {
    const input = `const HomeScreen = class extends React.Component {
  render() {
    return <Button title="Go" onPress={this.onPress} />;
  }
};`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('omits component when the enclosing function is anonymous', () => {
    const input = `export default () => {
  return <Button title="Go" onPress={onPress} />;
};`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('supports dynamic accessibilityLabel expressions', () => {
    const input = `function HomeScreen({ label }) {
  return <Button accessibilityLabel={label} title="Go" onPress={onPress} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('wraps function reference onPress handlers', () => {
    const input = `function HomeScreen({ onPress }) {
  return <Button title="Go" onPress={onPress} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('adds ampCapture to an existing amplitude import instead of duplicating', () => {
    const input = `import { init } from '@amplitude/analytics-react-native';

function HomeScreen() {
  init('api-key');
  return <Button title="Go" onPress={() => console.log('pressed')} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('does not add import when no Button is transformed', () => {
    const input = `function HomeScreen() {
  return <Text onPress={() => console.log('pressed')} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('inserts ampCapture import after existing non-amplitude imports', () => {
    const input = `import React from 'react';

function HomeScreen() {
  return <Button title="Go" onPress={onPress} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('reuses an existing ampCapture import', () => {
    const input = `import { ampCapture } from '@amplitude/analytics-react-native';

function HomeScreen() {
  void ampCapture;
  return <Button title="Go" onPress={onPress} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('reuses an aliased ampCapture import', () => {
    const input = `import { ampCapture as capturePress } from '@amplitude/analytics-react-native';

function HomeScreen() {
  void capturePress;
  return <Button title="Go" onPress={onPress} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('recognizes ampCapture when imported with a string literal export name', () => {
    const input = `import { 'ampCapture' as capturePress } from '@amplitude/analytics-react-native';

function HomeScreen() {
  void capturePress;
  return <Button title="Go" onPress={onPress} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('wraps onLongPress handlers on pressable elements', () => {
    const input = `function HomeScreen() {
  return <Pressable onLongPress={() => console.log('long press')} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('transforms TouchableOpacity onPress handlers', () => {
    const input = `function HomeScreen() {
  return <TouchableOpacity onPress={handlePress} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('does not transform pressable elements without expression handlers', () => {
    const input = `function HomeScreen() {
  return <Button title="Go" />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('does not transform pressable elements with non-expression onPress handlers', () => {
    const input = `function HomeScreen() {
  return <Button title="Go" onPress="handler" />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('ignores spread attributes when collecting capture properties', () => {
    const input = `function HomeScreen({ buttonProps }) {
  return <Button {...buttonProps} accessibilityLabel="Label" onPress={onPress} title="Go" />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('ignores boolean accessibilityLabel attributes without values', () => {
    const input = `function HomeScreen() {
  return <Button accessibilityLabel onPress={onPress} title="Go" />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('does not transform non-pressable JSX elements', () => {
    const input = `function HomeScreen() {
  return <View onPress={() => console.log('pressed')} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('does not transform JSX member expression elements', () => {
    const input = `function HomeScreen() {
  return <RN.Button title="Go" onPress={onPress} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('wraps Switch onValueChange handlers', () => {
    const input = `function HomeScreen() {
  return <Switch value={enabled} onValueChange={setEnabled} accessibilityLabel="Enable notifications" testID="notifications-switch" />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('wraps TextInput onChangeText and onSubmitEditing handlers', () => {
    const input = `function HomeScreen() {
  return (
    <TextInput
      accessibilityLabel="Email"
      testID="email-input"
      onChangeText={setEmail}
      onSubmitEditing={submitEmail}
    />
  );
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('wraps Slider onValueChange handlers', () => {
    const input = `function HomeScreen() {
  return <Slider value={volume} onValueChange={setVolume} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('transforms custom pressable elements from options', () => {
    const input = `function HomeScreen() {
  return <CustomButton title="Go" onPress={onPress} />;
}`;

    expect(
      transform(input, {
        pressableElements: ['CustomButton'],
      }),
    ).toMatchSnapshot();
  });

  it('transforms custom value-change elements from options', () => {
    const input = `function HomeScreen() {
  return <Toggle value={enabled} onValueChange={setEnabled} />;
}`;

    expect(
      transform(input, {
        valueChangeElements: ['Toggle'],
      }),
    ).toMatchSnapshot();
  });

  it('transforms custom text-change elements from options', () => {
    const input = `function HomeScreen() {
  return <SearchField onChangeText={setQuery} onSubmitEditing={submitQuery} />;
}`;

    expect(
      transform(input, {
        textChangeElements: ['SearchField'],
      }),
    ).toMatchSnapshot();
  });

  it('still transforms default elements when custom element options are provided', () => {
    const input = `function HomeScreen() {
  return (
    <>
      <Button title="Go" onPress={onPress} />
      <CustomButton title="Go" onPress={onPress} />
    </>
  );
}`;

    expect(
      transform(input, {
        pressableElements: ['CustomButton'],
      }),
    ).toMatchSnapshot();
  });

  it('does not transform unknown elements when options omit them', () => {
    const input = `function HomeScreen() {
  return <CustomButton title="Go" onPress={onPress} />;
}`;

    expect(transform(input)).toMatchSnapshot();
  });

  it('ignores empty custom element option arrays', () => {
    const input = `function HomeScreen() {
  return <CustomButton title="Go" onPress={onPress} />;
}`;

    expect(
      transform(input, {
        pressableElements: [],
      }),
    ).toMatchSnapshot();
  });
});
