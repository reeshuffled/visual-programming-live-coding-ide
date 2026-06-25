import * as Tone from "tone";
import { Shader } from "./shader.js";

const _vizs = [];

// Registered by PianoRollViz to receive note events from Instrument.play()
export const _noteHooks = [];

// ── Local FFT reader (handles Tone.Analyser + Web Audio AnalyserNode) ─────────
function _localReadFft(analyser, bins) {
  if (!analyser) return new Float32Array(bins);
  const out = new Float32Array(bins);
  if (typeof analyser.getValue === 'function') {
    const raw = analyser.getValue();
    const step = raw.length / bins;
    for (let i = 0; i < bins; i++) {
      const db = raw[Math.floor(i * step)];
      out[i] = isFinite(db) ? Math.max(0, (db + 80) / 80) : 0;
    }
  } else if (analyser && analyser.frequencyBinCount) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const step = data.length / bins;
    for (let i = 0; i < bins; i++) out[i] = data[Math.floor(i * step)] / 255;
  }
  return out;
}

export function cleanupViz() {
  for (const v of _vizs) v._destroy();
  _vizs.length = 0;
}

// ── JS → WGSL conversion helpers ─────────────────────────────────────────────

function convertExpr(expr) {
  return expr
    .replace(/Math\.sin\b/g, "sin")
    .replace(/Math\.cos\b/g, "cos")
    .replace(/Math\.tan\b/g, "tan")
    .replace(/Math\.abs\b/g, "abs")
    .replace(/Math\.sqrt\b/g, "sqrt")
    .replace(/Math\.min\b/g, "min")
    .replace(/Math\.max\b/g, "max")
    .replace(/Math\.floor\b/g, "floor")
    .replace(/Math\.ceil\b/g, "ceil")
    .replace(/Math\.pow\b/g, "pow")
    .replace(/Math\.fract\b/g, "fract")
    .replace(/Math\.log\b/g, "log")
    .replace(/Math\.PI\b/g, "3.14159265")
    .replace(/Math\.E\b/g, "2.71828183")
    // bare integer literals → float (not when already followed by '.')
    .replace(/\b(\d+)\b/g, (m, _, offset, str) => str[offset + m.length] === "." ? m : m + ".0");
}

function splitArgs(str) {
  const args = [];
  let depth = 0, start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) { args.push(str.slice(start, i).trim()); start = i + 1; }
  }
  if (start < str.length) args.push(str.slice(start).trim());
  return args;
}

function convertBlock(block) {
  return block.split(/\n|;/).map(s => s.trim()).filter(Boolean).map(stmt => {
    const decl = stmt.match(/^(?:const|let)\s+(\w+)\s*=\s*(.+)$/);
    if (decl) return `let ${decl[1]} = ${convertExpr(decl[2])};`;
    const ret = stmt.match(/^return\s*\[(.+)\]$/s);
    if (ret) return `return vec4f(${splitArgs(ret[1]).map(a => convertExpr(a.trim())).join(", ")});`;
    return convertExpr(stmt);
  }).join("\n  ");
}

function fnToWGSL(fn) {
  const src = fn.toString().trim();
  const m = src.match(/^(?:\(([^)]*)\)|([a-zA-Z_$][\w$]*))\s*=>\s*([\s\S]+)$/);
  if (!m) throw new Error("viz.shader() expects an arrow function like (v) => [r, g, b, a]");

  const params = (m[1] !== undefined ? m[1] : m[2]).split(",").map(s => s.trim()).filter(Boolean);
  const p0 = params[0] || "v";
  const p1 = params[1];

  let rawBody = m[3].trim();
  // Strip outer parens wrapping an array: (([...]))
  while (rawBody.startsWith("(") && rawBody.endsWith(")")) rawBody = rawBody.slice(1, -1).trim();

  const preamble = [
    "let col = textureSample(video, videoSampler, uv);",
    `let ${p0}: f32 = col.r;`,
    ...(p1 ? [`let ${p1}: f32 = time;`] : []),
  ];

  let body;
  if (!rawBody.startsWith("{")) {
    const arrMatch = rawBody.match(/^\[(.+)\]$/s);
    if (!arrMatch) throw new Error("viz.shader() arrow body must be an array [r, g, b, a] or a block { ... }");
    body = `return vec4f(${splitArgs(arrMatch[1]).map(a => convertExpr(a.trim())).join(", ")});`;
  } else {
    body = convertBlock(rawBody.slice(1, rawBody.lastIndexOf("}")).trim());
  }

  return preamble.join("\n  ") + "\n  " + body;
}

// ── Viz shader presets ────────────────────────────────────────────────────────

