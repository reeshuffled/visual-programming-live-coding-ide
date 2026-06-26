// render-pipeline.js — fluent visual render pipeline.
// pipe(source).ascii(opts).glshader(body).show(title, opts)
//
// Every stage exposes:
//   ._getSource()  → HTMLCanvasElement | HTMLVideoElement (drawable for downstream)
//   .read()        → pull upstream + render this frame (canvas stages only; shader stages self-raf)
//   ._start()      → init canvas / shader (called once when pipeline starts)
//   ._destroy()    → teardown
//
// Shader stages (._isShader = true) self-raf via GLShader/Shader — the pipeline
// driver only calls read() on canvas stages.

import { resolveDrawable, _isCanvas, _isVideo } from './drawable-source.js';
import { liveOutput } from '../runtime/keep-alive.js';
import { onReset } from '../runtime/reset-registry.js';
import { notify, registerCommand } from '../events/index.js';

const _pipelines = [];
const _stageRegistry = new Map(); // stageId → stage instance

// ── Helpers ───────────────────────────────────────────────────────────────────
// Source resolution + duck-type helpers live in drawable-source.js (ADR 006).
// _srcWidth/_srcHeight are pipeline-specific sizing helpers, kept local.

function _srcWidth(src) {
  return src.videoWidth ?? src.width ?? 800;
}
function _srcHeight(src) {
  return src.videoHeight ?? src.height ?? 600;
}

function _makeHiddenDiv() {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:800px;height:600px;overflow:hidden;pointer-events:none;';
  document.body.appendChild(div);
  return div;
}

// ── Source — named lazy sources for pipe() ────────────────────────────────────
// Sentinel descriptors resolved at pipeline start. Enables pipe(Source.camera)
// without an explicit await at the call site.
export const Source = Object.freeze({
  camera: Object.freeze({ _src: 'camera' }),
});

// ── InputAdapter ──────────────────────────────────────────────────────────────
// Head of every pipeline — wraps any supported source, including Promises.

class InputAdapter {
  constructor(input) {
    this._promise  = input instanceof Promise ? input : null;
    this._src      = this._promise ? null : resolveDrawable(input);
    this._isShader = false;
    if (!this._promise && !this._src) {
      throw new Error(
        'pipe(): unsupported source — pass Source.camera, a CameraStream, ' +
        'HTMLCanvasElement, HTMLVideoElement, GLShader, Shader, or Layer.'
      );
    }
  }
  async _resolve() {
    if (this._promise) this._src = resolveDrawable(await this._promise);
  }
  _getSource() { return this._src; }
  _start()     {}
  read()       {}
  _destroy()   {}
}

// ── AsciiStage ────────────────────────────────────────────────────────────────
// Downsamples upstream to cols×rows, computes per-cell luma (same weights as
// draw.toASCII), then renders glyphs to a canvas via fillText.

class AsciiStage {
  constructor(upstream, opts = {}) {
    this._upstream = upstream;
    this._cols    = opts.cols    ?? 80;
    this._rows    = opts.rows    ?? Math.round((opts.cols ?? 80) / 2.5);
    this._charset = opts.charset ?? ' .:-=+*#%@';
    this._bg      = opts.bg     ?? '#000';
    this._color   = opts.color  ?? '#0f0';
    this._cellW   = opts.cellW  ?? 8;
    this._cellH   = opts.cellH  ?? 14;
    this._canvas    = document.createElement('canvas');
    this._ctx       = null;
    this._offCanvas = document.createElement('canvas');
    this._offCtx    = null;
    this._isShader  = false;
  }

  _start() {
    const { _cols: cols, _rows: rows, _cellW: cw, _cellH: ch } = this;
    this._canvas.width  = cols * cw;
    this._canvas.height = rows * ch;
    this._ctx = this._canvas.getContext('2d');
    this._ctx.font         = `${ch}px monospace`;
    this._ctx.textAlign    = 'left';
    this._ctx.textBaseline = 'top';

    this._offCanvas.width  = cols;
    this._offCanvas.height = rows;
    this._offCtx = this._offCanvas.getContext('2d');
  }

