import AmpMaskViewNativeComponent from '../../src/specs/AmpMaskViewNativeComponent';

// With the codegenNativeComponent moduleNameMapper mock (jest.config.js), the
// spec's default export is the native component name.
it('registers the AMPMaskComponentView codegen component', () => {
  expect(AmpMaskViewNativeComponent).toBe('AMPMaskComponentView');
});
