const _shaders = [];

export function cleanupShaders() {
  for (const s of _shaders) s._destroy();
  _shaders.length = 0;
}

// Track mouse in canvas-space for shader uniforms (module-level, persists across runs)
document.addEventListener("mousemove", (e) => {
  const w = document.getElementById("canvasWrapper");
  if (!w) return;
  const r = w.getBoundingClientRect();
  const ref = w.querySelector("canvas");
  window.__ar_shaderMouse = {
    x: ((e.clientX - r.left) / r.width) * (ref?.width ?? 1600),
    y: ((e.clientY - r.top) / r.height) * (ref?.height ?? 900),
  };
});

// ── Named preset bodies ──────────────────────────────────────────────────────

export const SHADER_PRESETS = {
  gradient: "  let col = vec3f(uv.x, uv.y, sin(time) * 0.5 + 0.5);\n  return vec4f(col, 1.0);",
  plasma:   "  let r = sin(uv.x * 6.28 + time) * 0.5 + 0.5;\n  let g = sin(uv.y * 6.28 + time * 1.3) * 0.5 + 0.5;\n  let b = sin((uv.x + uv.y) * 6.28 + time * 0.7) * 0.5 + 0.5;\n  return vec4f(r, g, b, 1.0);",
  waves:    "  let wave = sin(uv.x * 20.0 + time * 3.0) * 0.15;\n  let mask = smoothstep(0.02, 0.0, abs(uv.y - 0.5 - wave));\n  return vec4f(0.2, 0.6, 1.0, mask);",
  circles:  "  let d = length(uv - vec2f(0.5));\n  let r = sin(d * 30.0 - time * 4.0) * 0.5 + 0.5;\n  return vec4f(r, r * 0.5, 1.0 - r, 1.0);",
  noise:    "  let p = uv * 8.0 + time;\n  let n = fract(sin(p.x * 127.1 + p.y * 311.7) * 43758.5);\n  return vec4f(n, n * 0.8, n * 0.6, 1.0);",
};

export const CAMERA_PRESETS = {
  greyscale:    "  let col = textureSample(video, videoSampler, uv);\n  let g = dot(col.rgb, vec3f(0.299, 0.587, 0.114));\n  return vec4f(vec3f(g), 1.0);",
  invert:       "  let col = textureSample(video, videoSampler, uv);\n  return vec4f(1.0 - col.rgb, 1.0);",
  channel_swap: "  let col = textureSample(video, videoSampler, uv);\n  return vec4f(col.g, col.b, col.r, 1.0);",
  posterize:    "  let col = textureSample(video, videoSampler, uv);\n  let steps = 4.0;\n  return vec4f(floor(col.rgb * steps) / steps, 1.0);",
  scanlines:    "  let col = textureSample(video, videoSampler, uv);\n  let scan = step(0.5, fract(uv.y * 180.0));\n  return vec4f(col.rgb * scan, 1.0);",
};

// ── WGSL templates ──────────────────────────────────────────────────────────

const VERT_WGSL = /* wgsl */ `
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var v = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(v[vi], 0.0, 1.0);
}
`;

// Uniform layout (48 bytes / 12 f32s):
//  [0,1]     res      vec2f
//  [2,3]     mouse    vec2f  (normalized 0–1)
//  [4]       time     f32
//  [5,6,7]   padding
//  [8–11]    custom   vec4f
const UNIFORM_WGSL = /* wgsl */ `
struct U {
  res: vec2f,
  mouse: vec2f,
  time: f32,
  _p1: f32, _p2: f32, _p3: f32,
  custom: vec4f,
}
@group(0) @binding(0) var<uniform> u: U;
`;

// Injected when a video/canvas source is provided (fragment-body mode only)
const VIDEO_WGSL = /* wgsl */ `
@group(0) @binding(1) var video: texture_2d<f32>;
@group(0) @binding(2) var videoSampler: sampler;
`;

function wrapFragBody(body, hasVideo = false) {
  return (
    UNIFORM_WGSL +
    (hasVideo ? VIDEO_WGSL : "") +
    /* wgsl */ `
@fragment
fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let pos    = fragCoord.xy;
  let uv     = pos / u.res;
  let time   = u.time;
  let res    = u.res;
  let mouse  = u.mouse;
  let custom = u.custom;
  ${body}
}`
  );
}

// ── Shader class ────────────────────────────────────────────────────────────

