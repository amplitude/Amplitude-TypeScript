import { Destination } from '../../src/plugins/destination';
import { BrowserConfig, useBrowserConfig } from '../../src/config';
import * as core from '@amplitude/analytics-core';
import { AmplitudeBrowser } from '../../src/browser-client';

describe('destination', () => {
  const apiKey = core.UUID();
  const someDiagnosticProvider: core.Diagnostic = expect.any(core.Diagnostic) as core.Diagnostic;

  describe('setup', () => {
    test('should setup plugin', async () => {
      const destination = new Destination();
      const config = (await useBrowserConfig(apiKey, undefined, new AmplitudeBrowser())) as BrowserConfig;
      await destination.setup(config);
      expect(destination.config.diagnosticProvider).toEqual(someDiagnosticProvider);
    });
  });

  describe('fulfillRequest', () => {
    test('should track diagnostics', async () => {
      const destination = new Destination();
      const mockDiagnosticProvider = {
        type: 'destination' as const,
        execute: jest.fn(),
        flush: jest.fn(),
        track: jest.fn(),
      };
      const config = (await useBrowserConfig(apiKey, undefined, new AmplitudeBrowser())) as BrowserConfig;
      config.diagnosticProvider = mockDiagnosticProvider;
      destination.config = config;
      const callback = jest.fn();
      const context = {
        attempts: 0,
        callback,
        event: {
          event_type: 'event_type',
        },
        timeout: 0,
      };
      await destination.fulfillRequest([context], 200, 'success');
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(core.buildResult(context.event, 200, 'success'));
      expect(mockDiagnosticProvider.track).toHaveBeenCalledTimes(1);
    });
  });
});
