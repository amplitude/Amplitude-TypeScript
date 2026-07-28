// Mapped over react-native/Libraries/Utilities/codegenNativeComponent via
// jest.config.js moduleNameMapper: the deep RN submodule path bypasses the
// manual __mocks__/react-native.ts mock, and the real implementation needs a
// native view registry that does not exist under jsdom. Mirrors the top-level
// requireNativeComponent mock: the "component" is its native name string, so a
// rendered element's `type` equals the component name.
export default (name: string): string => name;