const VIZ_SHADER_PRESETS = {
  thermal:
    "let col = textureSample(video, videoSampler, uv);\n" +
    "  let v = col.r;\n" +
    "  return vec4f(v * 1.5, v * v, 0.0, 1.0);",
  cool:
    "let col = textureSample(video, videoSampler, uv);\n" +
    "  let v = col.r;\n" +
    "  return vec4f(0.0, v * 0.6, v, 1.0);",
  rainbow:
    "let col = textureSample(video, videoSampler, uv);\n" +
    "  let v = col.r;\n" +
    "  let h = v * 6.0;\n" +
    "  let r = clamp(abs(h - 3.0) - 1.0, 0.0, 1.0);\n" +
    "  let g = clamp(2.0 - abs(h - 2.0), 0.0, 1.0);\n" +
    "  let b = clamp(2.0 - abs(h - 4.0), 0.0, 1.0);\n" +
    "  return vec4f(r * v, g * v, b * v, 1.0);",
  mono:
    "let col = textureSample(video, videoSampler, uv);\n" +
    "  let v = col.r;\n" +
    "  return vec4f(v, v, v, 1.0);",
  neon:
    "let col = textureSample(video, videoSampler, uv);\n" +
    "  let v = col.r;\n" +
    "  let t2 = time * 0.5;\n" +
    "  return vec4f(v * abs(sin(t2)), v * abs(sin(t2 + 2.09)), v * abs(sin(t2 + 4.19)), 1.0);",
};

// ── AudioViz ─────────────────────────────────────────────────────────────────

export class AudioViz {
  constructor(source, { mode = "bars", bins = 64, z = 5, opacity = 0.9, color = null } = {}) {
    this._mode = mode;
    this._z = z;
    this._opacity = opacity;
    this._color = color;
    this._canvas = null;
    this._ctx = null;
    this._rafId = null;

    this._analyser = new Tone.Analyser(mode === "bars" ? "fft" : "waveform", bins);

    if (source) {
      const node = source._ ?? source;
      try { node.connect(this._analyser); } catch (_) {}
    }

    _vizs.push(this);
  }

  _initCanvas() {
    this._canvas = document.createElement("canvas");
    const wrapper = document.getElementById("canvasWrapper");
    const ref = wrapper?.querySelector("canvas");
    this._canvas.width = ref?.width ?? 1600;
    this._canvas.height = ref?.height ?? 900;
    Object.assign(this._canvas.style, {
      position: "absolute", top: "0", left: "0",
      width: "100%", height: "100%",
      zIndex: String(this._z),
      opacity: String(this._opacity),
      pointerEvents: "none",
    });
    wrapper?.appendChild(this._canvas);
    this._ctx = this._canvas.getContext("2d");
  }

  _drawBars() {
    const data = this._analyser.getValue();
    const ctx = this._ctx;
    const W = this._canvas.width, H = this._canvas.height;
    const n = data.length;
    ctx.clearRect(0, 0, W, H);
    const bw = W / n;
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, (data[i] + 100) / 100);
      const h = v * H;
      const hue = this._color != null ? this._color : (i / n) * 240;
      ctx.fillStyle = `hsl(${hue}, 90%, ${25 + v * 45}%)`;
      ctx.fillRect(i * bw, H - h, bw - 1, h);
    }
  }

  _drawWave() {
    const data = this._analyser.getValue();
    const ctx = this._ctx;
    const W = this._canvas.width, H = this._canvas.height;
    const mid = H / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.strokeStyle = this._color != null ? `hsl(${this._color}, 90%, 60%)` : "hsl(120, 90%, 60%)";
    ctx.lineWidth = 2;
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * W;
      const y = mid - data[i] * mid;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  _drawRing() {
    const data = this._analyser.getValue();
    const ctx = this._ctx;
    const W = this._canvas.width, H = this._canvas.height;
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) * 0.25;
    const n = data.length;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.strokeStyle = this._color != null ? `hsl(${this._color}, 90%, 65%)` : "hsl(270, 90%, 70%)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const v = data[i % n];
      const rad = r + v * r * 0.6;
      const x = cx + Math.cos(angle) * rad;
      const y = cy + Math.sin(angle) * rad;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  _frame() {
    if (this._mode === "wave") this._drawWave();
    else if (this._mode === "ring") this._drawRing();
    else this._drawBars();
    this._rafId = requestAnimationFrame(() => this._frame());
  }

  start() {
    if (!this._canvas) this._initCanvas();
    if (!this._rafId) this._frame();
    (window.__ar_keepAlive ??= new Set()).add(this);
    return this;
  }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    window.__ar_keepAlive?.delete(this);
    return this;
  }

  mode(m) {
    this._mode = m;
    this._analyser.type = m === "bars" ? "fft" : "waveform";
    return this;
  }

  color(hue) { this._color = hue; return this; }

  opacity(n) {
    this._opacity = n;
    if (this._canvas) this._canvas.style.opacity = String(n);
    return this;
  }

  z(n) {
    this._z = n;
    if (this._canvas) this._canvas.style.zIndex = String(n);
    return this;
  }

  // Apply a WebGPU shader to this viz's canvas.
  // fnOrPreset: arrow function (v, t?) => [r, g, b, a]  OR  preset name string.
  // Returns the started Shader — call .stop()/.opacity()/.z() on it.
  shader(fnOrPreset, opts = {}) {
    if (!this._canvas) this.start();
    let body;
    if (typeof fnOrPreset === "string") {
      body = VIZ_SHADER_PRESETS[fnOrPreset];
      if (!body) throw new Error(`viz.shader(): unknown preset '${fnOrPreset}'. Available: ${Object.keys(VIZ_SHADER_PRESETS).join(", ")}`);
    } else if (typeof fnOrPreset === "function") {
      body = fnToWGSL(fnOrPreset);
    } else {
      throw new Error("viz.shader() expects an arrow function or a preset name string");
    }
    return new Shader(body, { video: this._canvas, ...opts }).start();
  }

  get canvas() { return this._canvas; }

  static get presets() { return Object.keys(VIZ_SHADER_PRESETS); }

  _destroy() {
    this.stop();
    this._canvas?.remove();
    try { this._analyser.dispose(); } catch (_) {}
  }
}

