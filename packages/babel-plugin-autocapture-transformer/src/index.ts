import type { PluginObj, PluginPass } from '@babel/core';
import type { AutocaptureTransformerOptions } from './types';

export const PACKAGE_NAME = '@amplitude/babel-plugin-autocapture-transformer';
export const PLUGIN_NAME = PACKAGE_NAME;

export type { AutocaptureTransformerOptions };

export default function autocaptureTransformer(_options: AutocaptureTransformerOptions = {}): PluginObj<PluginPass> {
  return {
    name: PLUGIN_NAME,
    visitor: {},
  };
}
