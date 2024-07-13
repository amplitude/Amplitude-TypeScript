import { Observable, timer, map } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import * as constants from '../constants';
import { ActionType } from 'src/typings/autocapture';
export function trackDeadClicks(
  {
    clickObservable,
    mutationObservable,
  }: {
    clickObservable: Observable<MouseEvent>;
    mutationObservable: Observable<MutationRecord[]>;
  },
  amplitude: any,
  getEventProperties: (actionType: ActionType, element: Element) => Record<string, any>,
) {
  // Track clicks not followed by mutations
  const clicksWithoutMutations = clickObservable.pipe(
    switchMap((click) =>
      timer(1500).pipe(
        takeUntil(mutationObservable),
        map(() => click),
      ),
    ),
  );

  clicksWithoutMutations.subscribe({
    next(click) {
      const target = click.target as Element;
      console.log(`No mutation detected within ${1500}ms after click at (${click}) }`);

      if (['A', 'BUTTON'].includes(String(target?.tagName))) {
        amplitude?.track(constants.AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT, getEventProperties('click', target));
      }
    },
  });
}