// ── SpectrogramCanvas (#8) ────────────────────────────────────────────────────
// Scrolling spectrogram: frequency on Y, time scrolls left→right.
// source: Tone node | 'mic' | signal object (has .fft getter)
export class SpectrogramCanvas {
  constructor(source, { bins = 256, width = 512, height = 256, palette = 'rainbow', z = null } = {}) {
    this._bins    = bins;
    this._palette = palette;
    this._signal  = null;
    this._analyser = null;
    this._micMode  = source === 'mic';

    if (!this._micMode && source) {
      if (source && typeof source === 'object' && 'fft' in source) {
        this._signal = source;
      } else {
        this._analyser = new Tone.Analyser('fft', bins);
        const node = source?._ ?? source;
        try { node.connect(this._analyser); } catch (_) {}
      }
    }

    this._canvas = document.createElement('canvas');
    this._canvas.width  = width;
    this._canvas.height = height;
    this._ctx   = this._canvas.getContext('2d');
    this._rafId = null;

    if (z !== null) {
      Object.assign(this._canvas.style, {
        position: 'absolute', top: '0', left: '0',
        width: '100%', height: '100%',
        zIndex: String(z), pointerEvents: 'none',
      });
      document.getElementById('canvasWrapper')?.appendChild(this._canvas);
      (window.__ar_keepAlive ??= new Set()).add(this);
    }

    _vizs.push(this);
    this._start();
  }

  _getFft() {
    if (this._signal)  return this._signal.fft;
    if (this._micMode) {
      const node = window.__ar_mic_analyser;
      if (!node) return new Float32Array(this._bins);
      const raw  = new Float32Array(node.frequencyBinCount || this._bins);
      if (typeof node.getFloatFrequencyData === 'function') node.getFloatFrequencyData(raw);
      const out  = new Float32Array(this._bins);
      const step = raw.length / this._bins;
      for (let i = 0; i < this._bins; i++) {
        const db = raw[Math.floor(i * step)];
        out[i] = isFinite(db) ? Math.max(0, (db + 80) / 80) : 0;
      }
      return out;
    }
    return _localReadFft(this._analyser, this._bins);
  }

  _colorFor(v) {
    switch (this._palette) {
      case 'thermal': return [Math.min(255, Math.round(v * 1.5 * 255)), Math.round(v * v * 255), 0, 255];
      case 'cool':    return [0, Math.round(v * 150), Math.round(v * 255), 255];
      case 'mono':    { const c = Math.round(v * 255); return [c, c, c, 255]; }
      default: {
        // rainbow hue from blue→red as v increases
        const h = (1 - v) * 240 / 360;
        const [r, g, b] = _hslToRgb(h, 0.9, Math.max(0.05, v * 0.55 + 0.1));
        return [r, g, b, 255];
      }
    }
  }

