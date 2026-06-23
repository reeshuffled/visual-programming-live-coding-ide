# Shader API

WebGPU fragment shaders rendered as fullscreen canvas overlays. Requires Chrome 113+ or Safari 18+.

## Quick Start

```js
const s = new Shader(`
  let col = vec3f(uv.x, uv.y, sin(time) * 0.5 + 0.5);
  return vec4f(col, 1.0);
`);
s.start();
```

You write only the **fragment body** — `return vec4f(r, g, b, a)`. Pre-declared variables:

| Variable | Type | Value |
|----------|------|-------|
| `pos` | `vec2f` | Fragment pixel coords (top-left origin) |
| `uv` | `vec2f` | Normalized 0–1 position (`pos / res`) |
| `time` | `f32` | Seconds since `.start()` |
| `res` | `vec2f` | Canvas resolution in pixels |
| `mouse` | `vec2f` | Mouse position normalized 0–1 |
| `custom` | `vec4f` | User-controlled uniform — set with `.set()` |

---

## API

```js
new Shader(fragmentBody, { z: 30, opacity: 1.0, video: null })
```

| Method | Description |
|--------|-------------|
| `s.start()` | Begin render loop (async — WebGPU init on first call) |
| `s.stop()` | Pause render loop |
| `s.set([r, g, b, a])` | Set all four `custom` channels at once |
| `s.set(index, value)` | Set one channel: `0=x 1=y 2=z 3=w` |
| `s.video(source)` | Set video/canvas source (call before `start()`) |
| `s.opacity(0–1)` | Layer opacity |
| `s.z(n)` | CSS z-index (default 30, above canvas at 20) |

---

## Examples

### Plasma

```js
const s = new Shader(`
  let x = uv.x * 6.28;
  let y = uv.y * 6.28;
  let r = sin(x + time) * 0.5 + 0.5;
  let g = sin(y + time * 1.3) * 0.5 + 0.5;
  let b = sin(x + y + time * 0.7) * 0.5 + 0.5;
  return vec4f(r, g, b, 1.0);
`);
s.start();
```

### Mouse-reactive ring

```js
const s = new Shader(`
  let d = distance(uv, mouse);
  let ring = smoothstep(0.02, 0.0, abs(d - 0.15));
  return vec4f(ring, ring * 0.5, 0.0, ring);
`);
s.start();
```

### Custom uniform — audio-driven

```js
const s = new Shader(`
  let pulse = custom.x;
  let d = distance(uv, vec2f(0.5));
  let glow = exp(-d * (5.0 + pulse * 20.0));
  return vec4f(glow, glow * 0.4, glow * 0.1, glow);
`);
s.start();

// Drive from audio meter each frame
setInterval(() => {
  const db = meter.getValue();
  const amp = isFinite(db) ? Math.pow(10, db / 20) : 0;
  s.set(0, amp);
}, 16);
```

### Layered with canvas

```js
// Canvas draws behind, shader overlays with alpha
const ctx = getCanvas(0).getContext('2d');
ctx.fillStyle = '#111';
ctx.fillRect(0, 0, 1600, 900);

const s = new Shader(`
  let d = distance(uv, vec2f(0.5, 0.5));
  let a = 1.0 - smoothstep(0.0, 0.5, d);
  return vec4f(0.2, 0.6, 1.0, a * 0.6);
`);
s.start();
```

---

## Video / Camera Input

Pass any video or canvas source as `{ video: source }`. Two WGSL bindings are auto-declared:

```wgsl
video        // texture_2d<f32>
videoSampler // sampler (linear)
```

### Video file

```js
const vid = Media.video('https://example.com/clip.mp4');
vid.play();

const s = new Shader(`
  let col = textureSample(video, videoSampler, uv);
  return vec4f(col.rgb, 1.0);
`, { video: vid });
s.start();
```

### Live camera

```js
// Camera must be enabled in the toolbar first
const s = new Shader(`
  let col = textureSample(video, videoSampler, uv);
  let grey = dot(col.rgb, vec3f(0.299, 0.587, 0.114));
  return vec4f(vec3f(grey), 1.0);
`, { video: window.__ar_video });
s.start();
```

### Accepted sources

| Source | Notes |
|--------|-------|
| `Media.video(url)` | VideoLayer — uses its internal canvas |
| `window.__ar_video` | Live camera HTMLVideoElement |
| `HTMLVideoElement` | Any `<video>` element |
| `HTMLCanvasElement` | Any canvas (e.g. `getCanvas(0)`) |

### UV orientation

Video UVs origin is top-left (same as `uv` in fragment body). To flip vertically: `vec2f(uv.x, 1.0 - uv.y)`.

---

## Full WGSL

If your fragment body starts with `@fragment` or `@vertex`, it's treated as complete WGSL and compiled as-is. You handle your own uniforms, vertex shader, and bind groups.

```js
const s = new Shader(`
struct U { res: vec2f, mouse: vec2f, time: f32, _p1: f32, _p2: f32, _p3: f32, custom: vec4f }
@group(0) @binding(0) var<uniform> u: U;

@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var v = array<vec2f,3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(v[vi], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let uv = p.xy / u.res;
  return vec4f(uv, sin(u.time) * 0.5 + 0.5, 1.0);
}
`);
s.start();
```

---

## Notes

- Shaders clean up automatically on Stop/Reset — no manual `.dispose()` needed
- WebGPU requires a secure context (localhost or HTTPS)
- Canvas below the shader (z=0–20) is composited underneath via `alphaMode: "premultiplied"`
