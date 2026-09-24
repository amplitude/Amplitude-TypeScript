import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import type { AuditItem } from '../shared/item';
import { WorkerClassifier } from '../detect/classifier';
import { classifyItems } from '../detect/pipeline';
import { ruleFor } from '../rules/generate';
import { downloadRules } from '../rules/export';
import { ItemRow } from './components/ItemRow';

const backend = new WorkerClassifier();

function Panel() {
  const [items, setItems] = useState<Record<string, AuditItem>>({});
  const [tab, setTab] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.data?.type !== 'DOM_ITEMS' && e.data?.type !== 'NETWORK_ITEMS') return;
      const classified = await classifyItems(e.data.items, backend);
      setItems((prev) => {
        const next = { ...prev };
        for (const it of classified) next[it.id] = it;
        return next;
      });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const all = Object.values(items);
  const pii = all.filter((i) => i.pii);
  const rules = useMemo(() => pii.map(ruleFor), [pii.length]);
  const hover = (i: AuditItem) =>
    parent.postMessage({ type: 'HIGHLIGHT', itemId: i.id, selector: i.selector }, '*');
  const leave = () => parent.postMessage({ type: 'CLEAR_HIGHLIGHT' }, '*');

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 10, borderBottom: '1px solid #E1E6EB', fontWeight: 700 }}>PII Audit</div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: '8px 10px',
          borderBottom: '1px solid #E1E6EB',
          fontSize: 13,
        }}
      >
        <a
          onClick={() => setTab(1)}
          style={{ cursor: 'pointer', color: tab === 1 ? '#2D6CDF' : '#8A98A6' }}
        >
          Everything ({all.length})
        </a>
        <a
          onClick={() => setTab(2)}
          style={{ cursor: 'pointer', color: tab === 2 ? '#2D6CDF' : '#8A98A6' }}
        >
          PII only ({pii.length})
        </a>
        <a
          onClick={() => setTab(3)}
          style={{ cursor: 'pointer', color: tab === 3 ? '#2D6CDF' : '#8A98A6' }}
        >
          Masking rules ({rules.length})
        </a>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
        {tab !== 3 &&
          (tab === 1 ? all : pii).map((i) => (
            <ItemRow key={i.id} item={i} onHover={hover} onLeave={leave} />
          ))}
        {tab === 3 && (
          <>
            <button
              onClick={() => downloadRules(rules)}
              style={{ width: '100%', padding: 8, marginBottom: 10 }}
            >
              Export to file
            </button>
            {rules.map((r, i) => (
              <div key={i} style={{ fontSize: 12, padding: 6, borderBottom: '1px solid #eee' }}>
                <b>{r.kind}</b> <code>{r.target}</code>
                <div style={{ color: '#5B6B7B' }}>{r.note}</div>
              </div>
            ))}
          </>
        )}
      </div>
      <div
        style={{
          padding: 8,
          background: '#EAF7EE',
          color: '#2E7D46',
          fontSize: 12,
          textAlign: 'center',
        }}
      >
        🔒 Nothing sent to Amplitude · classified locally
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Panel />);