  read() {
    if (!this._ctx) return;
    const src = this._upstream._getSource();
    if (_isVideo(src) && src.readyState < 2) return;

    const { _cols: cols, _rows: rows, _cellW: cw, _cellH: ch,
            _charset: charset, _bg: bg, _color: color } = this;

    this._offCtx.drawImage(src, 0, 0, cols, rows);
    const px = this._offCtx.getImageData(0, 0, cols, rows).data;

    const ctx = this._ctx;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
    ctx.fillStyle = color;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = (row * cols + col) * 4;
        const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
        const glyph = charset[Math.min(charset.length - 1, Math.floor(lum * charset.length))];
        if (glyph !== ' ') ctx.fillText(glyph, col * cw, row * ch);
      }
    }
  }

  set(props) {
    if (props.color   !== undefined) this._color   = props.color;
    if (props.bg      !== undefined) this._bg      = props.bg;
    if (props.charset !== undefined) this._charset = props.charset;
  }

  _getSource() { return this._canvas; }
  get canvas()  { return this._canvas; }

  _destroy() {
    this._canvas.remove();
    this._offCanvas.remove();
    this._ctx  = null;
    this._offCtx = null;
  }
}

// ── PixelateStage ─────────────────────────────────────────────────────────────
// Reuses the draw.pixelate downscale/upscale trick for a mosaic effect.

class PixelateStage {
  constructor(upstream, opts = {}) {
    this._upstream  = upstream;
    this._blockSize = opts.blockSize ?? opts ?? 8;
    if (typeof this._blockSize !== 'number') this._blockSize = 8;
    this._canvas    = document.createElement('canvas');
    this._ctx       = null;
    this._offCanvas = document.createElement('canvas');
    this._offCtx    = null;
    this._isShader  = false;
  }

  _start() {
    const src = this._upstream._getSource();
    const w = _srcWidth(src), h = _srcHeight(src);
    this._canvas.width  = w;
    this._canvas.height = h;
    this._ctx = this._canvas.getContext('2d');
    const pw = Math.max(1, Math.round(w / this._blockSize));
    const ph = Math.max(1, Math.round(h / this._blockSize));
    this._offCanvas.width  = pw;
    this._offCanvas.height = ph;
    this._offCtx = this._offCanvas.getContext('2d');
  }

  read() {
    if (!this._ctx) return;
    const src = this._upstream._getSource();
    if (_isVideo(src) && src.readyState < 2) return;
    this._offCtx.drawImage(src, 0, 0, this._offCanvas.width, this._offCanvas.height);
    this._ctx.imageSmoothingEnabled = false;
    this._ctx.drawImage(this._offCanvas, 0, 0, this._canvas.width, this._canvas.height);
    this._ctx.imageSmoothingEnabled = true;
  }

  set(props) {
    if (props.blockSize !== undefined) this._blockSize = props.blockSize;
  }

  _getSource() { return this._canvas; }
  get canvas()  { return this._canvas; }

  _destroy() {
    this._canvas.remove();
    this._offCanvas.remove();
    this._ctx = null;
    this._offCtx = null;
  }
}

// ── FxStage ───────────────────────────────────────────────────────────────────
// Applies a CSS filter string (blur/hue-rotate/invert/saturate/etc.) to upstream.

class FxStage {
  constructor(upstream, filter) {
    this._upstream = upstream;
    this._filter   = filter;
    this._canvas   = document.createElement('canvas');
    this._ctx      = null;
    this._isShader = false;
  }

  _start() {
    const src = this._upstream._getSource();
    this._canvas.width  = _srcWidth(src);
    this._canvas.height = _srcHeight(src);
    this._ctx = this._canvas.getContext('2d');
  }

  read() {
    if (!this._ctx) return;
    const src = this._upstream._getSource();
    if (_isVideo(src) && src.readyState < 2) return;
    this._ctx.filter = this._filter;
    this._ctx.drawImage(src, 0, 0, this._canvas.width, this._canvas.height);
    this._ctx.filter = 'none';
  }

