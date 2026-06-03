import { PACKAGE_NAME } from '../src';

describe('@amplitude/element-selector — scaffolding smoke test', () => {
  it('exports the package name', () => {
    expect(PACKAGE_NAME).toBe('@amplitude/element-selector');
  });
});
