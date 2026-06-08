/**
 * @format
 */

// Mock the SDK before importing App so its module-scope init (issue #181 reproduce
// pattern) doesn't actually load the SDK's native dependencies in the jest env.
// The Maestro smoke test exercises real SDK init; this jest test only verifies
// that App renders without throwing.
//
// `virtual: true` so the mock resolves even when the SDK isn't built: nx pulls
// this example into `affected --target=test` whenever its files change, but the
// SDK (a workspace dep with no build step on this app) may be unbuilt in that
// run, so its `main` (lib/) wouldn't exist for jest to resolve.
jest.mock(
  '@amplitude/analytics-react-native',
  () => ({
    init: jest.fn(),
    track: jest.fn(() => ({promise: Promise.resolve({message: 'mocked'})})),
    identify: jest.fn(() => ({promise: Promise.resolve({message: 'mocked'})})),
    Identify: jest
      .fn()
      .mockImplementation(() => ({set: jest.fn().mockReturnThis()})),
  }),
  {virtual: true},
);

import 'react-native';
import React from 'react';
import App from '../App';

// Note: import explicitly to use the types shipped with jest.
import {it} from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

it('renders correctly', () => {
  renderer.create(<App />);
});
