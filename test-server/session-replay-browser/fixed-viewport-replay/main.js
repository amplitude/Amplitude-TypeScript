import { Replayer } from '@amplitude/rrweb';
import { unpack } from '@amplitude/rrweb-packer/unpack';

/** @type {import('@amplitude/rrweb').Replayer | null} */
let replayer = null;

const META_TYPE = 4;

function parseEvents(raw) {
  let data = raw;
  if (typeof data === 'string') {
    data = JSON.parse(data);
  }
  if (!Array.isArray(data)) {
    throw new Error('Expected a JSON array of rrweb events.');
  }
  return data.map((event) => {
    if (typeof event === 'string') {
      return unpack(event);
    }
    return event;
  });
}

function getMetaDimensions(events) {
  const meta = events.find((e) => e.type === META_TYPE);
  if (!meta?.data) {
    return { width: 390, height: 844, href: null };
  }
  return {
    width: meta.data.width,
    height: meta.data.height,
    href: meta.data.href ?? null,
  };
}

function clearReplayer(stage) {
  if (replayer) {
    replayer.pause();
    replayer = null;
  }
  stage.replaceChildren();
}

function applyPlayerStyleScale(wrapper, iframe, frameWidth, frameHeight, maxScale = 1) {
  const containerWidth = wrapper.parentElement?.clientWidth ?? frameWidth;
  const containerHeight = wrapper.parentElement?.clientHeight ?? frameHeight;
  const widthScale = containerWidth / frameWidth;
  const heightScale = containerHeight / frameHeight;
  const candidates = [widthScale, heightScale];
  if (maxScale) {
    candidates.push(maxScale);
  }
  const scale = Math.min(...candidates);
  wrapper.style.position = 'absolute';
  wrapper.style.left = '50%';
  wrapper.style.top = '50%';
  wrapper.style.transformOrigin = 'top left';
  wrapper.style.transform = `scale(${scale}) translate(-50%, -50%)`;
  void iframe;
}

