import { PACKAGE_NAME, PACKAGE_VERSION } from '../src';

describe('@amplitude/element-selector — scaffolding smoke test', () => {
  it('exports the package name', () => {
    expect(PACKAGE_NAME).toBe('@amplitude/element-selector');
  });

  it('exports the package version', () => {
    expect(PACKAGE_VERSION).toBe('0.1.0');
  });
});
