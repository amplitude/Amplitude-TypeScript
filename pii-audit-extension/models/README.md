# Model assets (local, zero egress)

All model weights and ONNX Runtime WASM files are **bundled locally** inside the extension. Nothing is fetched from Hugging Face or a CDN at runtime.

Large binaries (`.onnx`, `.wasm`) are gitignored. Run the commands below to reproduce the asset layout on a fresh clone.

## Route A — Piiranha via transformers.js (recommended spike)

Token-classification pipeline; lower integration risk.

```bash
# Install Hugging Face CLI (pick one)
pip install -U "huggingface_hub[cli]"   # or: brew install hf

# Download weights + tokenizer (whole folder required by transformers.js)
huggingface-cli download onnx-community/piiranha-v1-detect-personal-information-ONNX \
  --local-dir pii-audit-extension/models/piiranha-v1 \
  --include "*.json" "onnx/*"

# Alternative (newer hf CLI / Python API)
python3 -c "
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='onnx-community/piiranha-v1-detect-personal-information-ONNX',
    local_dir='pii-audit-extension/models/piiranha-v1',
    allow_patterns=['*.json', 'onnx/*'],
)
"
```

**Expected layout:** `config.json`, `tokenizer.json`, and `onnx/model_quantized.onnx` (plus other quantized variants).

**License:** The base model [iiiorg/piiranha-v1-detect-personal-information](https://huggingface.co/iiiorg/piiranha-v1-detect-personal-information) is **CC-BY-NC-ND-4.0** (non-commercial, no derivatives). The ONNX community conversion inherits this license. **Verify before any commercial ship** — commercial licensing has been discussed but is not broadly available.

## Route B — GLiNER-PII via `gliner` npm (zero-shot labels)

```bash
cd pii-audit-extension && npm i gliner && cd ..

huggingface-cli download knowledgator/gliner-pii-small-v1.0 \
  --local-dir pii-audit-extension/models/gliner-pii-small \
  --include "*.json" "onnx/*"
```

**License:** [knowledgator/gliner-pii-small-v1.0](https://huggingface.co/knowledgator/gliner-pii-small-v1.0) is **Apache-2.0**. The GLiNER base framework is also Apache-2.0.

## ONNX Runtime Web WASM (offline)

After `npm install` in `pii-audit-extension/` (Task 1):

```bash
mkdir -p pii-audit-extension/ort

# transformers.js route:
cp pii-audit-extension/node_modules/@huggingface/transformers/dist/*.wasm pii-audit-extension/ort/ 2>/dev/null || true

# gliner route (onnxruntime-web peer dep):
cp pii-audit-extension/node_modules/onnxruntime-web/dist/*.wasm pii-audit-extension/ort/ 2>/dev/null || true

ls pii-audit-extension/ort/
```

Task 9 wires `env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/')`.

## Fallback: convert to ONNX

If no pre-built ONNX exists for your chosen model:

**Piiranha (Optimum):**
```bash
pip install "optimum[exporters]"
optimum-cli export onnx --model iiiorg/piiranha-v1-detect-personal-information \
  --task token-classification pii-audit-extension/models/piiranha-v1
```

**GLiNER (repo converter):**
```bash
python convert_to_onnx.py --model_path knowledgator/gliner-pii-small-v1.0 \
  --save_path pii-audit-extension/models/gliner-pii-small/onnx --quantize True
```

## Other references (do not copy code)

- **PII-360** dataset/tooling code is **CC BY-NC** — reference only for evaluation ideas, not for copying into this extension.

## Verify zero runtime egress (after Task 9)

Load the extension, run one classification, and in DevTools → Network filter for `huggingface` / `cdn`. Expected: **no requests**. All loads resolve to `chrome-extension://…/models/…` and `…/ort/…`.

## Git LFS alternative

If the team prefers weights in-repo instead of fetch-on-clone:

```bash
git lfs track "*.onnx" "*.wasm"
```