function mountHarness() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <style>
      :root {
        font-family: system-ui, sans-serif;
        color: #222;
      }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      .panel {
        max-width: 960px;
        margin: 0 auto;
        padding: 16px;
      }
      .row { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin: 12px 0; }
      label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
      input[type="number"] { width: 88px; padding: 6px; }
      input[type="file"] { max-width: 320px; }
      button {
        padding: 8px 14px;
        cursor: pointer;
        border: 1px solid #444;
        border-radius: 4px;
        background: #f6f6f6;
      }
      button.primary { background: #0066cc; color: #fff; border-color: #0052a3; }
      .modes label { flex-direction: row; align-items: center; gap: 6px; }
      .meta { font-size: 12px; font-family: ui-monospace, monospace; background: #f4f4f4; padding: 8px; border-radius: 4px; word-break: break-all; }
      .stage-outer {
        margin-top: 16px;
        display: flex;
        gap: 24px;
        flex-wrap: wrap;
        align-items: flex-start;
      }
      .stage-label { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
      .replay-stage {
        box-sizing: border-box;
        border: 2px solid #222;
        background: #fff;
        position: relative;
        overflow: hidden;
        flex-shrink: 0;
      }
      .replay-stage.control .replayer-wrapper {
        position: relative !important;
        left: 0 !important;
        top: 0 !important;
        transform: none !important;
        transform-origin: unset !important;
      }
      .replay-stage.player-fit {
        background: #eee;
      }
      .hint { font-size: 13px; color: #555; margin: 8px 0 0; line-height: 1.45; }
    </style>
    <div class="panel">
      <h1>Fixed viewport control replay</h1>
      <p class="hint">
        Loads a captured event JSON and replays it with <code>@amplitude/rrweb</code>
        <strong>Replayer</strong> (not rrweb-player). Use <strong>Control</strong> mode: root sized to
        the recording meta dimensions with <em>no</em> CSS <code>transform: scale()</code> on the wrapper.
        Compare with <strong>Player-fit</strong> to mimic rrweb-player downscaling inside the same box.
      </p>
      <div class="row">
        <label>Event JSON<input type="file" id="file" accept=".json,application/json" /></label>
        <label>Width (px)<input type="number" id="width" min="1" /></label>
        <label>Height (px)<input type="number" id="height" min="1" /></label>
        <label>Max scale (player-fit)<input type="number" id="maxScale" min="0" step="0.05" value="1" /></label>
      </div>
      <div class="row modes">
        <label><input type="radio" name="mode" value="control" checked /> Control (exact meta size, no scale)</label>
        <label><input type="radio" name="mode" value="player-fit" /> Player-fit (rrweb-player-style scale)</label>
        <label><input type="checkbox" id="dual" /> Show both side-by-side</label>
      </div>
      <div class="row">
        <button class="primary" id="load" disabled>Build replayer</button>
        <button id="play" disabled>Play</button>
        <button id="pause" disabled>Pause</button>
      </div>
      <pre class="meta" id="meta">Load an event file (e.g. rrweb-events-250.json).</pre>
      <div class="stage-outer" id="stages"></div>
    </div>
  `;

  const fileInput = document.getElementById('file');
  const widthInput = document.getElementById('width');
  const heightInput = document.getElementById('height');
  const maxScaleInput = document.getElementById('maxScale');
  const loadBtn = document.getElementById('load');
  const playBtn = document.getElementById('play');
  const pauseBtn = document.getElementById('pause');
  const metaEl = document.getElementById('meta');
  const stagesEl = document.getElementById('stages');

  /** @type {Array<import('@amplitude/rrweb-types').eventWithTime> | null} */
  let events = null;

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      events = parseEvents(text);
      const meta = getMetaDimensions(events);
      widthInput.value = String(meta.width);
      heightInput.value = String(meta.height);
      metaEl.textContent = [
        `events: ${events.length}`,
        `meta: ${meta.width}×${meta.height}`,
        meta.href ? `href: ${meta.href}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      loadBtn.disabled = false;
    } catch (err) {
      events = null;
      loadBtn.disabled = true;
      metaEl.textContent = `Failed to parse file: ${err instanceof Error ? err.message : String(err)}`;
    }
  });

  function getSelectedMode() {
    const checked = document.querySelector('input[name="mode"]:checked');
    return checked?.value === 'player-fit' ? 'player-fit' : 'control';
  }

  function createStage(mode, width, height) {
    const wrap = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'stage-label';
    label.textContent =
      mode === 'control'
        ? `Control — ${width}×${height}px, no wrapper scale`
        : `Player-fit — ${width}×${height}px container, scaled like rrweb-player`;
    const stage = document.createElement('div');
    stage.className = `replay-stage ${mode}`;
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    wrap.appendChild(label);
    wrap.appendChild(stage);
    return { wrap, stage };
  }

  function buildReplayer(root, mode, width, height, maxScale) {
    const instance = new Replayer(events, {
      root,
      speed: 1,
      skipInactive: false,
      showWarning: true,
      mouseTail: false,
      unpackFn: unpack,
    });

    const onResize = () => {
      if (mode !== 'player-fit') {
        const wrapper = instance.wrapper;
        wrapper.style.position = 'relative';
        wrapper.style.left = '0';
        wrapper.style.top = '0';
        wrapper.style.transform = 'none';
        return;
      }
      applyPlayerStyleScale(instance.wrapper, instance.iframe, width, height, maxScale);
    };

    instance.on('resize', onResize);
    instance.on('fullsnapshot-rebuilded', onResize);
    setTimeout(onResize, 0);

    instance.play();
    return instance;
  }

  loadBtn.addEventListener('click', () => {
    if (!events?.length) {
      return;
    }
    const width = Number(widthInput.value);
    const height = Number(heightInput.value);
    const maxScale = Number(maxScaleInput.value);
    const dual = document.getElementById('dual').checked;
    const primaryMode = getSelectedMode();

    clearReplayer(stagesEl);
    stagesEl.replaceChildren();
    replayer = null;

    const modes = dual ? ['control', 'player-fit'] : [primaryMode];
    /** @type {import('@amplitude/rrweb').Replayer | null} */
    let primary = null;

    for (const mode of modes) {
      const { wrap, stage } = createStage(mode, width, height);
      stagesEl.appendChild(wrap);
      const instance = buildReplayer(stage, mode, width, height, maxScale);
      if (mode === primaryMode || !primary) {
        primary = instance;
      }
    }

    replayer = primary;
    playBtn.disabled = false;
    pauseBtn.disabled = false;
  });

  playBtn.addEventListener('click', () => replayer?.play());
  pauseBtn.addEventListener('click', () => replayer?.pause());
}

mountHarness();
