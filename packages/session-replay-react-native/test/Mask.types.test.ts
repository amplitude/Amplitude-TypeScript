import type { AmpMaskLevel, MaskProps, UnmaskProps } from '../src/Mask.types';

describe('Mask.types', () => {
  it('should export AmpMaskLevel type', () => {
    const level: AmpMaskLevel = 'block';
    expect(level).toBe('block');
  });

  it('should export MaskProps interface', () => {
    const props: MaskProps = {
      enabled: false,
      maskLevel: 'mask',
      children: null,
    };
    expect(props).toBeTruthy();
  });

  it('should export UnmaskProps interface', () => {
    const props: UnmaskProps = {
      children: null,
    };
    expect(props).toBeTruthy();
  });
});
