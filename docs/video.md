# Video Signals

Sample pixel regions from any canvas or video source as live numeric signals — then drive audio, shaders, or visual effects from them.

---

## `video.signal(source, opts?)`

Returns a live signal object that continuously samples a region.

```js
const sig = video.signal('camera', { x: 0.5, y: 0.5, radius: 0.05, fps: 30 });
```

**source** — `'camera'` | `HTMLCanvasElement` | `HTMLVideoElement`

**opts:**

| Option | Default | Description |
|--------|---------|-------------|
| `x` | `0.5` | Normalized horizontal center of sample region (0–1) |
| `y` | `0.5` | Normalized vertical center (0–1) |
| `radius` | `0.05` | Half-size of sample region (normalized) |
| `fps` | `30` | Sample rate |

**Signal getters:**

| Property | Range | Description |
|----------|-------|-------------|
| `sig.brightness` | 0–1 | Weighted luminance (0.299R + 0.587G + 0.114B) |
| `sig.r` | 0–1 | Mean red channel |
| `sig.g` | 0–1 | Mean green channel |
| `sig.b` | 0–1 | Mean blue channel |
| `sig.hue` | 0–360 | Dominant hue in degrees |
| `sig.motion` | 0–1 | Pixel difference from previous frame |

**`sig.stream(fn)`** — calls `fn(sig)` every animation frame (RAF). Cleaned up automatically on Stop.

---

## `video.onMotion(sourceOrSig, threshold, onEnter, onExit?, opts?)`

Edge-triggered motion detector. `onEnter` fires when `sig.motion >= threshold`; `onExit` fires when it drops below.

```js
video.onMotion('camera', 0.25, () => draw.bg('red'), () => draw.bg('black'));
```

Pass an existing signal object to reuse its sampling interval:

```js
const sig = video.signal('camera', { x: 0.3, y: 0.3 });
video.onMotion(sig, 0.2, () => audio.kick());
```

---

## `video.onBrightness(sourceOrSig, threshold, onEnter, onExit?, opts?)`

Edge-triggered brightness detector.

```js
video.onBrightness('camera', 0.6, () => draw.bg('white'), () => draw.bg('black'));
```

---

## Examples

### Map camera brightness to synth filter cutoff

```js
const filter = audio.filter(800);
const s = audio.synth().connect(filter);
s.play('C3');

const sig = video.signal('camera');
sig.stream(() => {
  filter.frequency.value = 200 + sig.brightness * 4000;
});
```

### Motion-trigger drum hit

```js
const kick = audio.sampler({ kick: '/samples/kick.wav' });
kick.connect(audio.out());

video.onMotion('camera', 0.3, () => kick.play('kick'));
```

### Hue → shader custom uniform

```js
const shader = new Shader(`
  let c = custom.x;
  return vec4f(c, 0.5, 1.0 - c, 1.0);
`);
shader.start();

const sig = video.signal('camera');
sig.stream(() => {
  shader.set(sig.hue / 360);
});
```

### Sample multiple regions

```js
const left  = video.signal('camera', { x: 0.2, radius: 0.1 });
const right = video.signal('camera', { x: 0.8, radius: 0.1 });

setInterval(() => {
  const diff = left.brightness - right.brightness;
  draw.clear().bg('#111');
  draw.circle(800 + diff * 600, 450, 40, 'cyan');
}, 16);
```
