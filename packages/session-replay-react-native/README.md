# @amplitude/session-replay-react-native

Amplitude Session Replay for React Native

## Installation

```sh
npm install @amplitude/session-replay-react-native
```

## React Native New Architecture

This SDK supports both the New Architecture (Bridgeless / TurboModules) and the
legacy architecture. On the New Architecture the native module is exposed as a
TurboModule; on the legacy architecture it continues to work as a standard bridge
module. No configuration is required — the correct implementation is selected
automatically based on how your app is built.

`peerDependencies` are intentionally left unconstrained (`react-native: "*"`) so
the SDK keeps working on older React Native versions on the legacy architecture.
The TurboModule code path is compiled only when the New Architecture is enabled,
which itself requires React Native 0.74 or newer.

### Fabric-based masking

The layout-transparent masking components (`AmpMask` / `AmpUnmask`, see
[Layout-transparent masking](#layout-transparent-masking-with-ampmask--ampunmask-experimental))
are built on Fabric.

The Fabric/C++ sources compile only on the New Architecture with React Native
0.77 or newer (they rely on capabilities that exist only in those versions).
On the legacy architecture, or on the New Architecture with React Native older
than 0.77, the Fabric sources are excluded. Enabling the New Architecture on
React Native older than 0.77 fails the build fast with a clear error (an
"RN-floor gate" enforced in both `android/build.gradle` and the iOS podspec).

## Usage

### Session Replay React Native Standalone SDK

Initialize SDK with your amplidude API Key
```js
import { init, SessionReplayConfig } from '@amplitude/session-replay-react-native';

const config: SessionReplayConfig = { 
    apiKey: 'YOUR_API_KEY',
    deviceId: 'YOUR_DEVICE_ID',
    sessionId: Date.now()
}

await init(config);
```

### Session Replay React Native Plugin

Add the session replay plugin to your Amplitude instance as follows

```js
import { SessionReplayPlugin, SessionReplaPluginConfig } from '@amplitude/session-replay-react-native';

// ...

const config: SessionReplaPluginConfig = {
  enableRemoteConfig: true, // default true
  sampleRate: 1, // default 0
  logLevel: LogLevel.Warn, // default LogLevel.Warn
};
await init('YOUR_API_KEY').promise;
await add(new SessionReplayPlugin(config)).promise;
```

## Masking views

To maks certain views, add the `AmpMaskView` tag with the mask property `amp-mask` around the section to be masked

```js
import { AmpMaskView } from '@amplitude/session-replay-react-native';

// ...

<AmpMaskView mask="amp-mask">
  <Text
    style={[
      styles.sectionTitle,
      {
        color: isDarkMode ? Colors.white : Colors.black,
      },
    ]}
  >
    {title}
  </Text>
</AmpMaskView>;
```

## Unmasking views

To unmask views, add the `AmpMaskView` tag with the mask property `amp-unmask` around the section to be unmasked

```js
import { AmpMaskView } from '@amplitude/session-replay-react-native';

// ...

<AmpMaskView mask="amp-unmask">
  <Text
    style={[
      styles.sectionTitle,
      {
        color: isDarkMode ? Colors.white : Colors.black,
      },
    ]}
  >
    {title}
  </Text>
</AmpMaskView>;
```

## Layout-transparent masking with `AmpMask` / `AmpUnmask` (Experimental)

> **@experimental** — this API is new and may change in a future release.

`AmpMaskView` wraps its children in an extra native view, which introduces a
layout boundary: children that depend on their parent for sizing (`flex: 1`,
percentage heights, `position: 'absolute'`) can shift or collapse to zero.
`AmpMask` and `AmpUnmask` are layout-transparent replacements: they mark their
children as masked/unmasked in the replay without affecting layout at all —
wrapping content in `<AmpMask>` renders pixel-identical to not wrapping it.

### Requirements

`AmpMask`/`AmpUnmask` require React Native **0.77 or newer** with the
**New Architecture** enabled (Fabric) **with bridgeless enabled** (the RN
0.77 default). On Fabric without bridgeless (bridge mode) — as well as on
the Old Architecture — they are not supported as a layout-transparent path:

- On the Old Architecture, in development they throw with a clear error;
  in production they fall back to `AmpMaskView` and log a one-time
  `console.error`.
- On Fabric without bridgeless (bridge mode), they never throw — they
  always fall back to `AmpMaskView` and log a one-time `console.error`,
  in both development and production (bridge-mode Fabric cannot detect
  `SRMaskView` on iOS).
- Both fallbacks **ignore `enabled`** — wrapped content stays masked
  regardless (it fails toward privacy). Neither is layout-transparent —
  the `AmpMaskView` layout caveats above apply. Use `AmpMaskView`
  directly outside the bridgeless-Fabric path.

### Caveats

- `style` is not supported on `<AmpMask>`/`<AmpUnmask>` — they never occupy
  layout, so there is no box to style. Style your children directly instead.
- `enabled` is only honored on the layout-transparent Fabric path — all
  fallback paths (Old Architecture, Fabric bridge-mode, and the
  build-misconfiguration cases below) ignore it and keep content masked
  regardless (they fail toward privacy).
- If the New Architecture is active but the native `SRMaskView` component is
  missing — including on Fabric without bridgeless, which cannot detect
  `SRMaskView` on iOS and always falls back — `<AmpMask>`/`<AmpUnmask>` log a
  one-time `console.error` and fall back to `<AmpMaskView>` — content stays
  **masked**, but layout-transparency is lost. Treat that log as a build
  error to fix, not a warning to ignore.
- On the **New Architecture**, if the package's native code is absent
  entirely (so Session Replay cannot record at all), `<AmpMask>`/`<AmpUnmask>`
  log a one-time `console.error` and render children directly. If instead the
  native module is present but neither masking component is registered (an
  unexpected build error), they throw in development and log a distinct
  one-time `console.error` in production instead of silently passing content
  through. On the **Old Architecture** with the native code absent, rendering
  fails at `requireNativeComponent` like any other native component — there
  is no silent passthrough.

### Usage

```tsx
import { AmpMask, AmpUnmask } from '@amplitude/session-replay-react-native';

// Mask: children are masked in the replay, layout is unchanged.
<AmpMask>
  <View style={{ flex: 1 }}>
    <Text>{accountNumber}</Text>
  </View>
</AmpMask>

// Block: fully block the subtree from the replay.
<AmpMask maskLevel="block">
  <CreditCardForm />
</AmpMask>

// Unmask: opt content back in to the replay.
<AmpUnmask>
  <Text>Public banner</Text>
</AmpUnmask>
```

`AmpMask` props:

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | When `false`, children render without masking. |
| `maskLevel` | `'mask' \| 'block'` | `'mask'` | Masking level applied to the children. On iOS, `mask` and `block` currently behave identically (both fully block). |

`AmpUnmask` takes no masking props — it always unmasks its children.

### Migrating from `AmpMaskView`

| Before | After |
| --- | --- |
| `<AmpMaskView mask="amp-mask">` | `<AmpMask>` |
| `<AmpMaskView mask="amp-block">` | `<AmpMask maskLevel="block">` |
| `<AmpMaskView mask="amp-unmask">` | `<AmpUnmask>` |

`AmpMaskView` remains supported on both architectures. Prefer
`AmpMask`/`AmpUnmask` on the New Architecture, especially around children that
are sized by their parent (`flex: 1`, percentage heights, absolute
positioning).

## Tracking Web Views (Beta)

Web views are blocked by default and will not be tracked. If you'd like webviews to be tracked, you can manually unmask
them by doing the following

```js
<AmpMaskView mask="amp-unmask" style={{ flex: 1 }}>
  <WebView source={{ uri: 'https://reactnative.dev/' }} style={{ flex: 1 }} />
</AmpMaskView>
```
