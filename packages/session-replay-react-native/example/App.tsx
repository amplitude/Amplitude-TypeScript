/**
 * Sample React Native App for @amplitude/session-replay-react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import {
  Button,
  Image,
  ImageBackground,
  type LayoutChangeEvent,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

import {
  Colors,
  DebugInstructions,
  Header,
  LearnMoreLinks,
  ReloadInstructions,
} from 'react-native/Libraries/NewAppScreen';

import {
  add,
  Identify,
  identify,
  init,
  track,
} from '@amplitude/analytics-react-native';
import { LogLevel } from '@amplitude/analytics-types';
import { NavigationContainer } from '@react-navigation/native';

import {
  SessionReplayPlugin,
  AmpMaskView,
  type SessionReplayPluginConfig,
} from '@amplitude/session-replay-react-native';
import SRMaskView from '@amplitude/session-replay-react-native/src/specs/SRMaskViewNativeComponent';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';

type SectionProps = PropsWithChildren<{
  title: string;
}>;

let sessionReplayPlugin: SessionReplayPlugin | undefined = undefined;

function Section({ children, title }: SectionProps): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <View style={styles.sectionContainer}>
      <TouchableWithoutFeedback
        onPress={() => {
          console.log('tap');
          track('tap');
        }}
      >
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
        </AmpMaskView>
      </TouchableWithoutFeedback>
      <Text
        style={[
          styles.sectionDescription,
          {
            color: isDarkMode ? Colors.light : Colors.dark,
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

type HomeScreenNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  'Home'
>;
type ViewGalleryScreenNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  'ViewGallery'
>;
type WebViewScreenNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  'WebView'
>;
type FabricMaskScreenNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  'FabricMask'
>;
type MaskReproScreenNavigationProps = NativeStackScreenProps<
  RootStackParamList,
  'MaskRepro'
>;

/** Frame colors around each comparison cell (the frame is on the cell, never on the mask wrapper). */
const maskOutline = {
  neutral: {
    borderWidth: 2,
    borderColor: '#9ca3af',
    borderStyle: 'dashed' as const,
  },
  masked: {
    borderWidth: 2,
    borderColor: '#22c55e',
    borderStyle: 'dashed' as const,
  },
  unmasked: {
    borderWidth: 2,
    borderColor: '#ef4444',
    borderStyle: 'dashed' as const,
  },
  sr: {
    borderWidth: 2,
    borderColor: '#3b82f6',
    borderStyle: 'dashed' as const,
  },
};

type Measure = { w: number; h: number; x: number; y: number };

const toMeasure = (event: LayoutChangeEvent): Measure => {
  const { width, height, x, y } = event.nativeEvent.layout;
  return {
    w: Math.round(width * 10) / 10,
    h: Math.round(height * 10) / 10,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
  };
};

const logLayout =
  (name: string, onMeasure?: (m: Measure) => void) =>
  (event: LayoutChangeEvent) => {
    const m = toMeasure(event);
    onMeasure?.(m);
    console.log(`[mask-repro] ${name} -> w=${m.w} h=${m.h} x=${m.x} y=${m.y}`);
  };

/**
 * Card with a space-between row, a right-aligned amount, and an absolutely
 * positioned badge. These are the properties most likely to shift if a wrapper
 * introduces a native layout boundary.
 */
function TestCard({
  tag,
  onMeasure,
}: {
  tag: string;
  onMeasure?: (m: Measure) => void;
}) {
  return (
    <View style={styles.card} onLayout={logLayout(`${tag}:card`, onMeasure)}>
      <View style={styles.cardRow}>
        <Text style={styles.cardTitle}>Account balance</Text>
        <Text style={styles.cardAmount}>$1,234.56</Text>
      </View>
      <View style={styles.cardBadge}>
        <Text style={styles.cardBadgeText}>NEW</Text>
      </View>
    </View>
  );
}

const fmt = (m: Measure | null) => (m ? `${m.w}×${m.h}` : '…');

type WrapKind = 'none' | 'view' | 'mask' | 'unmask' | 'sr';

const WRAPS: { kind: WrapKind; label: string; frame: keyof typeof maskOutline }[] =
  [
    { kind: 'none', label: '1. baseline (no wrapper)', frame: 'neutral' },
    { kind: 'view', label: '2. plain <View>', frame: 'neutral' },
    { kind: 'mask', label: '3. <AmpMaskView mask>', frame: 'masked' },
    { kind: 'unmask', label: '4. <AmpMaskView unmask>', frame: 'unmasked' },
    { kind: 'sr', label: '5. <SRMaskView> (native only)', frame: 'sr' },
  ];

