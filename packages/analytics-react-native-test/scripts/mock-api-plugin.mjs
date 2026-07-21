/**
 * Harness plugin: start the mock API on the host before the run, stop after.
 */
import { definePlugin } from '@react-native-harness/plugins';
import { startMockApiServer, stopMockApiServer } from './mock-api-server.mjs';

export const mockApiPlugin = () =>
  definePlugin({
    name: 'mock-api',
    hooks: {
      harness: {
        beforeRun: async (ctx) => {
          await startMockApiServer({ logger: ctx.logger });
        },
        afterRun: async (ctx) => {
          await stopMockApiServer({ logger: ctx.logger });
        },
        beforeDispose: async (ctx) => {
          await stopMockApiServer({ logger: ctx.logger });
        },
      },
    },
  });
