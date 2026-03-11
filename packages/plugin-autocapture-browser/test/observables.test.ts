import { Unsubscribable } from '@amplitude/analytics-core';
import { createMouseMoveObservable } from '../src/observables';

describe('createMouseMoveObservable', () => {
  it('should create a mouse move observable and capture mouse move events', async () => {
    const observable = createMouseMoveObservable();
    let subscription: Unsubscribable | undefined;
    const subscriptionPromise = new Promise<MouseEvent>((resolve) => {
      subscription = observable.subscribe((event) => {
        resolve(event);
      });
    });
    const mouseMoveEvent = new MouseEvent('mousemove', {
      clientX: 100,
      clientY: 100,
    });
    document.dispatchEvent(mouseMoveEvent);
    const event = await subscriptionPromise;
    expect(event.clientX).toBe(100);
    expect(event.clientY).toBe(100);
    subscription?.unsubscribe();
  });
});