export class Shader {
  constructor(fragmentBodyOrWGSL, { z = 30, opacity = 1.0, video = null } = {}) {
    this._fragSrc = fragmentBodyOrWGSL;
    this._z = z;
    this._opacity = opacity;
    this._canvas = null;
    this._ctx = null;
    this._device = null;
    this._pipeline = null;
    this._uniformBuf = null;
    this._bindGroup = null;
    this._rafId = null;
    this._startTime = null;
    this._custom = new Float32Array(4);

    // Video / texture source
    this._videoSrc = video;
    this._videoTex = null;
    this._videoSampler = null;
    this._videoTexSize = null;

    _shaders.push(this);
  }

  // ── Video source resolution ──────────────────────────────────────────────

  _resolveVideoSrc() {
    const s = this._videoSrc;
    if (!s) return null;
    if (s._canvas instanceof HTMLCanvasElement) return s._canvas; // VideoLayer / ImageLayer
    if (s.element instanceof HTMLVideoElement) return s.element;  // CameraStream
    return s; // raw HTMLVideoElement or HTMLCanvasElement
  }

  _srcSize(src) {
    return [
      src.videoWidth || src.naturalWidth || src.width || 1,
      src.videoHeight || src.naturalHeight || src.height || 1,
    ];
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  async _init() {
    if (!navigator.gpu) throw new Error("WebGPU not supported — use Chrome 113+ or Safari 18+");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter available");
    this._device = await adapter.requestDevice();

    // Create canvas overlaid on the scene
    this._canvas = document.createElement("canvas");
    const wrapper = document.getElementById("canvasWrapper");
    const ref = wrapper?.querySelector("canvas");
    this._canvas.width = ref?.width ?? 1600;
    this._canvas.height = ref?.height ?? 900;
    Object.assign(this._canvas.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      zIndex: String(this._z),
      opacity: String(this._opacity),
      pointerEvents: "none",
    });
    wrapper?.appendChild(this._canvas);

    const format = navigator.gpu.getPreferredCanvasFormat();
    this._ctx = this._canvas.getContext("webgpu");
    this._ctx.configure({ device: this._device, format, alphaMode: "premultiplied" });
    this._format = format;

    this._uniformBuf = this._device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create sampler if a video source is provided
    if (this._videoSrc) {
      this._videoSampler = this._device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
      });
    }

    await this._compilePipeline();
    this._buildBindGroup();
  }

  async _compilePipeline() {
    const isFullShader = /@(fragment|vertex|compute)/.test(this._fragSrc);
    const hasVideo = !!this._videoSrc && !isFullShader;
    const fragWGSL = isFullShader ? this._fragSrc : wrapFragBody(this._fragSrc, hasVideo);
    const wgsl = isFullShader ? fragWGSL : VERT_WGSL + "\n" + fragWGSL;

    this._device.pushErrorScope("validation");
    const shaderModule = this._device.createShaderModule({ code: wgsl });
    const shaderErr = await this._device.popErrorScope();
    if (shaderErr) throw new Error(`Shader compile error: ${shaderErr.message}`);

    this._device.pushErrorScope("validation");
    this._pipeline = this._device.createRenderPipeline({
      layout: "auto",
      vertex: { module: shaderModule, entryPoint: "vs" },
      fragment: {
        module: shaderModule,
        entryPoint: "fs",
        targets: [
          {
            format: this._format,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
    const pipeErr = await this._device.popErrorScope();
    if (pipeErr) throw new Error(`Shader pipeline error: ${pipeErr.message}`);
  }

  _buildBindGroup() {
    const entries = [{ binding: 0, resource: { buffer: this._uniformBuf } }];
    if (this._videoTex && this._videoSampler) {
      entries.push({ binding: 1, resource: this._videoTex.createView() });
      entries.push({ binding: 2, resource: this._videoSampler });
    }
    this._bindGroup = this._device.createBindGroup({
      layout: this._pipeline.getBindGroupLayout(0),
      entries,
    });
  }

  // ── Video texture management ─────────────────────────────────────────────

  _ensureVideoTex() {
    const src = this._resolveVideoSrc();
    if (!src) return;
    const [w, h] = this._srcSize(src);
    if (w < 1 || h < 1) return;

    const sizeChanged =
      !this._videoTexSize ||
      this._videoTexSize[0] !== w ||
      this._videoTexSize[1] !== h;

    if (sizeChanged) {
      this._videoTex?.destroy();
      this._videoTex = this._device.createTexture({
        size: [w, h],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this._videoTexSize = [w, h];
      this._buildBindGroup();
    }
  }

  _copyVideoFrame() {
    const src = this._resolveVideoSrc();
    if (!src) return;

    // Guard: video element not ready
    if (src instanceof HTMLVideoElement && src.readyState < 2) return;

    this._ensureVideoTex();
    if (!this._videoTex) return;

    try {
      this._device.queue.copyExternalImageToTexture(
        { source: src, flipY: false },
        { texture: this._videoTex, colorSpace: "srgb" },
        [this._videoTexSize[0], this._videoTexSize[1]],
      );
    } catch (_) {
      // Source not ready this frame — skip silently
    }
  }

  // ── Uniforms ─────────────────────────────────────────────────────────────

  _writeUniforms(time) {
    const c = this._canvas;
    const m = window.__ar_shaderMouse ?? { x: 0, y: 0 };
    const data = new Float32Array(12);
    data[0] = c.width;
    data[1] = c.height;
    data[2] = m.x / c.width;
    data[3] = m.y / c.height;
    data[4] = time;
    data[8] = this._custom[0];
    data[9] = this._custom[1];
    data[10] = this._custom[2];
    data[11] = this._custom[3];
    this._device.queue.writeBuffer(this._uniformBuf, 0, data);
  }

  // ── Render loop ──────────────────────────────────────────────────────────

  _frame(ts) {
    if (!this._startTime) this._startTime = ts;
    this._writeUniforms((ts - this._startTime) / 1000);

    if (this._videoSrc) this._copyVideoFrame();

    const encoder = this._device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this._ctx.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._bindGroup);
    pass.draw(3);
    pass.end();
    this._device.queue.submit([encoder.finish()]);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  start() {
    (async () => {
      if (!this._device) await this._init();
      if (this._rafId) return;
      window.__ar_keepAlive = window.__ar_keepAlive ?? new Set();
      window.__ar_keepAlive.add(this);
      const loop = (ts) => {
        this._frame(ts);
        this._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);
    })().catch((e) => console.error("Shader error:", e.message));
    return this;
  }

  stop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    return this;
  }

  // Set video / canvas source. Call before start(), or stop()/start() to swap.
  video(src) {
    this._videoSrc = src;
    return this;
  }

  // Set custom uniform — vec4f accessible as `custom` in shader
  set(indexOrArray, value) {
    if (Array.isArray(indexOrArray)) {
      for (let i = 0; i < 4; i++) this._custom[i] = indexOrArray[i] ?? 0;
    } else {
      this._custom[indexOrArray] = value;
    }
    return this;
  }

  get canvas() { return this._canvas; }

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

  _destroy() {
    this.stop();
    window.__ar_keepAlive?.delete(this);
    this._canvas?.remove();
    this._videoTex?.destroy();
    this._uniformBuf?.destroy();
    this._device?.destroy();
    this._device = null;
    this._videoTex = null;
    this._videoSampler = null;
    this._videoTexSize = null;
  }
}

// ── ShaderFX — high-level preset helpers ────────────────────────────────────

export class ShaderFX {
  // ── Factory methods (create, don't start — for composing with .start()/.stop()/etc.) ──

  static cameraShader(effect = 'greyscale') {
    return new Shader(CAMERA_PRESETS[effect] ?? CAMERA_PRESETS.greyscale, { video: window.__ar_video });
  }

  static videoShader(src, effect = 'greyscale') {
    return new Shader(CAMERA_PRESETS[effect] ?? CAMERA_PRESETS.greyscale, { video: src });
  }

  static presetShader(name = 'plasma') {
    return new Shader(SHADER_PRESETS[name] ?? SHADER_PRESETS.plasma);
  }

  static windowShader(name = 'editor', effect = 'greyscale') {
    const SELECTORS = { editor: '.CodeMirror', console: '#console' };
    const src = name === 'canvas'
      ? window.getCanvas(0)
      : window.captureWindow?.(SELECTORS[name] ?? SELECTORS.editor);
    return new Shader(CAMERA_PRESETS[effect] ?? CAMERA_PRESETS.greyscale, { video: src });
  }

  // ── Shorthand (create + start in one call) ──

  static camera(effect = 'greyscale') { return ShaderFX.cameraShader(effect).start(); }
  static video(src, effect = 'greyscale') { return ShaderFX.videoShader(src, effect).start(); }
  static preset(name = 'plasma') { return ShaderFX.presetShader(name).start(); }
  static window(name = 'editor', effect = 'greyscale') { return ShaderFX.windowShader(name, effect).start(); }
}