  set(props) {
    if (props.filter !== undefined) this._filter = props.filter;
  }

  _getSource() { return this._canvas; }
  get canvas()  { return this._canvas; }

  _destroy() {
    this._canvas.remove();
    this._ctx = null;
  }
}

// ── GLShaderStage ─────────────────────────────────────────────────────────────
// Wraps GLShader (WebGL/GLSL). Self-rafs — pipeline loop does not call read().
// When used as a terminal stage with a sink container, the shader canvas mounts
// directly inside it. Otherwise, uses a hidden div so its canvas can be sampled
// by downstream stages.

class GLShaderStage {
  constructor(upstream, fragBody, opts = {}) {
    this._upstream      = upstream;
    this._fragBody      = fragBody;
    this._opts          = opts;
    this._shaderInst    = null;
    this._hiddenDiv     = null;
    this._sinkContainer = null; // set by Pipeline._mountInContainer when terminal
    this._isShader      = true;
    this._owned         = true; // false when caller passes a pre-created instance
  }

  _start() {
    const upstream = this._upstream._getSource();
    // Accept a pre-created GLShader instance (object, not a body string/fn)
    if (this._fragBody !== null && typeof this._fragBody === 'object') {
      this._shaderInst = this._fragBody;
      this._owned = false;
      this._shaderInst.video(upstream).start();
      return;
    }
    const GLShaderCls = window.GLShader;
    if (!GLShaderCls) throw new Error('pipe().glshader(): GLShader not available on window.');
    const container = this._sinkContainer ?? (this._hiddenDiv = _makeHiddenDiv());
    this._shaderInst = new GLShaderCls(this._fragBody, {
      z:       this._opts.z       ?? 0,
      opacity: this._opts.opacity ?? 1,
      container,
    });
    this._shaderInst.video(upstream).start();
  }

  read()  {}  // GLShader self-rafs

  _getSource() { return this._shaderInst?._canvas ?? null; }
  get canvas()  { return this._shaderInst?._canvas ?? null; }

  _destroy() {
    if (this._owned) this._shaderInst?._destroy?.();
    this._shaderInst = null;
    this._hiddenDiv?.remove();
    this._hiddenDiv = null;
  }
}

// ── ShaderStage ───────────────────────────────────────────────────────────────
// Wraps Shader (WebGPU/WGSL). Same pattern as GLShaderStage.

class ShaderStage {
  constructor(upstream, fragBody, opts = {}) {
    this._upstream      = upstream;
    this._fragBody      = fragBody;
    this._opts          = opts;
    this._shaderInst    = null;
    this._hiddenDiv     = null;
    this._sinkContainer = null;
    this._isShader      = true;
    this._owned         = true;
  }

  _start() {
    const upstream = this._upstream._getSource();
    // Accept a pre-created Shader instance (object, not a body string/fn)
    if (this._fragBody !== null && typeof this._fragBody === 'object') {
      this._shaderInst = this._fragBody;
      this._owned = false;
      this._shaderInst.video(upstream).start();
      return;
    }
    const ShaderCls = window.Shader;
    if (!ShaderCls) throw new Error('pipe().shader(): Shader (WebGPU) not available on window.');
    const container = this._sinkContainer ?? (this._hiddenDiv = _makeHiddenDiv());
    this._shaderInst = new ShaderCls(this._fragBody, {
      z:       this._opts.z       ?? 0,
      opacity: this._opts.opacity ?? 1,
      container,
    });
    this._shaderInst.video(upstream).start();
  }

  read()  {}  // Shader self-rafs

  _getSource() {
    const c = this._shaderInst?.canvas;
    return _isCanvas(c) ? c : null;
  }
  get canvas() { return this._getSource(); }

  _destroy() {
    if (this._owned) {
      this._shaderInst?.stop?.();
      this._shaderInst?._destroy?.();
    }
    this._shaderInst = null;
    this._hiddenDiv?.remove();
    this._hiddenDiv = null;
  }
}