  _frame() {
    const ctx = this._ctx;
    const W   = this._canvas.width;
    const H   = this._canvas.height;

    // Shift all pixels left by 1
    const img = ctx.getImageData(1, 0, W - 1, H);
    ctx.putImageData(img, 0, 0);

    // Draw new column on right edge
    const fft  = this._getFft();
    const col  = ctx.createImageData(1, H);
    for (let y = 0; y < H; y++) {
      const binIdx = Math.floor(((H - 1 - y) / H) * this._bins);
      const v = Math.min(1, fft[Math.min(binIdx, this._bins - 1)] ?? 0);
      const [r, g, b, a] = this._colorFor(v);
      const i = y * 4;
      col.data[i] = r; col.data[i + 1] = g; col.data[i + 2] = b; col.data[i + 3] = a;
    }
    ctx.putImageData(col, W - 1, 0);

    this._rafId = requestAnimationFrame(() => this._frame());
  }

  _start() { if (!this._rafId) this._frame(); }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    window.__ar_keepAlive?.delete(this);
    return this;
  }

  palette(name) { this._palette = name; return this; }

  get canvas() { return this._canvas; }

  _destroy() {
    this.stop();
    this._canvas?.remove();
    if (this._analyser) try { this._analyser.dispose(); } catch (_) {}
  }
}

// ── PianoRollViz (#9) ─────────────────────────────────────────────────────────
// Scrolling note history overlay. Pitch on X, time scrolls upward.
// Receives notes via _noteHooks (fired by Instrument.play() in audio.js).
export class PianoRollViz {
  constructor({ z = 15, opacity = 0.85, speed = 80, midiMin = 36, midiMax = 96 } = {}) {
    this._notes   = [];
    this._speed   = speed;   // pixels per second scrolling upward
    this._midiMin = midiMin;
    this._midiMax = midiMax;
    this._canvas  = null;
    this._ctx     = null;
    this._rafId   = null;
    this._z       = z;
    this._opacity = opacity;

    this._hook = ({ note, dur }) => {
      const midi  = _noteToMidi(note);
      if (midi < this._midiMin || midi > this._midiMax) return;
      const durMs = _durToMs(dur);
      this._notes.push({
        midi,
        startAt: performance.now(),
        dur:     durMs,
        color:   `hsl(${((midi - 60) * 15 + 360) % 360},80%,60%)`,
      });
      if (this._notes.length > 500) this._notes.shift();
    };
    _noteHooks.push(this._hook);
    _vizs.push(this);
  }

  start() {
    if (!this._canvas) this._initCanvas();
    if (!this._rafId) this._frame();
    (window.__ar_keepAlive ??= new Set()).add(this);
    return this;
  }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    window.__ar_keepAlive?.delete(this);
    return this;
  }

  _initCanvas() {
    this._canvas = document.createElement('canvas');
    const wrapper = document.getElementById('canvasWrapper');
    const ref = wrapper?.querySelector('canvas');
    this._canvas.width  = ref?.width  ?? 1600;
    this._canvas.height = ref?.height ?? 900;
    Object.assign(this._canvas.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%',
      zIndex: String(this._z),
      opacity: String(this._opacity),
      pointerEvents: 'none',
    });
    wrapper?.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');
  }

  _frame() {
    const ctx   = this._ctx;
    const W     = this._canvas.width;
    const H     = this._canvas.height;
    const now   = performance.now();
    const range = Math.max(1, this._midiMax - this._midiMin);

    ctx.clearRect(0, 0, W, H);

    // Faint key grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let m = this._midiMin; m <= this._midiMax; m++) {
      const x = ((m - this._midiMin) / range) * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    // "now" line at 85% down
    const nowY = H * 0.85;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, nowY); ctx.lineTo(W, nowY); ctx.stroke();

    const pixPerMs = this._speed / 1000;
    const noteW = Math.max(4, Math.floor(W / (range + 1)) - 1);

    for (const n of this._notes) {
      const elapsed = now - n.startAt;
      const x = Math.floor(((n.midi - this._midiMin) / range) * W);
      const noteH = Math.max(4, n.dur * pixPerMs);
      const y = nowY - elapsed * pixPerMs - noteH;

      if (y + noteH < 0) continue;

      ctx.fillStyle = n.color;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, noteW, noteH, 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, noteW, noteH);
      }
    }

    this._rafId = requestAnimationFrame(() => this._frame());
  }

  get canvas() { return this._canvas; }

  _destroy() {
    this.stop();
    this._canvas?.remove();
    const i = _noteHooks.indexOf(this._hook);
    if (i >= 0) _noteHooks.splice(i, 1);
  }
}