/** Applies one of the five wrappers around identical content. */
function Wrap({
  kind,
  children,
}: {
  kind: WrapKind;
  children: React.ReactNode;
}) {
  switch (kind) {
    case 'view':
      return <View>{children}</View>;
    case 'mask':
      return <AmpMaskView mask="amp-mask">{children}</AmpMaskView>;
    case 'unmask':
      return <AmpMaskView mask="amp-unmask">{children}</AmpMaskView>;
    case 'sr':
      // No JS display override — layout transparency must come from the native
      // SRMaskViewContentsShadowNode (display:contents), not Yoga via style.
      return <SRMaskView enabled>{children}</SRMaskView>;
    case 'none':
    default:
      return <>{children}</>;
  }
}

/**
 * One row of a scenario: the same content under one wrapper, in an identical
 * slot. Measures the content and prints w×h on-screen, so screenshots are
 * self-contained. The colored frame is on the slot, never on the mask wrapper.
 */
function MatrixRow({
  label,
  frame,
  slotStyle,
  renderContent,
}: {
  label: string;
  frame: keyof typeof maskOutline;
  slotStyle?: object;
  renderContent: (onMeasure: (m: Measure) => void) => React.ReactNode;
}) {
  const [m, setM] = useState<Measure | null>(null);
  const wrap = WRAPS.find((w) => w.label === label);
  return (
    <View style={styles.matrixRow}>
      <Text style={styles.matrixLabel}>
        {label} <Text style={styles.matrixReadout}>content {fmt(m)}</Text>
      </Text>
      <View style={[styles.matrixSlot, slotStyle, maskOutline[frame]]}>
        <Wrap kind={wrap?.kind ?? 'none'}>{renderContent(setM)}</Wrap>
      </View>
    </View>
  );
}

/** Renders the same content under all five wrappers, for an apples-to-apples comparison. */
function Scenario({
  title,
  hint,
  slotStyle,
  renderContent,
}: {
  title: string;
  hint: string;
  slotStyle?: object;
  renderContent: (onMeasure: (m: Measure) => void) => React.ReactNode;
}) {
  return (
    <View style={styles.scenario}>
      <Text style={styles.groupHeading}>{title}</Text>
      <Text style={styles.reproHint}>{hint}</Text>
      {WRAPS.map((w) => (
        <MatrixRow
          key={w.kind}
          label={w.label}
          frame={w.frame}
          slotStyle={slotStyle}
          renderContent={renderContent}
        />
      ))}
    </View>
  );
}

/**
 * Repro for the customer masking-layout report: does <AmpMaskView> introduce a
 * native layout boundary that shifts children vs no wrapper / a plain <View> /
 * the native display:contents <SRMaskView>? Each scenario renders identical content
 * under all five wrappers. onLayout values are logged under [mask-repro].
 */