// ── CustomStage ───────────────────────────────────────────────────────────────
// User-supplied stage via pipe().use(factory).
// factory(srcDrawable) called once at start — must return { canvas, read() }.
// srcDrawable is the upstream HTMLCanvasElement or HTMLVideoElement.
// canvas must be an HTMLCanvasElement the factory owns.
// read() is called every raf tick to update the canvas.

class CustomStage {
  constructor(upstream, factory) {
    this._upstream  = upstream;
    this._factory   = factory;
    this._canvas    = null;
    this._userRead  = null;
    this._isShader  = false;
  }

  _start() {
    const src = this._upstream._getSource();
    const result = this._factory(src);
    if (!result || typeof result.read !== 'function' || !result.canvas) {
      throw new Error(
        'pipe().use(factory): factory must return { canvas: HTMLCanvasElement, read() }'
      );
    }
    this._canvas   = result.canvas;
    this._userRead = result.read.bind(result);
  }

  read() {
    if (this._userRead) this._userRead();
  }

  _getSource() { return this._canvas; }
  get canvas()  { return this._canvas; }

  _destroy() {
    this._canvas?.remove?.();
    this._canvas   = null;
    this._userRead = null;
  }
}

// ── SRT Subtitle stage ────────────────────────────────────────────────────────

function _parseSRT(srt) {
  return srt.trim().split(/\n\n+/).map(block => {
    const lines = block.trim().split('\n');
    if (lines.length < 3) return null;
    const m = lines[1].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!m) return null;
    const toSec = s => {
      const [h, mi, rest] = s.split(':');
      const [sec, ms] = rest.split(/[,.]/).map(Number);
      return Number(h) * 3600 + Number(mi) * 60 + sec + ms / 1000;
    };
    return {
      start: toSec(m[1]),
      end:   toSec(m[2]),
      text:  lines.slice(2).join('\n').replace(/<[^>]+>/g, ''),
    };
  }).filter(Boolean);
}

class SubtitleStage {
  constructor(upstream, srtText, opts = {}) {
    this._upstream  = upstream;
    this._cues      = _parseSRT(srtText);
    this._opts      = opts;
    this.canvas     = null;
    this._ctx       = null;
    this._isShader  = false;
  }

  _start() {
    const src       = this._upstream._getSource();
    this.canvas     = document.createElement('canvas');
    this.canvas.width  = _srcWidth(src);
    this.canvas.height = _srcHeight(src);
    this._ctx = this.canvas.getContext('2d');
  }

  _getSource() { return this.canvas; }

  read() {
    const src = this._upstream._getSource();
    if (!src) return;
    const W = _srcWidth(src), H = _srcHeight(src);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W; this.canvas.height = H;
    }
    this._ctx.clearRect(0, 0, W, H);
    this._ctx.drawImage(src, 0, 0, W, H);

    const t   = src.currentTime ?? 0;
    const cue = this._cues.find(c => t >= c.start && t <= c.end);
    if (!cue) return;

    const {
      fontSize  = 28,
      color     = '#fff',
      bg        = 'rgba(0,0,0,0.65)',
      font      = 'sans-serif',
      weight    = 'bold',
      stroke    = true,
      strokeColor = '#000',
      strokeWidth = 1.5,
      marginBottom = 24,
    } = this._opts;

    const ctx    = this._ctx;
    const lines  = cue.text.split('\n');
    const lineH  = fontSize * 1.35;
    const totalH = lines.length * lineH;

    ctx.font        = `${weight} ${fontSize}px ${font}`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'bottom';