// ── EQWidget (#10) ────────────────────────────────────────────────────────────
// Floating 3-band EQ panel. Acts as a Tone-compatible node for .chain().
// Usage: const eq = audio.eqWidget(); synth.chain(eq);
export class EQWidget {
  constructor({ title = 'EQ', x = 20, y = null } = {}) {
    this._eq  = new Tone.EQ3(0, 0, 0);
    this._el  = null;
    this._inputs = {};
    this._vals   = {};
    this._init(title, x, y);
    _vizs.push(this);
  }

  _init(title, x, yOpt) {
    const el = document.createElement('div');
    el.className = 'ar-eq-widget';
    const bottom = yOpt !== null ? `bottom:${yOpt ?? 20}px` : 'bottom:20px';
    el.style.cssText = `position:fixed;${bottom};left:${x}px;background:#1a1a2e;border:1px solid #444;border-radius:8px;padding:10px 14px;z-index:9999;font-family:monospace;font-size:12px;color:#ccc;user-select:none;pointer-events:all;`;

    const hdr = document.createElement('div');
    hdr.textContent = title;
    hdr.style.cssText = 'font-weight:bold;color:#fff;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:1px;';
    el.appendChild(hdr);

    for (const [key, label, freq] of [['low','Low','80 Hz'], ['mid','Mid','1 kHz'], ['high','High','10 kHz']]) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';

      const lbl = document.createElement('span');
      lbl.style.cssText = 'width:44px;text-align:right;color:#888;font-size:10px;';
      lbl.title = freq;
      lbl.textContent = label;

      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = '-12'; inp.max = '12'; inp.step = '0.5'; inp.value = '0';
      inp.style.cssText = 'width:90px;accent-color:#6366f1;cursor:pointer;';

      const val = document.createElement('span');
      val.style.cssText = 'width:36px;font-size:10px;color:#aaa;';
      val.textContent = '0 dB';

      inp.addEventListener('input', () => {
        const db = parseFloat(inp.value);
        val.textContent = `${db > 0 ? '+' : ''}${db}dB`;
        try { this._eq[key].value = db; } catch (_) {}
      });

      row.appendChild(lbl); row.appendChild(inp); row.appendChild(val);
      el.appendChild(row);
      this._inputs[key] = inp;
      this._vals[key]   = val;
    }

    document.body?.appendChild(el);
    this._el = el;
  }

  _setband(key, db) {
    const inp = this._inputs[key];
    const val = this._vals[key];
    if (inp) inp.value = db;
    if (val) val.textContent = `${db > 0 ? '+' : ''}${db}dB`;
    try { this._eq[key].value = db; } catch (_) {}
    return this;
  }

  low(db)  { return this._setband('low',  db); }
  mid(db)  { return this._setband('mid',  db); }
  high(db) { return this._setband('high', db); }

  // Tone-compatible interface so synth.chain(eqWidget) works
  connect(dest)   { try { this._eq.connect(dest);   } catch (_) {} return this; }
  disconnect()    { try { this._eq.disconnect();     } catch (_) {} return this; }
  toDestination() { try { this._eq.toDestination();  } catch (_) {} return this; }
  chain(...nodes) { try { this._eq.chain(...nodes);  } catch (_) {} return this; }

  hide() { if (this._el) this._el.style.display = 'none'; return this; }
  show() { if (this._el) this._el.style.display = '';     return this; }

  _destroy() {
    this._el?.remove();
    try { this._eq.dispose(); } catch (_) {}
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const seg = Math.floor(h * 6);
  if      (seg === 0) { r = c; g = x; }
  else if (seg === 1) { r = x; g = c; }
  else if (seg === 2) { g = c; b = x; }
  else if (seg === 3) { g = x; b = c; }
  else if (seg === 4) { r = x; b = c; }
  else                { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function _noteToMidi(note) {
  if (typeof note === 'number') return Math.round(note);
  const semis = { C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5, 'F#':6, Gb:6, G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11 };
  const m = String(note).match(/^([A-Ga-g](?:#|b)?)(-?\d)$/);
  if (!m) return 60;
  const name = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return (parseInt(m[2], 10) + 1) * 12 + (semis[name] ?? 0);
}

function _durToMs(dur) {
  if (typeof dur === 'number') return dur * 1000;
  const bpm = Tone.getTransport?.().bpm?.value ?? 120;
  const beatMs = 60000 / bpm;
  if (typeof dur === 'string') {
    if (dur.endsWith('n')) return beatMs * (4 / parseInt(dur, 10));
    if (dur.endsWith('m')) return beatMs * 4 * parseInt(dur, 10);
    if (dur.endsWith('s')) return parseFloat(dur) * 1000;
  }
  return 500;
}
