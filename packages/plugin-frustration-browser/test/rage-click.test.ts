import { init, registerClick } from '../src/rage-click';

describe('rage-click', () => {
  let mockOnRageClick: jest.Mock;
  let mockElement: HTMLElement;
  let mockEvent: MouseEvent;

  beforeEach(() => {
    jest.useFakeTimers();
    mockOnRageClick = jest.fn();
    mockElement = document.createElement('button');
    mockEvent = {
      clientX: 100,
      clientY: 200,
    } as MouseEvent;

    // Mock performance object
    global.performance = {
      now: () => Date.now(),
      timeOrigin: 1000,
    } as unknown as Performance;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should trigger a rage click event when the threshold is reached', () => {
    const mockOnRageClick = jest.fn();
    init({
      timeout: 1000,
      threshold: 3,
      ignoreSelector: '#ignore',
      onRageClick: mockOnRageClick,
    });

    // Register clicks up to threshold
    for (let i = 0; i < 3; i++) {
      registerClick(mockElement, mockEvent);
    }

    expect(mockOnRageClick.mock.calls.length).toBe(1);
  });

  it('should not trigger rage click below threshold', () => {
    init({
      timeout: 3000,
      threshold: 3,
      ignoreSelector: '#ignore',
      onRageClick: mockOnRageClick,
    });

    // Register clicks below threshold
    for (let i = 0; i < 2; i++) {
      registerClick(mockElement, mockEvent);
    }

    expect(mockOnRageClick).not.toHaveBeenCalled();
  });

  it('should ignore clicks on elements matching ignoreSelector', () => {
    init({
      timeout: 3000,
      threshold: 3,
      ignoreSelector: '#ignore',
      onRageClick: mockOnRageClick,
    });

    const ignoredElement = document.createElement('button');
    ignoredElement.id = 'ignore';

    // Register clicks on ignored element
    for (let i = 0; i < 3; i++) {
      registerClick(ignoredElement, mockEvent);
    }

    expect(mockOnRageClick).not.toHaveBeenCalled();
  });

  it('should clear click events after timeout', () => {
    init({
      timeout: 3000,
      threshold: 3,
      ignoreSelector: '#ignore',
      onRageClick: mockOnRageClick,
    });

    // Register one click
    registerClick(mockElement, mockEvent);

    // Fast forward past timeout
    jest.advanceTimersByTime(3000);

    // Register more clicks
    for (let i = 0; i < 3; i++) {
      registerClick(mockElement, mockEvent);
    }

    expect(mockOnRageClick).toHaveBeenCalledTimes(1);
  });

  it('should not trigger a rage click event if the element is not a clickable element', () => {
    init({
      timeout: 3000,
      threshold: 3,
      ignoreSelector: '#ignore',
      onRageClick: mockOnRageClick,
    });

    const nonClickableElement = document.createElement('div');
    registerClick(nonClickableElement, mockEvent);

    expect(mockOnRageClick).not.toHaveBeenCalled();
  });
});
