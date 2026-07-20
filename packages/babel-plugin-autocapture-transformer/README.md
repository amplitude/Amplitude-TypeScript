# @amplitude/babel-plugin-autocapture-transformer

A Babel plugin that wraps React Native interaction handlers with Amplitude's `ampCapture` helper at compile time, so element clicks and other UI events can be autocaptured without changing your source JSX by hand.

## Install

```sh
npm install --save-dev @amplitude/babel-plugin-autocapture-transformer
```

This plugin expects `@amplitude/analytics-react-native` to be installed in your app (it auto-imports `ampCapture` from that package).

## Example

**In**

```jsx
function HomeScreen() {
  return (
    <Button
      accessibilityLabel="Online test label"
      testID="12345"
      title="Online test"
      onPress={func}
    />
  );
}
```

**Out**

```jsx
import { ampCapture } from '@amplitude/analytics-react-native';

function HomeScreen() {
  return (
    <Button
      accessibilityLabel="Online test label"
      testID="12345"
      title="Online test"
      onPress={ampCapture(func, {
        event: 'Press',
        accessibilityLabel: 'Online test label',
        testID: '12345',
        element: 'Button',
        component: 'HomeScreen',
      })}
    />
  );
}
```

When a file already imports from `@amplitude/analytics-react-native`, the plugin adds `ampCapture` to that import instead of inserting a second one.

## Usage

### `.babelrc` / `babel.config.json`

```json
{
  "plugins": ["@amplitude/babel-plugin-autocapture-transformer"]
}
```

### `babel.config.js` (Expo / React Native)

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['@amplitude/babel-plugin-autocapture-transformer'],
  };
};
```

### With options

```json
{
  "plugins": [
    [
      "@amplitude/babel-plugin-autocapture-transformer",
      {
        "pressableElements": ["CustomButton"],
        "valueChangeElements": ["Toggle"],
        "textChangeElements": ["SearchField"]
      }
    ]
  ]
}
```

## What gets transformed

The plugin only rewrites known interactive JSX elements that already have an expression handler (for example `onPress={handler}`). String handlers and elements without handlers are left alone.

| Category | Default elements | Attributes → event |
| --- | --- | --- |
| Pressable | `Button`, `TouchableOpacity`, `TouchableHighlight`, `TouchableWithoutFeedback`, `Pressable`, `Touchable`, `TouchableNativeFeedback`, `Link` | `onPress` → `Press`, `onLongPress` → `LongPress` |
| Value change | `Switch`, `Slider`, `Picker` | `onValueChange` → `ValueChange` |
| Text change | `TextInput` | `onChangeText` → `ChangeText`, `onSubmitEditing` → `SubmitEditing` |

If the element also has `accessibilityLabel` and/or `testID`, those values are copied into the `ampCapture` properties object. The plugin also adds:

- `element` — the JSX tag name (for example `Button`)
- `component` — the enclosing React component or function name when it can be resolved (for example `HomeScreen`)

## Options

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `pressableElements` | `string[]` | `[]` | Additional JSX component names treated as pressable (`onPress` / `onLongPress`). Merged with the built-in defaults. |
| `valueChangeElements` | `string[]` | `[]` | Additional JSX component names treated as value-change elements (`onValueChange`). Merged with the built-in defaults. |
| `textChangeElements` | `string[]` | `[]` | Additional JSX component names treated as text-change elements (`onChangeText` / `onSubmitEditing`). Merged with the built-in defaults. |

## Limitations

- Only plain JSX identifiers are transformed (`<Button />`). Member expressions like `<RN.Button />` are ignored and need to be included in the options array.
- Custom components are not transformed unless you list them in the matching options array.
- Spread attributes (for example `{...props}`) are not inspected for `accessibilityLabel` / `testID`; only attributes written directly on the element are collected.
- `component` is omitted when the enclosing function is anonymous (for example `export default () => …`).

## License

MIT
