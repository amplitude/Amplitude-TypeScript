/**
 * Local Metro entry for React Native Harness.
 * Must live inside this package: entryPoint paths outside projectRoot
 * collapse in Metro URLs (../../examples/... → /examples/...) and fail.
 *
 * Harness swaps this for its runtime entry; the native host binary is still
 * examples/react-native/app (bundleId org.reactjs.native.example.app).
 */
import { AppRegistry, View } from 'react-native';
import React from 'react';

const HarnessHost = () => React.createElement(View, null);

AppRegistry.registerComponent('app', () => HarnessHost);