    for (let i = 0; i < lines.length; i++) {
      const txt = lines[i];
      const tw  = ctx.measureText(txt).width;
      const tx  = W / 2;
      const ty  = H - marginBottom - (lines.length - 1 - i) * lineH;

      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(tx - tw / 2 - 10, ty - fontSize - 4, tw + 20, fontSize + 10);
      }
      if (stroke) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth   = strokeWidth;
        ctx.strokeText(txt, tx, ty);
      }
      ctx.fillStyle = color;
      ctx.fillText(txt, tx, ty);
    }
  }

  _destroy() {
    this.canvas = null;
    this._ctx   = null;
  }
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export class Pipeline {
  constructor(head) {
    this._head          = head;      // InputAdapter
    this._stages        = [];        // stages added by chain methods
    this._rafId         = null;
    this._sentinel      = {};        // object held in __ar_keepAlive
    this._displayCanvas = null;      // canvas shown to user (for canvas-terminal sinks)
    this._displayCtx    = null;
    _pipelines.push(this);
  }

  // ── Stage chain methods (each returns `this`) ─────────────────────────────

  ascii(opts = {}, id) {
    const stage = new AsciiStage(this._last(), opts);
    stage._id = id ?? `${this._id}-ascii-${this._stages.length}`;
    _stageRegistry.set(stage._id, stage);
    this._stages.push(stage);
    notify('pipe:stage-added', { id: this._id, stageId: stage._id, stage: 'ascii' });
    return this;
  }

  pixelate(opts = {}, id) {
    const stage = new PixelateStage(this._last(), opts);
    stage._id = id ?? `${this._id}-pixelate-${this._stages.length}`;
    _stageRegistry.set(stage._id, stage);
    this._stages.push(stage);
    notify('pipe:stage-added', { id: this._id, stageId: stage._id, stage: 'pixelate' });
    return this;
  }

  fx(filter, id) {
    const stage = new FxStage(this._last(), filter);
    stage._id = id ?? `${this._id}-fx-${this._stages.length}`;
    _stageRegistry.set(stage._id, stage);
    this._stages.push(stage);
    notify('pipe:stage-added', { id: this._id, stageId: stage._id, stage: 'fx' });
    return this;
  }

  glshader(body, opts = {}, id) {
    const stage = new GLShaderStage(this._last(), body, opts);
    stage._id = id ?? `${this._id}-glshader-${this._stages.length}`;
    _stageRegistry.set(stage._id, stage);
    this._stages.push(stage);
    notify('pipe:stage-added', { id: this._id, stageId: stage._id, stage: 'glshader' });
    return this;
  }

  shader(body, opts = {}, id) {
    const stage = new ShaderStage(this._last(), body, opts);
    stage._id = id ?? `${this._id}-shader-${this._stages.length}`;
    _stageRegistry.set(stage._id, stage);
    this._stages.push(stage);
    notify('pipe:stage-added', { id: this._id, stageId: stage._id, stage: 'shader' });
    return this;
  }

  /**
   * Custom stage — escape hatch for arbitrary canvas transforms.
   *
   * @param {function} factory  Called once at start with the upstream drawable
   *   (HTMLCanvasElement or HTMLVideoElement). Must return:
   *   { canvas: HTMLCanvasElement, read() }
   *   where read() is called every raf tick to update the canvas.
   *
   * @example
   * pipe(cam)
   *   .use(src => {
   *     const canvas = document.createElement('canvas');
   *     canvas.width = 800; canvas.height = 600;
   *     const ctx = canvas.getContext('2d');
   *     return {
   *       canvas,
   *       read() {
   *         ctx.filter = 'invert(1)';
   *         ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
   *         ctx.filter = 'none';
   *       }
   *     };
   *   })
   *   .show('Custom', { w: 700, h: 500 });
   */
  use(factory, id) {
    const stage = new CustomStage(this._last(), factory);
    stage._id = id ?? `${this._id}-custom-${this._stages.length}`;
    _stageRegistry.set(stage._id, stage);
    this._stages.push(stage);
    notify('pipe:stage-added', { id: this._id, stageId: stage._id, stage: 'custom' });
    return this;
  }

  /** Overlay SRT subtitles on the upstream source (video or canvas with .currentTime). */
  subtitle(srtText, opts = {}, id) {
    const stage = new SubtitleStage(this._last(), srtText, opts);
    stage._id = id ?? `${this._id}-subtitle-${this._stages.length}`;
    _stageRegistry.set(stage._id, stage);
    this._stages.push(stage);
    notify('pipe:stage-added', { id: this._id, stageId: stage._id, stage: 'subtitle' });
    return this;
  }

  _last() {
    return this._stages.length === 0 ? this._head : this._stages[this._stages.length - 1];
  }

  // ── Sink methods (start the pipeline) ────────────────────────────────────

  /** Spawn a wm window and render the pipeline inside it. */
  show(title, opts = {}) {
    if (opts.id) this._id = opts.id;
    const winId = window.wm?.spawn(title, {
      w: opts.w ?? 700,
      h: opts.h ?? 500,
      html: '',
      onClose: () => this.stop(),
      ...(opts.noChrome    !== undefined ? { noChrome:    opts.noChrome    } : {}),
      ...(opts.transparent !== undefined ? { transparent: opts.transparent } : {}),
    });

    if (winId) {
      const winEl = document.getElementById(winId);
      const body  = winEl?.querySelector('.wm-body');
      if (body) {
        body.style.cssText += ';overflow:hidden;padding:0;margin:0;';
        this._mountInContainer(body);
      }
      notify('pipe:show', { id: this._id, winId, title });
    }

    this.start();
    return this;
  }

  /** Mount pipeline output onto an existing canvas layer at z-index `z`. */
  layer(z) {
    const layerCanvas = window.getCanvas?.(z);
    if (layerCanvas) {
      this._displayCanvas = layerCanvas;
      this._displayCtx    = layerCanvas.getContext('2d');
    }
    this.start();
    return this;
  }

  /** Mount pipeline output into an arbitrary DOM element. */
  to(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (el) this._mountInContainer(el);
    this.start();
    return this;
  }

  /** Start pipeline without any display sink (access output via .canvas). */
  start(opts = {}) {
    if (opts?.id) this._id = opts.id;
    if (this._rafId || this._starting) return this;

    if (this._head._promise) {
      this._starting = true;
      this._head._resolve().then(() => {
        this._starting = false;
        if (!this._stopped) this._doStart();
      });
      return this;
    }

    return this._doStart();
  }

  _doStart() {
    if (this._rafId) return this;

    // Initialise all stages in order
    this._head._start();
    for (const stage of this._stages) stage._start();

    // After all stages are up, size the display canvas to match source output
    if (this._displayCanvas && !(this._displayCanvas === window.getCanvas?.(0))) {
      const src = this._last()._getSource() ?? this._head._getSource();
      if (src) {
        this._displayCanvas.width  = _srcWidth(src);
        this._displayCanvas.height = _srcHeight(src);
      }
    }

    // Register sentinel so the idle watcher treats the pipeline as a live output
    this._live = liveOutput(this._sentinel);

    // Drive canvas stages via raf; shader stages self-raf independently
    const loop = () => {
      if (!window.__ar_paused) {
        for (const stage of this._stages) {
          if (!stage._isShader) stage.read();
        }
        // Blit terminal output to display canvas (canvas-terminal pipelines only)
        if (this._displayCtx) {
          const src = this._last()._getSource() ?? this._head._getSource();
          if (src) {
            this._displayCtx.drawImage(
              src, 0, 0, this._displayCanvas.width, this._displayCanvas.height
            );
          }
        }
      }
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
    notify(`${this._id}:started`, { id: this._id });
    return this;
  }

  stop() {
    this._stopped = true;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._live?.release();
    notify(`${this._id}:stopped`, { id: this._id });
    return this;
  }

  /** The final canvas output of the pipeline (available after start()). */
  get canvas() {
    return this._last()._getSource() ?? this._head._getSource();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _mountInContainer(container) {
    const terminal = this._stages[this._stages.length - 1];
    if (terminal?._isShader) {
      // Shader terminal: render shader canvas directly inside the container —
      // no extra blit step needed. The pipeline raf drives canvas stages upstream.
      terminal._sinkContainer = container;
    } else {
      // Canvas terminal: create a display canvas inside the container and blit
      // the pipeline output to it each frame.
      const dc = document.createElement('canvas');
      dc.style.cssText = 'width:100%;height:100%;display:block;';
      container.appendChild(dc);
      this._displayCanvas = dc;
      this._displayCtx    = dc.getContext('2d');
    }
  }

  _destroy() {
    notify('pipe:destroy', { id: this._id });
    this.stop();
    for (const stage of this._stages) {
      if (stage._id) _stageRegistry.delete(stage._id);
      stage._destroy();
    }
    this._stages = [];
    // Only remove displayCanvas if we created it (not an externally provided layer canvas)
    if (this._displayCanvas && this._displayCanvas !== window.getCanvas?.(0)) {
      this._displayCanvas.remove();
    }
    this._displayCanvas = null;
    this._displayCtx    = null;
  }
}

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Create a new render pipeline from any visual source.
 *
 * @param {typeof Source[keyof typeof Source]|CameraStream|HTMLVideoElement|HTMLCanvasElement|GLShader|Shader|Layer|Promise} source
 * @returns {Pipeline}
 *
 * @example
 * pipe(Source.camera)
 *   .ascii({ cols: 80, color: '#00ff41', bg: '#0d0208' })
 *   .show('ASCII Cam', { w: 700, h: 500 });
 */
let _pipeIdCounter = 0;

export function pipe(source) {
  if (source?._src === 'camera') source = window.Camera?.open();
  const p = new Pipeline(new InputAdapter(source));
  p._id = `pipe-${++_pipeIdCounter}`;
  notify('pipe:create', { id: p._id });
  return p;
}

// ── pipe.register — user-extensible named stages ──────────────────────────────
//
// Registers a named pipeline stage so it becomes:
//   • A chainable method on all Pipeline instances: pipe(cam).myStage(opts)
//   • A draggable toolkit entry in the text editor sidebar
//   • A Blockly block (auto-generated from descriptor.fields) draggable in blocks mode
//
// descriptor:
//   label   — display name (default: name)
//   hint    — tooltip text
//   colour  — Blockly block hue (default: 80)
//   fields  — array of field descriptors for auto-block generation:
//             { name, label?, type: 'number'|'color'|'text'|'boolean', default }
//   code    — custom toolkit snippet (auto-generated if omitted)
//
// The factory receives (srcDrawable, opts) — same as .use() but with opts injected.
// Must return { canvas: HTMLCanvasElement, read() }.
//
// Example:
//   pipe.register('glowAscii', (src, opts = {}) => {
//     const canvas = document.createElement('canvas');
//     canvas.width = 800; canvas.height = 600;
//     const ctx = canvas.getContext('2d');
//     return { canvas, read() { /* draw */ } };
//   }, {
//     label: 'Glow ASCII',
//     hint:  'ASCII art with bloom glow',
//     fields: [
//       { name: 'cols',  label: 'cols',  type: 'number', default: 120 },
//       { name: 'color', label: 'color', type: 'color',  default: '#00ff41' },
//     ],
//   });
//
//   pipe(cam).glowAscii({ cols: 120, color: '#00ff41' }).show('Glow', { w: 700, h: 500 });

function _pipeBlockFieldDef(f) {
  if (f.type === 'number')             return { type: 'field_number', name: f.name, value: f.default ?? 0 };
  if (f.type === 'color' || f.type === 'colour') return { type: 'field_colour', name: f.name, colour: f.default ?? '#ffffff' };
  if (f.type === 'boolean')            return { type: 'field_checkbox', name: f.name, checked: f.default ?? false };
  return                                      { type: 'field_input',  name: f.name, text: String(f.default ?? '') };
}

function _generatePipeBlock(name, label, colour, fields) {
  // Args: %1=camera index, %2..%N+1=user fields, %N+2=title, %N+3=W, %N+4=H
  const fieldMsgs = fields.map((f, i) => `${f.label ?? f.name} %${i + 2}`).join(' ');
  const ti = fields.length + 2; // title arg index
  const sep = fieldMsgs ? ' ' + fieldMsgs : '';
  const definition = {
    type: `pipe_custom_${name}`,
    message0: `pipe camera %1 → ${label}${sep} → window %${ti} %${ti + 1} × %${ti + 2}`,
    args0: [
      { type: 'field_number', name: 'INDEX', value: 0, min: 0, precision: 1 },
      ...fields.map(_pipeBlockFieldDef),
      { type: 'field_input',  name: 'TITLE', text: label },
      { type: 'field_number', name: 'W', value: 700, min: 100 },
      { type: 'field_number', name: 'H', value: 500, min: 100 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour,
    tooltip: `${label} pipeline stage`,
  };

  const generator = (b) => {
    const idx = b.getFieldValue('INDEX');
    const opts = {};
    for (const f of fields) {
      const v = b.getFieldValue(f.name);
      opts[f.name] = (f.type === 'number') ? Number(v) : v;
    }
    const title = JSON.stringify(b.getFieldValue('TITLE'));
    const w = b.getFieldValue('W');
    const h = b.getFieldValue('H');
    return (
      `const _cam${idx} = await Camera.open({ index: ${idx} });\n` +
      `pipe(_cam${idx}).${name}(${JSON.stringify(opts)}).show(${title}, { w: ${w}, h: ${h} });\n`
    );
  };

  return { definition, generator };
}

pipe.register = function(name, factory, descriptor = {}) {
  const label   = descriptor.label  ?? name;
  const hint    = descriptor.hint   ?? `pipe().${name}() — custom pipeline stage`;
  const colour  = descriptor.colour ?? 80;
  const fields  = descriptor.fields ?? [];
  const blockType = `pipe_custom_${name}`;

  // 1. Add stage method to all Pipeline instances (persists across resets)
  Pipeline.prototype[name] = function(opts = {}) {
    this._stages.push(new CustomStage(this._last(), (src) => factory(src, opts)));
    return this;
  };

  // 2. Build toolkit snippet
  const optsStr = fields.length
    ? `{ ${fields.map(f => `${f.name}: ${JSON.stringify(f.default ?? '')}`).join(', ')} }`
    : '';
  const code = descriptor.code ??
    `const cam = await Camera.open();\npipe(cam)\n  .${name}(${optsStr})\n  .show('${label}', { w: 700, h: 500 });`;
  const cmd = {
    label,
    code,
    hint,
    blockType,  // enables drag-into-blocks-mode from text toolkit
    tags: ['pipe', name, 'pipeline', 'custom'],
  };

  // 3. Live toolkit panel insertion (updates any currently-open toolkit windows)
  if (window.__ar_addToolkitEntry) {
    window.__ar_addToolkitEntry('Pipeline', cmd);
  }

  // 4. Blockly block + generator (registered even when no fields — allows blockType drag)
  const blockDef = _generatePipeBlock(name, label, colour, fields);

  // 5. Register block via API registry; skip toolkit if already injected live above
  window.registerAPI?.(`_pipe_${name}`, null, {
    category: 'Pipeline',
    toolkit: window.__ar_addToolkitEntry ? [] : [cmd],  // avoid double-add
    blocks: [blockDef],
  });
};

// ── Cleanup (called on every reset via editor-instance.js) ───────────────────

export function cleanupPipelines() {
  for (const p of _pipelines) p._destroy();
  _pipelines.length = 0;
  _stageRegistry.clear();
}

// ── Event bus command handlers ────────────────────────────────────────────────
registerCommand('pipe:destroy', ({ id }) => {
  const p = _pipelines.find(p => p._id === id);
  if (p) p._destroy();
});
registerCommand('pipe:stop', ({ id }) => {
  _pipelines.find(p => p._id === id)?.stop();
});
registerCommand('pipe:start', ({ id }) => {
  _pipelines.find(p => p._id === id)?.start();
});
registerCommand('pipe:stage:set', ({ stageId, ...props }) => {
  _stageRegistry.get(stageId)?.set?.(props);
});
registerCommand('pipe:stage:set-uniform', ({ stageId, name, value }) => {
  const stage = _stageRegistry.get(stageId);
  stage?._shaderInst?.setUniform?.(name, value);
});

// Register teardown with the reset registry (ADR 008).
onReset(cleanupPipelines);
