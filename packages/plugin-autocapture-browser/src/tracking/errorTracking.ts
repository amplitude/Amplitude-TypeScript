import { merge, timer, Observable } from 'rxjs';
import { buffer, filter, map, switchMap } from 'rxjs/operators';

export function trackErrors({
  clickObservable,
  keypressObservable,
  errorObservable,
}: {
  clickObservable: Observable<MouseEvent>;
  keypressObservable: Observable<KeyboardEvent>;
  errorObservable: Observable<ErrorEvent>;
}) {
  // Combine click and keypress events
  const userActionObservable = merge(clickObservable, keypressObservable);

  // Create an Observable that emits after 500ms of each user action
  const timeWindowObservable = userActionObservable.pipe(switchMap(() => timer(500)));

  // Buffer errors that occur within 500ms after any user action
  const bufferedErrors = errorObservable.pipe(
    buffer(timeWindowObservable),
    filter((errors) => errors.length > 0),
    map((errors) => ({
      errors,
      timestamp: Date.now(),
    })),
  );

  // Subscribe to the buffered errors and log them
  bufferedErrors.subscribe({
    next({ errors, timestamp }) {
      console.log(`Errors occurred within 500ms after a user action at ${new Date(timestamp)}:`);
      errors.forEach((error, index) => {
        console.log(`Error ${index + 1}:`, error.message);
      });
    },
    error(err) {
      console.error('Error in buffered errors subscription:', err);
    },
  });
}
