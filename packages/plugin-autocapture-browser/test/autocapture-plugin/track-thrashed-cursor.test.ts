/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-empty-function */

import { Observable, Unsubscribable } from '@amplitude/analytics-core';
import { createMouseDirectionChangeObservable } from '../../src/autocapture/track-thrashed-cursor';
import { AllWindowObservables } from '../../src/frustration-plugin';
import { ObservablesEnum } from '../../src/autocapture-plugin';

describe('createMouseDirectionChangeObservable', () => {
  let mouseMoveObservable: any;
  let mouseMoveObserver: any;
  let allWindowObservables: AllWindowObservables;
  let directionChangeObservable: Observable<string>;
  let subscription: Unsubscribable | undefined;
  let subscriptionPromise: Promise<string>;

  beforeEach(() => {
    mouseMoveObservable = new Observable<any>((observer) => {
      mouseMoveObserver = observer;
    });

    allWindowObservables = {
      [ObservablesEnum.MouseMoveObservable]: mouseMoveObservable,
    } as AllWindowObservables;

    directionChangeObservable = createMouseDirectionChangeObservable({
      allWindowObservables,
    });

    subscriptionPromise = new Promise<string>((resolve) => {
      subscription = directionChangeObservable.subscribe((axis) => {
        resolve(axis);
      });
    });
  });

  afterEach(() => {
    subscription?.unsubscribe();
    jest.clearAllMocks();
  });

  it('should emit X direction change when mouse moves to the right', async () => {
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    mouseMoveObserver.next({ clientX: 2, clientY: 1 });
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    const axis = await subscriptionPromise;
    expect(axis).toEqual('x');
  });

  it('should emit X direction change when mouse moves to the left', async () => {
    mouseMoveObserver.next({ clientX: 2, clientY: 1 });
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    mouseMoveObserver.next({ clientX: 2, clientY: 1 });
    const axis = await subscriptionPromise;
    expect(axis).toEqual('x');
  });

  it('should emit Y direction change when mouse moves up', async () => {
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    mouseMoveObserver.next({ clientX: 1, clientY: 2 });
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    const axis = await subscriptionPromise;
    expect(axis).toEqual('y');
  });

  it('should emit Y direction change when mouse moves down', async () => {
    mouseMoveObserver.next({ clientX: 1, clientY: 2 });
    mouseMoveObserver.next({ clientX: 1, clientY: 1 });
    mouseMoveObserver.next({ clientX: 1, clientY: 2 });
    const axis = await subscriptionPromise;
    expect(axis).toEqual('y');
  });
});
