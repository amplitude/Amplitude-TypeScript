export interface AuditItem {
  id: string;
  source: 'network' | 'autocapture' | 'dom';
  value: string;
  selector: string;
  rect?: DOMRectInit;
  context: Record<string, unknown>;
  pii?: { category: string; reason: string; tier: 'recommend' | 'worth-a-look' };
}
