import { useEffect, useRef, useState } from 'react';
import type { Answers, ChatMessage, ChipOption, Product, RegexPattern } from './types';
import { initialAnswers } from './types';
import type { AutocaptureToggles } from './types';
import { FLOW, WIDGET_DONE_NODE, routeFreeText } from './engine/flow';
import { Md } from './components/Markdown';
import { ProductSelect, AutocaptureSelect, RegexBuilder } from './components/widgets';
import { CodePanel } from './components/CodePanel';
import { defaultToggles } from './generator/generate';
import { createRecognizer, matchChipLabel, speak, speechSupported, stopSpeaking } from './voice';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let nextId = 1;

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answers, setAnswers] = useState<Answers>(initialAnswers());
  const [nodeId, setNodeId] = useState('welcome');
  const [busy, setBusy] = useState(true);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const answersRef = useRef(answers);
  const nodeIdRef = useRef(nodeId);
  const voiceRef = useRef(voiceReplies);
  const busyRef = useRef(true);
  const activeWidgetRef = useRef<number | null>(null);
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const updateAnswers = (a: Answers) => {
    answersRef.current = a;
    setAnswers(a);
  };
  const setBusyBoth = (b: boolean) => {
    busyRef.current = b;
    setBusy(b);
  };
  const setVoice = (on: boolean) => {
    voiceRef.current = on;
    setVoiceReplies(on);
    if (!on) stopSpeaking();
  };
  const stopMic = () => {
    try {
      recRef.current?.abort();
    } catch {
      /* recognizer may already be stopped */
    }
    setListening(false);
  };

  const push = (m: Omit<ChatMessage, 'id'>): number => {
    const id = nextId++;
    setMessages((ms) => [...ms, { ...m, id }]);
    return id;
  };

  /** Any widget still interactive gets frozen when the conversation moves on. */
  const freezeAllWidgets = () => {
    activeWidgetRef.current = null;
    setMessages((ms) => ms.map((m) => (m.widget && !m.widgetDone ? { ...m, widgetDone: true } : m)));
  };

  async function goTo(id: string): Promise<void> {
    if (id === 'restart') {
      stopMic();
      stopSpeaking();
      setInput('');
      updateAnswers(initialAnswers());
      activeWidgetRef.current = null;
      setMessages([]);
      return goTo('welcome');
    }
    const node = FLOW[id];
    if (!node) {
      setBusyBoth(false);
      return;
    }
    nodeIdRef.current = id;
    setNodeId(id);
    setBusyBoth(true);
    const a = answersRef.current;
    for (const text of node.bot(a)) {
      await sleep(420);
      push({ role: 'bot', text });
      if (voiceRef.current) speak(text);
    }
    const widget = node.widget?.(a);
    if (widget) {
      await sleep(320);
      activeWidgetRef.current = push({ role: 'bot', widget });
      setBusyBoth(false);
      return;
    }
    const next = node.auto?.(a);
    if (next) {
      await sleep(380);
      return goTo(next);
    }
    setBusyBoth(false);
  }

  useEffect(() => {
    if (startedRef.current) return; // survive StrictMode double-mount
    startedRef.current = true;
    void goTo('welcome');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const onChip = (opt: ChipOption) => {
    if (busyRef.current) return;
    stopSpeaking();
    stopMic();
    freezeAllWidgets();
    push({ role: 'user', text: opt.label.replace(/^[^\w“"']+\s*/u, '') });
    if (opt.apply) updateAnswers(opt.apply(answersRef.current));
    void goTo(opt.next);
  };

  /** Only the widget goTo() most recently opened may complete, and only once. */
  const claimWidget = (msgId: number): boolean => {
    if (busyRef.current || activeWidgetRef.current !== msgId) return false;
    activeWidgetRef.current = null;
    setMessages((ms) => ms.map((m) => (m.id === msgId ? { ...m, widgetDone: true } : m)));
    return true;
  };

  const onProductsDone = (msgId: number) => (products: Product[], summary: string) => {
    if (!claimWidget(msgId)) return;
    updateAnswers({ ...answersRef.current, products });
    push({ role: 'user', text: summary });
    void goTo(WIDGET_DONE_NODE.productSelect);
  };

  const onAutocaptureDone = (msgId: number) => (t: AutocaptureToggles, summary: string) => {
    if (!claimWidget(msgId)) return;
    updateAnswers({ ...answersRef.current, autocapture: t });
    push({ role: 'user', text: summary });
    void goTo(WIDGET_DONE_NODE.autocaptureSelect);
  };

  const onRegexDone = (msgId: number, target: string) => (p: RegexPattern, summary: string) => {
    if (!claimWidget(msgId)) return;
    const a = answersRef.current;
    if (target === 'pageViews') {
      updateAnswers({ ...a, pageViewFilter: p });
    } else if (target === 'elementPageUrl') {
      // an allowlist implies element interactions are wanted — materialize
      // the default toggles if the user had picked "defaults" or never chose
      const t = a.autocapture !== 'defaults' && a.autocapture ? a.autocapture : defaultToggles();
      updateAnswers({
        ...a,
        autocapture: { ...t, elementInteractions: true },
        elementPageUrlAllowlist: [...a.elementPageUrlAllowlist, p],
      });
    }
    push({ role: 'user', text: summary });
    void goTo(WIDGET_DONE_NODE[`regexBuilder:${target}`]);
  };

  /** Shared entry for typed AND spoken answers. */
  const handleUserText = (raw: string) => {
    const text = raw.trim();
    if (!text || busyRef.current) return;
    stopSpeaking();
    stopMic();
    freezeAllWidgets();
    setInput('');
    push({ role: 'user', text });

    // 1) does it answer the current question? (match against visible chips)
    const chips = FLOW[nodeIdRef.current]?.chips?.(answersRef.current) ?? [];
    const hit = matchChipLabel(text, chips.map((c) => c.label));
    if (hit >= 0) {
      const opt = chips[hit];
      if (opt.apply) updateAnswers(opt.apply(answersRef.current));
      void goTo(opt.next);
      return;
    }

    // 2) otherwise route by topic
    const { reply, next } = routeFreeText(text);
    setBusyBoth(true);
    void (async () => {
      await sleep(420);
      push({ role: 'bot', text: reply });
      if (voiceRef.current) speak(reply);
      await goTo(next);
    })();
  };

  const toggleMic = () => {
    if (listening) {
      stopMic();
      return;
    }
    stopSpeaking();
    const rec = createRecognizer(
      (text, isFinal) => {
        setInput(text);
        if (isFinal) {
          setListening(false);
          handleUserText(text);
        }
      },
      () => setListening(false),
    );
    if (!rec) return;
    recRef.current = rec;
    // if they talk to us, talk back — no reading required
    if (!voiceRef.current) setVoice(true);
    setListening(true);
    rec.start();
  };

  const lastMsg = messages[messages.length - 1];
  const chips = !busy ? FLOW[nodeId]?.chips?.(answers) : undefined;
  const showChips = chips && (!lastMsg?.widget || lastMsg.widgetDone);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
            <circle cx="12" cy="12" r="11" fill="#1e61f0" />
            <path
              d="M7 16c1.8 0 2.2-6.5 5-6.5s2.4 6.5 5 6.5"
              stroke="#fff"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <h1>Amplitude Setup Assistant</h1>
            <p>Pick the right install · generate the right config · never write regex again</p>
          </div>
        </div>
        <div className="top-actions">
          <button
            className={`voice-toggle ${voiceReplies ? 'on' : ''}`}
            onClick={() => setVoice(!voiceReplies)}
            title="Read replies aloud"
          >
            {voiceReplies ? '🔊 voice replies on' : '🔇 voice replies off'}
          </button>
          <span className="badge">hackathon build · grounded in SDK source</span>
        </div>
      </header>

      <main className="layout">
        <section className="chat">
          <div className="messages" ref={scrollRef}>
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.role === 'bot' && <div className="avatar">A</div>}
                <div className="bubble">
                  {m.text && <Md text={m.text} />}
                  {m.widget?.kind === 'productSelect' && (
                    <ProductSelect disabled={!!m.widgetDone} onDone={onProductsDone(m.id)} />
                  )}
                  {m.widget?.kind === 'autocaptureSelect' && (
                    <AutocaptureSelect
                      disabled={!!m.widgetDone}
                      initial={
                        answers.autocapture !== 'defaults' ? answers.autocapture : undefined
                      }
                      onDone={onAutocaptureDone(m.id)}
                    />
                  )}
                  {m.widget?.kind === 'regexBuilder' && (
                    <RegexBuilder
                      target={m.widget.target}
                      disabled={!!m.widgetDone}
                      onDone={onRegexDone(m.id, m.widget.target)}
                    />
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="msg bot">
                <div className="avatar">A</div>
                <div className="bubble typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            {showChips && (
              <div className="chips">
                {chips.map((c, i) => (
                  <button key={i} className="chip" onClick={() => onChip(c)}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="composer">
            {speechSupported() && (
              <button
                className={`mic ${listening ? 'listening' : ''}`}
                onClick={toggleMic}
                title={listening ? 'Stop listening' : 'Speak your answer'}
              >
                {listening ? '◼' : '🎤'}
              </button>
            )}
            <input
              placeholder={
                listening ? 'Listening… speak now' : 'Type or press 🎤 and speak — e.g. “how do I turn on remote config?”'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // don't submit half-composed IME text
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') handleUserText(input);
              }}
            />
            <button className="send" onClick={() => handleUserText(input)} disabled={busy || !input.trim()}>
              ➤
            </button>
          </div>
        </section>

        <CodePanel answers={answers} />
      </main>
    </div>
  );
}
