import { env, pipeline } from '@huggingface/transformers';
import type { PiiFinding } from '../shared/item';

env.allowRemoteModels = false;
env.localModelPath = chrome.runtime.getURL('models/');
(env.backends as { onnx: { wasm: { wasmPaths: string } } }).onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/');

const SCORE_THRESHOLD = 0.35;

const ENTITY_CATEGORY: Record<string, string> = {
  GIVENNAME: 'person name',
  SURNAME: 'person name',
  EMAIL: 'email',
  STREET: 'address',
  CITY: 'address',
  ZIPCODE: 'address',
  BUILDINGNUM: 'address',
  ACCOUNTNUM: 'account number',
  CREDITCARDNUMBER: 'account number',
  SOCIALNUM: 'account number',
  TAXNUM: 'account number',
  IDCARDNUM: 'account number',
  DRIVERLICENSENUM: 'account number',
  TELEPHONENUM: 'phone number',
  DATEOFBIRTH: 'date of birth',
  PASSWORD: 'credentials',
  USERNAME: 'credentials',
};

type TokenSpan = { entity?: string; entity_group?: string; score: number; word: string };

let ner: Awaited<ReturnType<typeof pipeline>> | null = null;

async function getNer() {
  ner ??= await pipeline('token-classification', 'piiranha-v1', { device: 'wasm' });
  return ner;
}

const tier = (score: number): PiiFinding['tier'] => (score >= 0.75 ? 'recommend' : 'worth-a-look');

function entityTag(span: TokenSpan): string {
  const raw = span.entity_group ?? span.entity ?? '';
  return raw.replace(/^[BI]-/, '');
}

function categoryFor(span: TokenSpan): string {
  const tag = entityTag(span);
  return ENTITY_CATEGORY[tag] ?? tag.toLowerCase().replace(/_/g, ' ');
}

function tokensToFinding(spans: TokenSpan[]): PiiFinding | null {
  const pii = spans.filter((s) => entityTag(s) !== 'O' && s.score >= SCORE_THRESHOLD);
  if (!pii.length) return null;
  const top = [...pii].sort((a, b) => b.score - a.score)[0];
  const category = categoryFor(top);
  return { category, reason: `looks like ${category}`, tier: tier(top.score) };
}

self.onmessage = async (e: MessageEvent) => {
  const { id, candidates } = e.data as {
    id: number;
    candidates: { id: string; text: string }[];
  };
  const model = await getNer();
  const result: Record<string, PiiFinding | null> = {};
  for (const c of candidates) {
    const spans = (await model(c.text, { aggregation_strategy: 'simple' })) as TokenSpan[];
    result[c.id] = tokensToFinding(Array.isArray(spans) ? spans : []);
  }
  self.postMessage({ id, result });
};
