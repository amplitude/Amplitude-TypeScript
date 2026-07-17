// Use the manual mock from the __mocks__ directory; the codegen deep path is
// mapped in jest.config.js moduleNameMapper.
jest.mock('react-native');

import React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { AmpMaskView } from '../src/amp-mask-view';
import type { AmpMaskViewProps } from '../src/amp-mask-view';

// Shape of the props AmpMaskView forwards onto the native element.
interface NativeElementProps {
  mask: string;
  testID?: string;
  children?: ReactNode;
}

function render(props: AmpMaskViewProps): ReactElement<NativeElementProps> {
  return React.createElement(AmpMaskView, props) as ReactElement<NativeElementProps>;
}

describe('AmpMaskView', () => {
  it('renders the AMPMaskComponentView codegen component directly', () => {
    const element = render({ mask: 'amp-mask' });
    expect(element.type).toBe('AMPMaskComponentView');
  });

  it.each(['amp-mask', 'amp-unmask', 'amp-block'] as const)('passes mask=%s through', (mask) => {
    const element = render({ mask });
    expect(element.props.mask).toBe(mask);
  });

  it('forwards standard view props and children', () => {
    const child = React.createElement('Text', { key: 'c' }, 'secret');
    const element = render({ mask: 'amp-block', testID: 'masked-region', children: child });
    expect(element.props.testID).toBe('masked-region');
    expect(element.props.children).toBe(child);
  });
});
