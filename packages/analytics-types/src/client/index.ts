import { BaseClient } from './base-client';
import { BrowserClient, ReactNativeClient } from './web-client';
import { NodeClient } from './node-client';

type CreateInstance<T extends BaseClient> = () => T;
export type CreateBrowserInstance = CreateInstance<BrowserClient>;
export type CreateReactNativeInstance = CreateInstance<ReactNativeClient>;
export type CreateNodeInstance = CreateInstance<NodeClient>;
