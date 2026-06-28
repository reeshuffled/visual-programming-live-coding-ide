import * as Tone from "tone";
import { Shader } from "./shader.js";
import { WidgetHistory } from "./widget-history.js";
import { onReset } from '../runtime/reset-registry.js';
import { liveOutput } from '../runtime/keep-alive.js';
import { acquireMicRunScoped } from './media-lease.js';
import { readAnalyser } from './analyser-read.js';

const _vizs = [];

// Registered by PianoRollViz to receive note events from Instrument.play()
export const _noteHooks = [];

export function cleanupViz() {
  for (const v of _vizs) v._destroy();
  _vizs.length = 0;
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
    this._live = liveOutput(this);
    return this;
  }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._live?.release();
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
    if (typeof fnOrPreset === "string") {
      const body = VIZ_SHADER_PRESETS[fnOrPreset];
      if (!body) throw new Error(`viz.shader(): unknown preset '${fnOrPreset}'. Available: ${Object.keys(VIZ_SHADER_PRESETS).join(", ")}`);
      return new Shader(body, { video: this._canvas, ...opts }).start();
    }
    if (typeof fnOrPreset === "function") {
      // viz contract: (v, t?) => [r,g,b,a]. Bind the user's param names to the
      // video sample and let the shared transpiler (jsToWGSL, via Shader) handle
      // the body: v = col.r (pixel luminance/red), t = time.
      const m = fnOrPreset.toString().match(/^\s*(?:\(([^)]*)\)|([a-zA-Z_$][\w$]*))\s*=>/);
      const params = ((m && (m[1] ?? m[2])) || "v").split(",").map(s => s.trim()).filter(Boolean);
      const bind = {};
      if (params[0]) bind[params[0]] = "col.r";
      if (params[1]) bind[params[1]] = "time";
      return new Shader(fnOrPreset, { video: this._canvas, bind, ...opts }).start();
    }
    throw new Error("viz.shader() expects an arrow function or a preset name string");
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

    if (this._micMode) acquireMicRunScoped(); // run-scoped: auto-released on reset (ADR 023)

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
    this._ctx   = this._canvas.getContext('2d', { willReadFrequently: true });
    this._rafId = null;

    if (z !== null) {
      Object.assign(this._canvas.style, {
        position: 'absolute', top: '0', left: '0',
        width: '100%', height: '100%',
        zIndex: String(z), pointerEvents: 'none',
      });
      document.getElementById('canvasWrapper')?.appendChild(this._canvas);
      this._live = liveOutput(this);
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
    return readAnalyser(this._analyser, this._bins);
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
    this._live?.release();
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
    this._live = liveOutput(this);
    return this;
  }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._live?.release();
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

// ── EQWidget — deep version: live spectrum + draggable EQ curve ───────────────
// Spawns a WM window showing FFT bars with an overlaid 3-band EQ response curve.
// Draggable handles (Low ~250Hz / Mid ~2.5kHz / High ~8kHz) control Tone.EQ3.
// Tone-compatible: synth.chain(eq) works.
export class EQWidget {
  constructor({ title = 'EQ', x, y, w = 420, h = 220, low: initLow, mid: initMid, high: initHigh } = {}) {
    this._eq       = new Tone.EQ3(0, 0, 0);
    this._bands    = { low: 0, mid: 0, high: 0 };
    this._analyser = null;
    this._rafId    = null;
    this._canvas   = null;
    this._winId    = null;
    this._drag     = null; // { band, startY, startDb }
    this._init(title, x, y, w, h);
    _vizs.push(this);
    if (initLow  != null) this.low(initLow);
    if (initMid  != null) this.mid(initMid);
    if (initHigh != null) this.high(initHigh);
    const win = document.getElementById(this._winId);
    if (win) {
      win._widgetType  = 'eq';
      win._widgetState = () => ({ ...this._bands });
    }

    // Per-widget undo/redo
    this._history = new WidgetHistory({
      capture: () => ({ ...this._bands }),
      restore: (snap) => {
        if (snap.low  != null) this.low(snap.low);
        if (snap.mid  != null) this.mid(snap.mid);
        if (snap.high != null) this.high(snap.high);
      },
    });
    window.wm?.addHistoryControls(this._winId, this._history);
  }

