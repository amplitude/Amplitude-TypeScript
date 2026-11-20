import type { AuditItem } from './item';

export const AUDIT_FLAG = '__pii_audit_active__';

export type Msg =
  | { type: 'AUDIT_START'; tabId: number }
  | { type: 'AUDIT_STOP'; tabId: number }
  | { type: 'NETWORK_ITEMS'; items: AuditItem[] }
  | { type: 'DOM_ITEMS'; items: AuditItem[] }
  | { type: 'HIGHLIGHT'; itemId: string; selector: string }
  | { type: 'CLEAR_HIGHLIGHT' }
  | { type: 'CAPTURE_SHOT'; rect: DOMRectInit; itemId: string };

export const send = (msg: Msg) => chrome.runtime.sendMessage(msg);
