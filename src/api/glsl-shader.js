// WebGL/GLSL shader — same API surface as Shader (WebGPU/WGSL).
// Use when: porting ShaderToy code, running on browsers without WebGPU (Firefox/older Safari),
// or when an LLM generates GLSL because it has a much larger GLSL training corpus.

import { resolveGLSL, defineGLSL, library } from './library.js';
import { resolveDrawable } from './drawable-source.js';
import { liveOutput } from '../runtime/keep-alive.js';
import { mountLayerCanvas } from './layer.js';
import { onReset } from '../runtime/reset-registry.js';
import { notify } from '../events/index.js';
import { registerShaderInstance } from './shader.js';
import { acquireMicRunScoped } from './media-lease.js';

const _glShaders = [];

let _glShaderIdCounter = 0;

export function cleanupGLShaders() {
  for (const s of _glShaders) s._destroy();
  _glShaders.length = 0;
}

// GLSL fragment-body presets (analogous to SHADER_PRESETS in shader.js)
export const GLSL_PRESETS = {
  gradient: `  gl_FragColor = vec4(uv.x, uv.y, sin(uTime)*0.5+0.5, 1.0);`,
  plasma:   `  float r = sin(uv.x*6.28+uTime)*0.5+0.5;
  float g = sin(uv.y*6.28+uTime*1.3)*0.5+0.5;
  float b = sin((uv.x+uv.y)*6.28+uTime*0.7)*0.5+0.5;
  gl_FragColor = vec4(r, g, b, 1.0);`,
  waves:    `  float wave = sin(uv.x*20.0+uTime*3.0)*0.15;
  float mask = smoothstep(0.02,0.0,abs(uv.y-0.5-wave));
  gl_FragColor = vec4(0.2,0.6,1.0,mask);`,
  circles:  `  float d = length(uv-vec2(0.5));
  float r = sin(d*30.0-uTime*4.0)*0.5+0.5;
  gl_FragColor = vec4(r, r*0.5, 1.0-r, 1.0);`,
  noise:    `  vec2 p = uv*8.0+uTime;
  float n = fract(sin(p.x*127.1+p.y*311.7)*43758.5);
  gl_FragColor = vec4(n, n*0.8, n*0.6, 1.0);`,
};

// GLSL camera/video effect presets (same effects as CAMERA_PRESETS in shader.js)
export const GLSL_CAMERA_PRESETS = {
  greyscale:    `  vec4 c = texture2D(uVideo,uv); float g=dot(c.rgb,vec3(0.299,0.587,0.114)); gl_FragColor=vec4(vec3(g),1.0);`,
  invert:       `  vec4 c = texture2D(uVideo,uv); gl_FragColor=vec4(1.0-c.rgb,1.0);`,
  channel_swap: `  vec4 c = texture2D(uVideo,uv); gl_FragColor=vec4(c.g,c.b,c.r,1.0);`,
  posterize:    `  vec4 c = texture2D(uVideo,uv); float s=4.0; gl_FragColor=vec4(floor(c.rgb*s)/s,1.0);`,
  scanlines:    `  vec4 c = texture2D(uVideo,uv); float sc=step(0.5,fract(uv.y*180.0)); gl_FragColor=vec4(c.rgb*sc,1.0);`,
};

// ── GLSL source classification ───────────────────────────────────────────────

