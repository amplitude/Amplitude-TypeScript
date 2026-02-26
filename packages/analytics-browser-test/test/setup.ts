import { TextEncoder } from 'util';

if (typeof global.TextEncoder === 'undefined') {
  (global as typeof global & { TextEncoder?: typeof TextEncoder }).TextEncoder = TextEncoder;
}