function MaskReproScreen(_props: MaskReproScreenNavigationProps) {
  return (
    <SafeAreaView style={styles.reproScreen}>
      <ScrollView contentContainerStyle={styles.reproScroll}>
        <Text style={styles.reproTitle}>AmpMaskView layout repro</Text>
        <Text style={styles.reproHint}>
          Frame color = wrapper: gray = none/plain View, green = AmpMask mask,
          red = AmpMask unmask, blue = SRMaskView. &quot;content w×h&quot; is the
          measured size of the wrapped child.
        </Text>

        <Scenario
          title="A. width:100% card (definite size — control)"
          hint="The child already has a definite width, so every wrapper should look the same. This is the customer's TestCard."
          renderContent={(onMeasure) => (
            <TestCard tag="card" onMeasure={onMeasure} />
          )}
        />

        <Scenario
          title="B. flex:1 child in a 120px-tall slot"
          hint="The child's height depends on the parent. A wrapper with no height makes flex:1 collapse to 0. Watch the green box disappear."
          slotStyle={styles.slotFixedTall}
          renderContent={(onMeasure) => (
            <View
              style={styles.flexChild}
              onLayout={logLayout('flex', onMeasure)}
            >
              <Text style={styles.flexChildText}>flex:1 fills height</Text>
            </View>
          )}
        />

        <Scenario
          title="C. position:absolute top/right child"
          hint="The child is positioned against its containing block. A wrapper becomes a new containing block, so the badge moves off the top-right corner."
          slotStyle={styles.slotAbs}
          renderContent={(onMeasure) => (
            <View style={styles.absChildTR} onLayout={logLayout('abs', onMeasure)}>
              <Text style={styles.absBadge}>ABS</Text>
            </View>
          )}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeScreen({ navigation }: HomeScreenNavigationProps) {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={backgroundStyle}
      >
        <Header />
        <View
          style={{
            backgroundColor: isDarkMode ? Colors.black : Colors.white,
          }}
        >
          <Section title="AmpMaskView layout repro">
            <Button
              title="Open Mask Layout Repro"
              onPress={() => navigation.navigate('MaskRepro')}
            />
          </Section>
          <Section title="Fabric SRMaskView">
            <Button
              title="Open Fabric Mask Demo"
              onPress={() => navigation.navigate('FabricMask')}
            />
          </Section>
          <Section title="View Gallery">
            <Button
              title="Go to Details"
              onPress={() => navigation.navigate('ViewGallery')}
            />
          </Section>
          <Section title="Go to web view">
            <Button
              title="Go to Web View"
              onPress={() => navigation.navigate('WebView')}
            />
          </Section>
          <Section title="Session Replay Controls">
            <Button
              title="Start Recording"
              onPress={async () => {
                if (sessionReplayPlugin) {
                  await sessionReplayPlugin.start();
                  track('session-replay-started');
                  console.log('Session replay recording started');
                }
              }}
            />
            <Button
              title="Stop Recording"
              onPress={async () => {
                if (sessionReplayPlugin) {
                  await sessionReplayPlugin.stop();
                  track('session-replay-stopped');
                  console.log('Session replay recording stopped');
                }
              }}
            />
          </Section>
          <Section title="Step One">
            Edit <Text style={styles.highlight}>App.tsx</Text> to change this
            screen and then come back to see your edits.
          </Section>
          <Section title="See Your Changes">
            <ReloadInstructions />
          </Section>
          <Section title="Debug">
            <DebugInstructions />
          </Section>
          <Section title="Learn More">
            Read the docs to discover what to do next:
          </Section>
          <LearnMoreLinks />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const FabricMaskScreen = (_props: FabricMaskScreenNavigationProps) => {
  const isDarkMode = useColorScheme() === 'dark';
  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
    flex: 1,
  };

  return (
    <SafeAreaView style={backgroundStyle}>
      <SRMaskView enabled style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: isDarkMode ? Colors.black : Colors.white,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 18, color: isDarkMode ? Colors.white : Colors.black }}>
            flex:1 child inside SRMaskView (Fabric)
          </Text>
        </View>
      </SRMaskView>
    </SafeAreaView>
  );
};

const ViewGalleryScreen = ({
  navigation,
}: ViewGalleryScreenNavigationProps) => {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={backgroundStyle}
    >
      <View
        style={{
          backgroundColor: isDarkMode ? Colors.black : Colors.white,
        }}
      >
        <Text>Text View</Text>
        <Image
          source={{
            uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADMAAAAzCAYAAAA6oTAqAAAAEXRFWHRTb2Z0d2FyZQBwbmdjcnVzaEB1SfMAAABQSURBVGje7dSxCQBACARB+2/ab8BEeQNhFi6WSYzYLYudDQYGBgYGBgYGBgYGBgYGBgZmcvDqYGBgmhivGQYGBgYGBgYGBgYGBgYGBgbmQw+P/eMrC5UTVAAAAABJRU5ErkJggg==',
          }}
          style={styles.image}
        />
        <Button
          title="Button View (Go to Home)"
          onPress={() => navigation.navigate('Home')}
        />
        <ImageBackground
          source={{
            uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADMAAAAzCAYAAAA6oTAqAAAAEXRFWHRTb2Z0d2FyZQBwbmdjcnVzaEB1SfMAAABQSURBVGje7dSxCQBACARB+2/ab8BEeQNhFi6WSYzYLYudDQYGBgYGBgYGBgYGBgYGBgZmcvDqYGBgmhivGQYGBgYGBgYGBgYGBgYGBgbmQw+P/eMrC5UTVAAAAABJRU5ErkJggg==',
          }}
          resizeMode="cover"
          style={styles.imageBackground}
        >
          <Text style={styles.imageBackgroundText}>ImageBackground</Text>
        </ImageBackground>
        <SwitchExample />
        <TextInputExample />
      </View>
    </ScrollView>
  );
};

