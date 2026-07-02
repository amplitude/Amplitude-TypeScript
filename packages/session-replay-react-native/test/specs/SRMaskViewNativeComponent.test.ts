// The spec imports the default export from the deep RN submodule path. The named
// `codegenNativeComponent` export on the manual react-native mock does NOT intercept
// this deep default import, so Jest would otherwise load the real RN implementation
// (which returns a Component, not the registered name). Mock the deep path directly.
jest.mock('react-native/Libraries/Utilities/codegenNativeComponent', () => ({
  __esModule: true,
  default: (name: string) => name,
}));

import SRMaskView from '../../src/specs/SRMaskViewNativeComponent';

it('registers the SRMaskView codegen component', () => {
  expect(SRMaskView).toBe('SRMaskView');
});
