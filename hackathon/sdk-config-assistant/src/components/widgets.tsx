import { useMemo, useState } from 'react';
import type { Product, RegexPattern, RegexTarget } from '../types';
import { AUTOCAPTURE_INFO, AUTOCAPTURE_KEYS, type AutocaptureKey } from '../kb/knowledge';
import type { AutocaptureToggles } from '../types';
import {
  REGEX_INTENTS,
  type RegexIntent,
  buildRegex,
  exampleUrls,
  testPattern,
  regexLiteral,
} from '../generator/regex';

/* ---------------- product multi-select ---------------- */

const PRODUCTS: { id: Product; label: string; desc: string; locked?: boolean }[] = [
  { id: 'analytics', label: 'Analytics', desc: 'Events, funnels, retention — the core.', locked: true },
  { id: 'sessionReplay', label: 'Session Replay', desc: 'Watch real user sessions.' },
  { id: 'experiment', label: 'Experiment', desc: 'A/B tests & feature flags.' },
  { id: 'guidesSurveys', label: 'Guides & Surveys', desc: 'In-product guides and surveys.' },
];

export function ProductSelect({
  disabled,
  onDone,
}: {
  disabled?: boolean;
  onDone: (products: Product[], summary: string) => void;
}) {
  const [sel, setSel] = useState<Product[]>(['analytics']);
  const toggle = (p: Product) =>
    setSel((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  return (
    <div className="widget">
      {PRODUCTS.map((p) => (
        <label key={p.id} className={`check ${p.locked ? 'locked' : ''}`}>
          <input
            type="checkbox"
            checked={sel.includes(p.id)}
            disabled={disabled || p.locked}
            onChange={() => toggle(p.id)}
          />
          <span>
            <b>{p.label}</b>
            <small>{p.desc}</small>
          </span>
        </label>
      ))}
      {!disabled && (
        <button
          className="primary"
          onClick={() => {
            const names = PRODUCTS.filter((p) => sel.includes(p.id)).map((p) => p.label);
            onDone(sel, names.join(' + '));
          }}
        >
          Continue →
        </button>
      )}
    </div>
  );
}

/* ---------------- autocapture toggles ---------------- */

export function AutocaptureSelect({
  disabled,
  initial,
  onDone,
}: {
  disabled?: boolean;
  initial?: AutocaptureToggles;
  onDone: (t: AutocaptureToggles, summary: string) => void;
}) {
  const defaults = useMemo(() => {
    const t = {} as AutocaptureToggles;
    for (const k of AUTOCAPTURE_KEYS) t[k] = AUTOCAPTURE_INFO[k].defaultOn;
    return initial ?? t;
  }, [initial]);
  const [t, setT] = useState<AutocaptureToggles>(defaults);
  const flip = (k: AutocaptureKey) => setT((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div className="widget">
      {AUTOCAPTURE_KEYS.map((k) => {
        const info = AUTOCAPTURE_INFO[k];
        return (
          <label key={k} className="check">
            <input type="checkbox" checked={t[k]} disabled={disabled} onChange={() => flip(k)} />
            <span>
              <b>
                {info.label}
                {info.defaultOn ? <em className="tag on"> default on</em> : <em className="tag"> default off</em>}
              </b>
              <small>{info.short}</small>
            </span>
          </label>
        );
      })}
      {!disabled && (
        <button
          className="primary"
          onClick={() => {
            const on = AUTOCAPTURE_KEYS.filter((k) => t[k]).map((k) => AUTOCAPTURE_INFO[k].label);
            onDone(t, `Track: ${on.join(', ')}`);
          }}
        >
          Apply →
        </button>
      )}
    </div>
  );
}

/* ---------------- regex builder ---------------- */

export function RegexBuilder({
  target,
  disabled,
  onDone,
}: {
  target: RegexTarget;
  disabled?: boolean;
  onDone: (p: RegexPattern, summary: string) => void;
}) {
  const [intent, setIntent] = useState<RegexIntent>('underSection');
  const [input, setInput] = useState('');
  const [urls, setUrls] = useState('');
  const [touchedUrls, setTouchedUrls] = useState(false);

  const info = REGEX_INTENTS.find((i) => i.id === intent)!;
  const pattern = useMemo(() => buildRegex(intent, input), [intent, input]);
  const testerUrls = touchedUrls || !pattern ? urls : exampleUrls(intent, input).join('\n');

  const lines = testerUrls.split('\n').filter((l) => l.trim());

  return (
    <div className="widget regex">
      <div className="intent-row">
        {REGEX_INTENTS.map((i) => (
          <button
            key={i.id}
            className={`intent ${i.id === intent ? 'active' : ''}`}
            disabled={disabled}
            onClick={() => setIntent(i.id)}
            title={i.hint}
          >
            {i.label}
          </button>
        ))}
      </div>
      <input
        className="text"
        placeholder={info.placeholder}
        value={input}
        disabled={disabled}
        onChange={(e) => setInput(e.target.value)}
      />
      <div className="hint">{info.hint}{info.multi ? ' — separate with commas' : ''}</div>

      {pattern && (
        <>
          <div className="pattern-out">
            <code>{regexLiteral(pattern)}</code>
          </div>
          <div className="english">Matches {pattern.english}</div>

          <div className="tester">
            <div className="tester-title">Try it on your real URLs (one per line):</div>
            <textarea
              rows={4}
              value={testerUrls}
              disabled={disabled}
              onChange={(e) => {
                setTouchedUrls(true);
                setUrls(e.target.value);
              }}
            />
            <div className="results">
              {lines.map((l, i) => {
                const ok = testPattern(pattern, l);
                return (
                  <div key={i} className={`result ${ok ? 'ok' : 'no'}`}>
                    <span className="dot">{ok ? '✓' : '✗'}</span> {l.trim()}
                  </div>
                );
              })}
            </div>
          </div>

          {!disabled && (
            <button
              className="primary"
              onClick={() => onDone(pattern, `Use pattern ${regexLiteral(pattern)}`)}
            >
              {target === 'generic' ? 'Looks right ✓' : 'Use this pattern →'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