const WebViewScreen = () => {
  return (
    <AmpMaskView mask="amp-unmask" style={{ flex: 1 }}>
      <WebView source={{ uri: 'https://reactnative.dev/' }} style={{ flex: 1 }} />
    </AmpMaskView>
  );
};

const SwitchExample = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const toggleSwitch = () => setIsEnabled((previousState) => !previousState);

  return (
    <Switch
      trackColor={{ false: '#767577', true: '#81b0ff' }}
      thumbColor={isEnabled ? '#f5dd4b' : '#f4f3f4'}
      ios_backgroundColor="#3e3e3e"
      onValueChange={toggleSwitch}
      value={isEnabled}
    />
  );
};

const TextInputExample = () => {
  const [text, onChangeText] = React.useState('Useless Text');
  const [number, onChangeNumber] = React.useState('');

  return (
    <SafeAreaView>
      <TextInput
        style={styles.input}
        onChangeText={onChangeText}
        value={text}
      />
      <TextInput
        style={styles.input}
        onChangeText={onChangeNumber}
        value={number}
        placeholder="useless placeholder"
        keyboardType="numeric"
      />
    </SafeAreaView>
  );
};

type RootStackParamList = {
  Home: undefined;
  ViewGallery: undefined;
  WebView: undefined;
  FabricMask: undefined;
  MaskRepro: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function App(): React.JSX.Element {
  useEffect(() => {
    const config: SessionReplayPluginConfig = {
      enableRemoteConfig: false,
      sampleRate: 1,
      logLevel: LogLevel.Debug,
    };
    (async () => {
      await init('YOUR_AMPLITUDE_API_KEY', 'example_user_id', {
        deviceId: 'example_device_id',
        logLevel: LogLevel.Verbose,
        flushIntervalMillis: 1000,
      }).promise;
      sessionReplayPlugin = new SessionReplayPlugin(config);
      await add(sessionReplayPlugin).promise;
      track('test');
      await identify(new Identify().set('react-native-test', 'yes')).promise;
    })();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Welcome' }}
        />
        <Stack.Screen
          name="MaskRepro"
          options={{ title: 'Mask Layout Repro' }}
          component={MaskReproScreen}
        />
        <Stack.Screen
          name="FabricMask"
          options={{ title: 'Fabric SRMaskView' }}
          component={FabricMaskScreen}
        />
        <Stack.Screen
          name="ViewGallery"
          options={{ title: 'View Gallery' }}
          component={ViewGalleryScreen}
        />
        <Stack.Screen
          name="WebView"
          options={{ title: 'Web View' }}
          component={WebViewScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  highlight: {
    fontWeight: '700',
  },
  image: {
    flex: 1,
    height: 200,
    justifyContent: 'center',
  },
  imageBackground: {
    flex: 1,
    height: 200,
    justifyContent: 'center',
  },
  imageBackgroundText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  input: {
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
  },
  reproScreen: {
    flex: 1,
    backgroundColor: '#eef0f3',
  },
  reproScroll: {
    padding: 16,
    paddingBottom: 48,
  },
  reproTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    color: '#111',
  },
  reproHint: {
    fontSize: 13,
    color: '#555',
    marginBottom: 12,
    lineHeight: 18,
  },
  groupHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginTop: 20,
    marginBottom: 8,
  },
  scenario: {
    marginBottom: 8,
  },
  matrixRow: {
    marginBottom: 10,
  },
  matrixLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '600',
  },
  matrixReadout: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '400',
  },
  matrixSlot: {
    borderRadius: 8,
    padding: 4,
    backgroundColor: '#e5e7eb',
  },
  slotFixedTall: {
    height: 120,
  },
  slotAbs: {
    height: 80,
    justifyContent: 'center',
    position: 'relative',
  },
  // TestCard (per customer spec): % width, space-between row, absolute badge.
  card: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  cardAmount: {
    fontSize: 20,
    fontWeight: '600',
  },
  cardBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  // absolute child inside relative parent
  absChildTR: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  absBadge: {
    backgroundColor: '#f59e0b',
    color: '#1f2937',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  // flex:1 child should fill the fixed-height slot
  flexChild: {
    flex: 1,
    backgroundColor: '#dcfce7',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flexChildText: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '600',
  },
});

export default App;
