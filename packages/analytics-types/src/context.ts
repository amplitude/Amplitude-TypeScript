import { Config } from './config';
import { Event } from './event';
import { Result } from './result';

export interface Context {
  event: Event;
  config: Config;
  resolve: (result: Result) => void;
}
