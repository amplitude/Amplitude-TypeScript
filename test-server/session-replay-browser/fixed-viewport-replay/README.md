# Fixed viewport control replay

Development harness for **iOS / mobile layout debugging**. It replays captured event JSON with [`@amplitude/rrweb`](https://github.com/amplitude/rrweb) `Replayer` directly — **without** [`rrweb-player`](https://github.com/amplitude/rrweb/tree/main/packages/rrweb-player) CSS `transform: scale()`.

Use this to tell whether squished text comes from **event data / CSS replay** vs **player downscaling** in the Amplitude UI.

## Run

From the repository root (after `pnpm install`):

```bash
pnpm dev:sr-fixed-replay
```

Open http://localhost:5174 — choose your `rrweb-events-*.json`, confirm width/height match the recording meta event (e.g. `402×691`), then **Build replayer**.

## Modes

| Mode | Behavior |
|------|----------|
| **Control** | Root element is exactly meta width×height. Wrapper has **no** scale transform. |
| **Player-fit** | Same box size, but wrapper is scaled like `rrweb-player` (`min(width/box, height/box, maxScale)`). |
| **Show both** | Renders control and player-fit side-by-side for comparison. |

If text looks wrong in **Control** but better in production only when zoomed, the capture/replay CSS path is suspect. If **Control** and **Player-fit** match each other but differ from Amplitude’s viewer, the product player chrome is suspect.

## Packed events

The file input accepts a JSON array of event objects. Entries that are packed strings are passed through `unpack` from `@amplitude/rrweb-packer`.
