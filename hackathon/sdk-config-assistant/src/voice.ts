/** Voice I/O built on the Web Speech API (Chrome/Edge/Safari). */

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

export const speechSupported = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export function createRecognizer(
  onText: (text: string, isFinal: boolean) => void,
  onEnd: () => void,
): SpeechRecognitionLike | null {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec: SpeechRecognitionLike = new Ctor();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.onresult = (e: any) => {
    let finalText = '';
    let interim = '';
    for (const result of e.results) {
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    if (finalText) onText(finalText.trim(), true);
    else onText(interim.trim(), false);
  };
  rec.onend = onEnd;
  rec.onerror = onEnd;
  return rec;
}

/** Strip markdown/emoji so text-to-speech doesn't read syntax aloud. */
function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code sample ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[•→▶☝👉]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- voice selection: prefer neural/premium voices over the robotic default ---------- */

let bestVoice: SpeechSynthesisVoice | null = null;

function scoreVoice(v: SpeechSynthesisVoice): number {
  if (!/^en([-_]|$)/i.test(v.lang)) return -1;
  const n = v.name.toLowerCase();
  let s = 0;
  if (n.includes('natural') || n.includes('neural')) s += 100; // Edge neural voices — most human
  if (n.includes('premium') || n.includes('enhanced')) s += 70; // macOS premium voices
  if (n.includes('google')) s += 60; // Chrome network voices — far better than system default
  if (/\b(samantha|ava|allison|zoe|joelle|evan|nathan|aria|jenny|michelle)\b/.test(n)) s += 50;
  if (/^en[-_]us/i.test(v.lang)) s += 15;
  if (n.includes('compact') || n.includes('eloquence') || n.includes('espeak')) s -= 80;
  return s;
}

function refreshVoices(): void {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  bestVoice = voices.reduce<SpeechSynthesisVoice | null>(
    (best, v) => (scoreVoice(v) > (best ? scoreVoice(best) : 0) ? v : best),
    null,
  );
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices();
  // voice list loads asynchronously in Chrome
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  const clean = cleanForSpeech(text);
  if (!clean) return;
  if (!bestVoice) refreshVoices();
  // speak sentence-by-sentence — shorter utterances get much more natural
  // prosody from the synthesizer than one long flat monologue
  const sentences = clean.match(/[^.!?…:]+[.!?…:]+["']?|[^.!?…:]+$/g) ?? [clean];
  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;
    const u = new SpeechSynthesisUtterance(s);
    if (bestVoice) u.voice = bestVoice;
    u.rate = 1.0;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  }
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** Fuzzy-match a spoken/typed answer against the current question's chips. */
export function matchChipLabel(text: string, labels: string[]): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
      .replace(/['’]/g, '') // "don't" → "dont" so negation detection works
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const t = norm(text);
  if (t.length < 3) return -1;
  const NEG = /\b(dont|do not|not|no|never|without)\b/;
  const negated = NEG.test(t);
  let best = -1;
  let bestScore = 0;
  labels.forEach((label, i) => {
    const l = norm(label);
    if (!l) return;
    // negated answers ("don't use GTM") must not select the thing being
    // negated — unless the chip itself is the negative option ("No thanks")
    if (negated && !NEG.test(l)) return;
    let score = 0;
    if (l === t) score = 1;
    else if (l.includes(t) || t.includes(l)) score = 0.85;
    else {
      const lt = new Set(l.split(' '));
      const tt = t.split(' ').filter((w) => w.length > 2);
      if (tt.length) {
        const overlap = tt.filter((w) => lt.has(w)).length;
        score = overlap / Math.max(3, tt.length);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return bestScore >= 0.5 ? best : -1;
}
