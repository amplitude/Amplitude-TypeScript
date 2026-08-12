import { useState } from 'react';
import type { Answers } from '../types';
import { generate } from '../generator/generate';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? '✓ copied' : 'copy'}
    </button>
  );
}

export function CodePanel({ answers }: { answers: Answers }) {
  const artifact = generate(answers);
  return (
    <aside className="panel">
      <div className="panel-head">
        <span className="panel-kicker">LIVE SETUP GUIDE</span>
        <h2>{artifact.headline}</h2>
      </div>

      <div className="panel-body">
        {artifact.steps.map((s, i) => (
          <section key={i} className="step">
            <div className="step-title">
              <span className="step-num">{i + 1}</span> {s.title}
            </div>
            {s.body && <p className="step-body">{s.body}</p>}
            {s.block && (
              <div className="code-block">
                <div className="code-head">
                  <span>{s.block.title}</span>
                  <CopyButton text={s.block.code} />
                </div>
                <pre>
                  <code>{s.block.code}</code>
                </pre>
              </div>
            )}
          </section>
        ))}

        {artifact.decisions.length > 0 && (
          <section className="decisions">
            <h3>Why these settings</h3>
            {artifact.decisions.map((d, i) => (
              <div key={i} className="decision">
                <code className="decision-label">{d.label}</code>
                <p>{d.why}</p>
              </div>
            ))}
          </section>
        )}
      </div>

      <div className="panel-foot">
        Grounded in the <code>Amplitude-TypeScript</code> source · Browser SDK v2.45.5 · Unified v1.1.28
      </div>
    </aside>
  );
}
