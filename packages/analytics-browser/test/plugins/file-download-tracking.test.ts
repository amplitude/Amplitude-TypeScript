/* eslint-disable @typescript-eslint/unbound-method */

import { createAmplitudeMock, createConfigurationMock } from '../helpers/mock';
import { fileDownloadTracking } from '../../src/plugins/file-download-tracking';
import { FILE_EXTENSION, FILE_NAME, LINK_ID, LINK_TEXT, LINK_URL } from '../../src/constants';

describe('fileDownloadTracking', () => {
  let amplitude = createAmplitudeMock();

  beforeEach(() => {
    amplitude = createAmplitudeMock();

    const link = document.createElement('a');
    link.setAttribute('id', 'my-link-id');
    link.setAttribute('class', 'my-link-class');
    link.text = 'my-link-text';

    document.body.appendChild(link);
  });

  afterEach(() => {
    document.querySelector('a#my-link-id')?.remove();
  });

  test.each([
    'https://analytics.amplitude.com/files/my-file.pdf',
    'https://analytics.amplitude.com/files/my-file.pdf?foo=bar',
  ])('should track file_download event', async (value) => {
    // setup
    document.getElementById('my-link-id')?.setAttribute('href', value);
    const config = createConfigurationMock();
    const plugin = fileDownloadTracking();
    await plugin.setup?.(config, amplitude);
    window.dispatchEvent(new Event('load'));

    // trigger click event
    document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

    // assert file download event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] File Downloaded', {
      [FILE_EXTENSION]: 'pdf',
      [FILE_NAME]: '/files/my-file.pdf',
      [LINK_ID]: 'my-link-id',
      [LINK_TEXT]: 'my-link-text',
      [LINK_URL]: value,
    });

    // stop observer and listeners
    await plugin.teardown?.();

    // trigger click event
    document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

    // assert no additional event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
  });

  test('should track file_download event for a dynamically added achor tag', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = fileDownloadTracking();
    await plugin.setup?.(config, amplitude);
    window.dispatchEvent(new Event('load'));

    // add anchor element dynamically
    const link = document.createElement('a');
    link.setAttribute('id', 'my-link-2-id');
    link.setAttribute('class', 'my-link-2-class');
    link.setAttribute('href', 'https://analytics.amplitude.com/files/my-file-2.pdf');
    link.text = 'my-link-2-text';
    document.body.appendChild(link);

    // allow mutation observer to execute and event listener to be attached
    await new Promise((r) => r(undefined)); // basically, await next clock tick
    // trigger change event
    link.dispatchEvent(new Event('click'));

    // assert file download event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] File Downloaded', {
      [FILE_EXTENSION]: 'pdf',
      [FILE_NAME]: '/files/my-file-2.pdf',
      [LINK_ID]: 'my-link-2-id',
      [LINK_TEXT]: 'my-link-2-text',
      [LINK_URL]: 'https://analytics.amplitude.com/files/my-file-2.pdf',
    });

    // stop observer and listeners
    await plugin.teardown?.();

    // add anchor element dynamically
    const link3 = document.createElement('a');
    link3.setAttribute('id', 'my-link-3-id');
    link3.setAttribute('class', 'my-link-3-class');
    link3.setAttribute('href', 'https://analytics.amplitude.com/files/my-file-3.pdf');
    link3.text = 'my-link-3-text';
    document.body.appendChild(link3);

    // allow mutation observer to execute and event listener to be attached
    await new Promise((r) => r(undefined)); // basically, await next clock tick
    // trigger change event
    link.dispatchEvent(new Event('click'));

    // assert no additional file download event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
  });

  test('should track file_download event for a dynamically added nested achor tag', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = fileDownloadTracking();
    await plugin.setup?.(config, amplitude);
    window.dispatchEvent(new Event('load'));

    // add anchor element dynamically
    const link = document.createElement('a');
    link.setAttribute('id', 'my-link-2-id');
    link.setAttribute('class', 'my-link-2-class');
    link.setAttribute('href', 'https://analytics.amplitude.com/files/my-file-2.pdf');
    link.text = 'my-link-2-text';

    // add parent element
    const div = document.createElement('div');

    div.appendChild(link);
    document.body.appendChild(div);

    // allow mutation observer to execute and event listener to be attached
    await new Promise((r) => r(undefined)); // basically, await next clock tick
    // trigger change event
    link.dispatchEvent(new Event('click'));

    // assert file download event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] File Downloaded', {
      [FILE_EXTENSION]: 'pdf',
      [FILE_NAME]: '/files/my-file-2.pdf',
      [LINK_ID]: 'my-link-2-id',
      [LINK_TEXT]: 'my-link-2-text',
      [LINK_URL]: 'https://analytics.amplitude.com/files/my-file-2.pdf',
    });
  });

  describe('malformed added nodes', () => {
    const createLinkInWrapper = (id: string) => {
      const link = document.createElement('a');
      link.setAttribute('id', id);
      link.setAttribute('href', `https://analytics.amplitude.com/files/${id}.pdf`);
      link.text = `${id}-text`;

      const wrapper = document.createElement('div');
      wrapper.appendChild(link);

      return { link, wrapper };
    };

    const expectedEventProperties = (id: string) => ({
      [FILE_EXTENSION]: 'pdf',
      [FILE_NAME]: `/files/${id}.pdf`,
      [LINK_ID]: id,
      [LINK_TEXT]: `${id}-text`,
      [LINK_URL]: `https://analytics.amplitude.com/files/${id}.pdf`,
    });

    test('should track links added after a node whose querySelectorAll returns a nullish value', async () => {
      // setup
      const config = createConfigurationMock();
      const plugin = fileDownloadTracking();
      await plugin.setup?.(config, amplitude);
      window.dispatchEvent(new Event('load'));

      const early = createLinkInWrapper('early-link-id');
      const late = createLinkInWrapper('late-link-id');

      // simulate an environment that patches querySelectorAll to return a nullish value
      const poisoned = document.createElement('div');
      Object.defineProperty(poisoned, 'querySelectorAll', {
        value: () => undefined,
        configurable: true,
      });

      // append all three in a single mutation batch, with the poisoned node between the two links
      document.body.append(early.wrapper, poisoned, late.wrapper);

      // allow mutation observer to execute and event listeners to be attached
      await new Promise((r) => r(undefined)); // basically, await next clock tick
      early.link.dispatchEvent(new Event('click'));
      late.link.dispatchEvent(new Event('click'));

      // assert the link appended after the poisoned node was still registered
      expect(amplitude.track).toHaveBeenCalledTimes(2);
      expect(amplitude.track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] File Downloaded',
        expectedEventProperties('early-link-id'),
      );
      expect(amplitude.track).toHaveBeenNthCalledWith(
        2,
        '[Amplitude] File Downloaded',
        expectedEventProperties('late-link-id'),
      );

      await plugin.teardown?.();
      [early.wrapper, poisoned, late.wrapper].forEach((node) => node.remove());
    });

    test('should log a warning and track links added after a node whose querySelectorAll throws', async () => {
      // setup
      const config = createConfigurationMock();
      const warnSpy = jest.spyOn(config.loggerProvider, 'warn');
      const plugin = fileDownloadTracking();
      await plugin.setup?.(config, amplitude);
      window.dispatchEvent(new Event('load'));

      const late = createLinkInWrapper('late-link-id');

      const throwing = document.createElement('div');
      Object.defineProperty(throwing, 'querySelectorAll', {
        value: () => {
          throw new TypeError('querySelectorAll is not available');
        },
        configurable: true,
      });

      // append both in a single mutation batch, with the throwing node first
      document.body.append(throwing, late.wrapper);

      // allow mutation observer to execute and event listeners to be attached
      await new Promise((r) => r(undefined)); // basically, await next clock tick
      late.link.dispatchEvent(new Event('click'));

      // assert the failure was logged rather than escaping the observer callback
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to track file downloads for an added node'));

      // assert the link appended after the throwing node was still registered
      expect(amplitude.track).toHaveBeenCalledTimes(1);
      expect(amplitude.track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] File Downloaded',
        expectedEventProperties('late-link-id'),
      );

      await plugin.teardown?.();
      [throwing, late.wrapper].forEach((node) => node.remove());
    });
  });

  test('should track file download event when the plugin is added after window load', async () => {
    // setup
    document.getElementById('my-link-id')?.setAttribute('href', 'https://analytics.amplitude.com/files/my-file.pdf');
    const config = createConfigurationMock();
    const plugin = fileDownloadTracking();
    await plugin.setup?.(config, amplitude);

    // trigger change event
    document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
  });

  test('should track form_start event when the plugin is added before window load', async () => {
    const originalReadyState = document.readyState;
    Object.defineProperty(document, 'readyState', {
      value: 'loading',
      writable: true,
      configurable: true,
    });

    // setup
    document.getElementById('my-link-id')?.setAttribute('href', 'https://analytics.amplitude.com/files/my-file.pdf');
    const config = createConfigurationMock();
    const plugin = fileDownloadTracking();
    await plugin.setup?.(config, amplitude);

    // trigger change event
    window.dispatchEvent(new Event('load'));
    document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);

    // Restore the original value after each test
    Object.defineProperty(document, 'readyState', {
      value: originalReadyState,
      writable: true,
    });
  });

  test('should not enrich events', async () => {
    const input = {
      event_type: 'page_view',
    };
    const plugin = fileDownloadTracking();
    const result = await plugin.execute?.(input);
    expect(result).toEqual(input);
  });

  // eslint-disable-next-line jest/expect-expect
  test('should teardown plugin', async () => {
    const plugin = fileDownloadTracking();
    await plugin.teardown?.();
    // no explicit assertion
    // test asserts that no error is thrown
  });
});
