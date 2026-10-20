import { pageRecorder } from '../src/recorders/page';
import { recorderContext } from './page-feedback-helpers';

describe('page recorder', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.head.innerHTML = '<title>Overview</title>';
    document.body.innerHTML =
      '<main><h1>Overview</h1><button>A</button><button>B</button><button>C</button><button>D</button></main>';
    jest.spyOn(window.performance, 'now').mockReturnValue(0);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('waits for the first snapshot, checks at two seconds, and skips the healthy five second check', () => {
    const { context, emit, signal } = recorderContext();
    const cleanup = pageRecorder.setup(context);
    jest.advanceTimersByTime(10);
    expect(emit).not.toHaveBeenCalled();
    signal('snapshot', undefined);
    jest.advanceTimersByTime(1);
    expect(emit).toHaveBeenLastCalledWith(
      'page',
      expect.objectContaining({ nav: 'load', check: 'change', controls: 4, empty: false, loading: false }),
    );
    signal('snapshot', undefined);
    jest.advanceTimersByTime(2001);
    expect(emit).toHaveBeenLastCalledWith('page', expect.objectContaining({ check: '2s' }));
    jest.advanceTimersByTime(4000);
    expect(emit).toHaveBeenCalledTimes(2);
    cleanup();
  });

  test('rechecks loading and empty pages and cancels stale checks on navigation', () => {
    document.body.innerHTML = '<main><div class="spinner">Wait</div></main>';
    const { context, emit, signal } = recorderContext();
    const cleanup = pageRecorder.setup(context);
    signal('snapshot', undefined);
    jest.advanceTimersByTime(1000);
    signal('navigation', 'push');
    jest.advanceTimersByTime(5002);
    expect(emit.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ nav: 'load', check: 'change', loading: true, empty: true }),
      expect.objectContaining({ nav: 'push', check: 'change' }),
      expect.objectContaining({ nav: 'push', check: '2s' }),
      expect.objectContaining({ nav: 'push', check: '5s' }),
    ]);
    cleanup();
  });

  test('masks title and heading, observes replacement title, and disconnects on cleanup', async () => {
    document.querySelector('title')!.className = 'amp-mask';
    document.querySelector('h1')!.className = 'amp-mask';
    const { context, emit, signal } = recorderContext();
    const cleanup = pageRecorder.setup(context);
    signal('snapshot', undefined);
    jest.advanceTimersByTime(1);
    expect(emit).toHaveBeenLastCalledWith('page', expect.objectContaining({ title: null, heading: null }));
    document.head.innerHTML = '<title>Changed</title>';
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    expect(emit).toHaveBeenLastCalledWith('page', expect.objectContaining({ nav: 'title', title: 'Changed' }));
    cleanup();
    emit.mockClear();
    document.title = 'After cleanup';
    await Promise.resolve();
    jest.advanceTimersByTime(10000);
    expect(emit).not.toHaveBeenCalled();
  });

  test('caps controls, excludes blocked elements, and obeys the scan budget', () => {
    document.body.innerHTML =
      '<main>' + '<button>Go</button>'.repeat(220) + '</main><div class="amp-block"><button>Secret</button></div>';
    const { context, emit, signal } = recorderContext();
    const cleanup = pageRecorder.setup(context);
    signal('snapshot', undefined);
    jest.advanceTimersByTime(1);
    expect(emit).toHaveBeenLastCalledWith('page', expect.objectContaining({ controls: 200 }));
    jest.spyOn(window.performance, 'now').mockReturnValueOnce(0).mockReturnValue(9);
    signal('navigation', 'push');
    jest.advanceTimersByTime(1);
    expect(emit).toHaveBeenLastCalledWith('page', expect.objectContaining({ controls: 0 }));
    cleanup();
  });

  test('tracks standalone history and restores only its own patch', () => {
    const { context, emit, signal } = recorderContext();
    context.host.externalNavigation = false;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Compare and restore the exact function identity.
    const original = window.history.pushState;
    const cleanup = pageRecorder.setup(context);
    signal('snapshot', undefined);
    window.history.pushState({}, '', '/new-page');
    jest.advanceTimersByTime(1);
    expect(emit).toHaveBeenLastCalledWith('page', expect.objectContaining({ nav: 'push', url: '/new-page' }));
    cleanup();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Identity assertion, not an invocation.
    expect(window.history.pushState).toBe(original);
    window.history.replaceState({}, '', '/');
  });

  test('does not install work when disabled', () => {
    const { context, emit, signal } = recorderContext(['page']);
    const observer = jest.spyOn(window, 'MutationObserver');
    const cleanup = pageRecorder.setup(context);
    signal('snapshot', undefined);
    expect(observer).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    cleanup();
  });
});