  _init(title, x, y, w, h) {
    if (!window.wm) return;
    this._winId = window.wm.spawn(title || 'EQ', {
      type: 'html', html: '', w, h, audio: false,
      ...(x != null ? { x } : {}), ...(y != null ? { y } : {}),
    });
    const win  = document.getElementById(this._winId);
    const body = win?.querySelector('.wm-body');
    if (!body) return;

    body.style.cssText += 'background:#0d0d1a;overflow:hidden;padding:0;';

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:ns-resize;';
    body.appendChild(canvas);
    this._canvas = canvas;

    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth  * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
    });
    ro.observe(canvas);

    this._analyser = new Tone.Analyser({ type: 'fft', size: 256 });
    try { this._eq.connect(this._analyser); } catch (_) {}

    this._setupDrag(canvas);
    this._drawLoop();

    if (win) win._wmCleanup = () => this._destroyCore();
  }

  // Frequency → X pixel (log scale 20Hz–20kHz)
  _freqToX(f, W) { return Math.log10(f / 20) / Math.log10(1000) * W; }
  // Gain (dB) → Y pixel (±12dB range)
  _dbToY(db, H) { return H / 2 - (db / 12) * (H / 2); }

  // Approximate EQ3 response at frequency f given low/mid/high band gains
  _curveAt(f, W, H) {
    const { low, mid, high } = this._bands;
    // Low shelf <400Hz, High shelf >2500Hz, Mid peak around 2500Hz
    let gain = 0;
    if (f < 400)        gain += low  * Math.max(0, 1 - f / 400);
    else if (f < 800)   gain += low  * Math.max(0, (800 - f) / 400) * 0.3;
    if (f > 2500)       gain += high * Math.min(1, (f - 2500) / 2500);
    else if (f > 1500)  gain += high * Math.min(1, (f - 1500) / 1000) * 0.3;
    // Mid peak
    const midFreq = 2500, midBW = 2.0;
    const midGain = mid * Math.exp(-0.5 * Math.pow(Math.log2(f / midFreq) / midBW, 2));
    gain += midGain;
    return this._dbToY(Math.max(-12, Math.min(12, gain)), H);
  }

  _drawLoop() {
    const draw = () => {
      this._rafId = requestAnimationFrame(draw);
      const canvas = this._canvas;
      if (!canvas) return;
      const W = canvas.width, H = canvas.height;
      if (!W || !H) return;
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#0d0d1a';
      ctx.fillRect(0, 0, W, H);

      // Grid lines (frequency decades + 0dB)
      ctx.strokeStyle = '#1e1e2e';
      ctx.lineWidth = 1;
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
        const x = this._freqToX(f, W);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      ctx.strokeStyle = '#2a2a3e'; ctx.lineWidth = 1;
      const y0 = this._dbToY(0, H);
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();

      // FFT bars (log-mapped, gradient)
      if (this._analyser) {
        const raw = this._analyser.getValue();
        const bins = raw.length;
        const nyq  = Tone.getContext().sampleRate / 2;
        for (let i = 1; i < bins; i++) {
          const f1 = (i - 1) / bins * nyq, f2 = i / bins * nyq;
          if (f1 < 20 || f2 > 20000) continue;
          const x1 = this._freqToX(Math.max(20, f1), W);
          const x2 = this._freqToX(Math.min(20000, f2), W);
          const v  = Math.max(0, Math.min(1, (raw[i] + 90) / 90));
          ctx.fillStyle = `hsla(${200 + v * 60},70%,${20 + v * 40}%,0.8)`;
          ctx.fillRect(x1, H - v * H, Math.max(1, x2 - x1), v * H);
        }
      }

      // EQ curve
      ctx.beginPath();
      ctx.strokeStyle = '#f5c542';
      ctx.lineWidth = 2 * devicePixelRatio;
      let first = true;
      for (let px = 0; px <= W; px += 2) {
        const f = 20 * Math.pow(1000, px / W);
        const y = this._curveAt(f, W, H);
        first ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
        first = false;
      }
      ctx.stroke();

      // Fill under curve
      ctx.lineTo(W, y0); ctx.lineTo(0, y0); ctx.closePath();
      ctx.fillStyle = 'rgba(245,197,66,0.08)';
      ctx.fill();

      // Band handles
      const handles = [
        { band: 'low',  f: 250,  color: '#89dceb' },
        { band: 'mid',  f: 2500, color: '#cba6f7' },
        { band: 'high', f: 8000, color: '#f38ba8' },
      ];
      for (const h of handles) {
        const hx = this._freqToX(h.f, W);
        const hy = this._curveAt(h.f, W, H);
        ctx.beginPath();
        ctx.arc(hx, hy, 7 * devicePixelRatio, 0, Math.PI * 2);
        ctx.fillStyle = h.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5 * devicePixelRatio;
        ctx.stroke();
        // Label
        const db = this._bands[h.band];
        ctx.fillStyle = '#fff';
        ctx.font = `${9 * devicePixelRatio}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, hx, hy - 12 * devicePixelRatio);
      }
    };
    draw();
  }

  _setupDrag(canvas) {
    const HANDLES = [
      { band: 'low',  f: 250  },
      { band: 'mid',  f: 2500 },
      { band: 'high', f: 8000 },
    ];

    canvas.addEventListener('mousedown', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * devicePixelRatio;
      const my = (e.clientY - rect.top)  * devicePixelRatio;
      const W = canvas.width, H = canvas.height;

      for (const h of HANDLES) {
        const hx = this._freqToX(h.f, W);
        const hy = this._curveAt(h.f, W, H);
        if (Math.hypot(mx - hx, my - hy) < 14 * devicePixelRatio) {
          this._drag = { band: h.band, startY: e.clientY, startDb: this._bands[h.band] };
          e.preventDefault();
          break;
        }
      }
    });

    const onMove = e => {
      if (!this._drag) return;
      const { band, startY, startDb } = this._drag;
      const dPx  = startY - e.clientY;
      const dDb  = dPx / (canvas.getBoundingClientRect().height / 24);
      const db   = Math.max(-12, Math.min(12, Math.round((startDb + dDb) * 2) / 2));
      this._bands[band] = db;
      try { this._eq[band].value = db; } catch (_) {}
    };

    const onUp = () => { this._drag = null; };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    this._dragCleanup = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }

  _destroyCore() {
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this._dragCleanup?.();
    try { this._analyser?.dispose(); } catch (_) {}
    this._analyser = null;
  }

  _setband(key, db) {
    this._bands[key] = db;
    try { this._eq[key].value = db; } catch (_) {}
    if (!this._history?.restoring) this._history?.commit();
    return this;
  }

  low(db)  { return this._setband('low',  db); }
  mid(db)  { return this._setband('mid',  db); }
  high(db) { return this._setband('high', db); }

  connect(dest)   { try { this._eq.connect(dest);   } catch (_) {} return this; }
  disconnect()    { try { this._eq.disconnect();     } catch (_) {} return this; }
  toDestination() { try { this._eq.toDestination();  } catch (_) {} return this; }
  chain(...nodes) { try { this._eq.chain(...nodes);  } catch (_) {} return this; }

  hide() { const w = document.getElementById(this._winId); if (w) w.style.display = 'none'; return this; }
  show() { const w = document.getElementById(this._winId); if (w) w.style.display = '';     return this; }

  _destroy() {
    this._destroyCore();
    const w = document.getElementById(this._winId);
    if (w && w.isConnected) w.querySelector('.wm-close')?.click();
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

// Register teardown with the reset registry (ADR 008).
onReset(cleanupViz);