function _isFullGLSL(src) {
  return /void\s+main\s*\(/.test(src) || /^#version/.test(src.trimStart());
}

function _isShaderToy(src) {
  // ShaderToy: void mainImage(out vec4 fragColor, in vec2 fragCoord)
  return /void\s+mainImage\s*\(/.test(src);
}

// ── GLSL source assembly ─────────────────────────────────────────────────────

const VERT_GLSL = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const UNIFORM_HEADER = `precision highp float;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uTime;
uniform vec4 uCustom;
`;

function _wrapFragBody(body, hasVideo = false) {
  const videoLine = hasVideo ? 'uniform sampler2D uVideo;\n' : '';
  const colLine   = hasVideo ? '  vec4 col = texture2D(uVideo, uv);\n' : '';
  return `${UNIFORM_HEADER}${videoLine}void main() {
  vec2 uv   = gl_FragCoord.xy / uResolution;
  float time  = uTime;
  vec2 mouse  = uMouse;
  vec4 custom = uCustom;
${colLine}${body}
}`;
}

// ShaderToy shaders define mainImage(out vec4, in vec2) — wrap to call from main()
function _wrapShaderToy(body) {
  return `${UNIFORM_HEADER}${body}
void main() {
  mainImage(gl_FragColor, gl_FragCoord.xy);
}`;
}

// ── Audio FFT helper (mirrors shader.js _readShaderFft) ──────────────────────

function _readFft(src, bins = 32) {
  const node = src === 'mic' ? window.__ar_mic_analyser : src;
  if (!node) return new Float32Array(bins);
  const out = new Float32Array(bins);
  if (typeof node.getValue === 'function') {
    const raw = node.getValue();
    const step = raw.length / bins;
    for (let i = 0; i < bins; i++) {
      const db = raw[Math.floor(i * step)];
      out[i] = isFinite(db) ? Math.max(0, (db + 80) / 80) : 0;
    }
  } else if (node.frequencyBinCount) {
    const data = new Uint8Array(node.frequencyBinCount);
    node.getByteFrequencyData(data);
    const step = data.length / bins;
    for (let i = 0; i < bins; i++) out[i] = data[Math.floor(i * step)] / 255;
  }
  return out;
}

// ── GLShader class ───────────────────────────────────────────────────────────

export class GLShader {
  constructor(fragBody, { z = 30, opacity = 1.0, video = null, container = null } = {}) {
    this._id       = `glsl-${++_glShaderIdCounter}`;
    this._fragSrc  = resolveGLSL(fragBody);
    this._z        = z;
    this._opacity  = opacity;
    this._videoSrc = video;
    this._container = container;

    this._canvas  = null;
    this._gl      = null;
    this._program = null;
    this._rafId   = null;
    this._startTime = null;
    this._custom  = new Float32Array(4);
    this._videoTex = null;

    this._boundSignal   = null;
    this._boundAnalyser = null;

    _glShaders.push(this);
    registerShaderInstance(this._id, this); // register in shared shader registry for event bus commands
  }

  // ── Video source resolution ──────────────────────────────────────────────

  _resolveVideoSrc() {
    // Shared object-form resolver (ADR 006); `?? this._videoSrc` keeps the old
    // permissive passthrough for exotic GPU-uploadable sources (ImageBitmap…).
    return resolveDrawable(this._videoSrc) ?? this._videoSrc ?? null;
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  _init() {
    const { canvas, resizeObserver } = mountLayerCanvas({
      z: this._z, opacity: this._opacity, container: this._container,
      onResize: (w, h) => this._gl?.viewport(0, 0, w, h),
    });
    this._canvas = canvas;
    this._resizeObserver = resizeObserver;

    this._gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!this._gl) throw new Error('WebGL not supported in this browser');

    this._compilePipeline();
  }

  // ── Shader compilation ───────────────────────────────────────────────────

  _compileShader(type, src) {
    const gl = this._gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      notify('shader:error', { id: this._id, error: info, line: null });
      throw new Error(`GLShader compile error:\n${info}`);
    }
    return s;
  }

  _compilePipeline() {
    const gl = this._gl;
    const hasVideo = !!this._videoSrc;

    let fragSrc;
    if (_isShaderToy(this._fragSrc)) {
      fragSrc = _wrapShaderToy(this._fragSrc);
    } else if (_isFullGLSL(this._fragSrc)) {
      fragSrc = this._fragSrc;
    } else {
      fragSrc = _wrapFragBody(this._fragSrc, hasVideo);
    }

    const vert = this._compileShader(gl.VERTEX_SHADER, VERT_GLSL);
    const frag = this._compileShader(gl.FRAGMENT_SHADER, fragSrc);

    this._program = gl.createProgram();
    gl.attachShader(this._program, vert);
    gl.attachShader(this._program, frag);
    gl.linkProgram(this._program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(this._program, gl.LINK_STATUS)) {
      const linkInfo = gl.getProgramInfoLog(this._program);
      notify('shader:error', { id: this._id, error: linkInfo, line: null });
      throw new Error(`GLShader link error: ${linkInfo}`);
    }
    notify('shader:compile', { id: this._id, type: 'glsl' });

    // Full-screen triangle (same topology as WGSL Shader)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this._program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Cache uniform locations
    gl.useProgram(this._program);
    this._uResolution = gl.getUniformLocation(this._program, 'uResolution');
    this._uMouse      = gl.getUniformLocation(this._program, 'uMouse');
    this._uTime       = gl.getUniformLocation(this._program, 'uTime');
    this._uCustom     = gl.getUniformLocation(this._program, 'uCustom');
    this._uVideo      = gl.getUniformLocation(this._program, 'uVideo');

    // Video texture
    if (hasVideo) {
      this._videoTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._videoTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // ── Video frame upload ───────────────────────────────────────────────────

  _copyVideoFrame() {
    const src = this._resolveVideoSrc();
    if (!src || !this._videoTex) return;
    if (src instanceof HTMLVideoElement && src.readyState < 2) return;
    const gl = this._gl;
    gl.bindTexture(gl.TEXTURE_2D, this._videoTex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (_) {}
  }

  // ── Uniforms ─────────────────────────────────────────────────────────────

  _writeUniforms(time) {
    if (this._boundSignal) {
      const s = this._boundSignal;
      this._custom[0] = s.value ?? 0;
      this._custom[1] = s.bass  ?? 0;
      this._custom[2] = s.mid   ?? 0;
      this._custom[3] = s.high  ?? 0;
    } else if (this._boundAnalyser) {
      const bins = 32;
      const fft  = _readFft(this._boundAnalyser, bins);
      const avg  = (s, e) => { let sum = 0; for (let i = s; i < e; i++) sum += fft[i]; return sum / (e - s) || 0; };
      const e    = Math.floor(bins * 0.1), m = Math.floor(bins * 0.5);
      this._custom[0] = avg(0, bins);
      this._custom[1] = avg(0, e);
      this._custom[2] = avg(e, m);
      this._custom[3] = avg(m, bins);
    }

    const gl = this._gl;
    const c  = this._canvas;
    const mo = window.__ar_shaderMouse ?? { x: 0, y: 0 };
    if (this._uResolution) gl.uniform2f(this._uResolution, c.width, c.height);
    if (this._uMouse)      gl.uniform2f(this._uMouse, mo.x / c.width, mo.y / c.height);
    if (this._uTime)       gl.uniform1f(this._uTime, time);
    if (this._uCustom)     gl.uniform4fv(this._uCustom, this._custom);
    if (this._videoTex && this._uVideo) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._videoTex);
      gl.uniform1i(this._uVideo, 0);
    }
  }

  // ── Render loop ──────────────────────────────────────────────────────────

  _frame(ts) {
    if (!this._startTime) this._startTime = ts;
    const gl = this._gl;
    if (this._videoSrc) this._copyVideoFrame();
    gl.useProgram(this._program);
    this._writeUniforms((ts - this._startTime) / 1000);
    gl.viewport(0, 0, this._canvas.width, this._canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ── Public API (mirrors Shader) ──────────────────────────────────────────

  start() {
    this._live = liveOutput(this);
    if (!this._gl) {
      try { this._init(); } catch (e) {
        console.error('GLShader error:', e.message);
        this._live?.release();
        return this;
      }
    }
    if (this._rafId) return this;
    const loop = (ts) => {
      if (!window.__ar_paused) this._frame(ts);
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
    notify('shader:start', { id: this._id });
    return this;
  }

  stop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
      notify('shader:stop', { id: this._id });
    }
    return this;
  }

  video(src) { this._videoSrc = src; return this; }

  set(indexOrArray, value) {
    if (Array.isArray(indexOrArray)) {
      for (let i = 0; i < 4; i++) this._custom[i] = indexOrArray[i] ?? 0;
    } else {
      this._custom[indexOrArray] = value;
    }
    notify('shader:uniform', { id: this._id, key: indexOrArray, value });
    return this;
  }

  bind(source) {
    if (source && typeof source.bass !== 'undefined') {
      this._boundSignal   = source;
      this._boundAnalyser = null;
    } else {
      if (source === 'mic') acquireMicRunScoped();
      this._boundSignal   = null;
      this._boundAnalyser = source;
    }
    return this;
  }

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

  get canvas() { return this._canvas; }

  _destroy() {
    this.stop();
    this._live?.release();
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this._gl) {
      if (this._videoTex) this._gl.deleteTexture(this._videoTex);
      if (this._program)  this._gl.deleteProgram(this._program);
    }
    this._canvas?.remove();
    this._canvas = null;
    this._gl     = null;
    this._program = null;
    this._videoTex = null;
  }

  // Save a named GLSL body to the user library — persists across projects.
  // Equivalent to library.glsl(name, body).
  static define(name, body) {
    library.glsl(name, body);
  }
}

// Register teardown with the reset registry (ADR 008).
onReset(cleanupGLShaders);
