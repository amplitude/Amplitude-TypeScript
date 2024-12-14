import { iife, umd } from '../../scripts/build/rollup.config';
import { webWorkerPlugins } from '../session-replay-browser/rollup.config';

iife.input = umd.input;
iife.output.name = 'sessionReplay';

export default async () => {
  const commonPlugins = await webWorkerPlugins();

  iife.plugins = [...commonPlugins, ...iife.plugins];
  umd.plugins = [...commonPlugins, ...umd.plugins];

  return [iife, umd];
};
