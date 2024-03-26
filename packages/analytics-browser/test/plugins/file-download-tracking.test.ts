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

  test('should not track file_download event if window load event was not triggered', async () => {
    // setup
    document.getElementById('my-link-id')?.setAttribute('href', 'https://analytics.amplitude.com/files/my-file.pdf');
    const config = createConfigurationMock();
    const plugin = fileDownloadTracking();
    await plugin.setup?.(config, amplitude);

    // trigger click event
    document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

    // assert file download event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(0);
  });

  test('should track file_download event', async () => {
    // setup
    document.getElementById('my-link-id')?.setAttribute('href', 'https://analytics.amplitude.com/files/my-file.pdf');
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
      [LINK_URL]: 'https://analytics.amplitude.com/files/my-file.pdf',
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

  test('should not track file_download event', async () => {
    // setup
    document.getElementById('my-link-id')?.setAttribute('href', 'https://analytics.amplitude.com/files/my-file.png');
    const config = createConfigurationMock();
    const plugin = fileDownloadTracking();
    await plugin.setup?.(config, amplitude);
    window.dispatchEvent(new Event('load'));

    // trigger change event
    document.getElementById('my-link-id')?.dispatchEvent(new Event('click'));

    // assert file download event was not tracked
    expect(amplitude.track).toHaveBeenCalledTimes(0);
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
