# Visual Live Coding IDE — API Reference

> Compact reference for agents generating code for this IDE. Canvas is 1600×900. All APIs on `window`. User code runs as a plain script (not a module). All timers/listeners/resources auto-cleanup on Stop.

---

## Draw — `draw`

Fluent 2D canvas API on z=0. All methods chainable.

```js
draw.bg(color)                              // fill canvas
draw.clear()                               // clear to transparent
draw.rect(x, y, w, h, color)
draw.circle(x, y, r, color)
draw.arc(x, y, r, startRad, endRad, color)
draw.poly([[x,y],...], color)              // filled polygon
draw.rectStroke(x, y, w, h, color, thickness)
draw.ring(x, y, r, color, thickness)
draw.line(x1, y1, x2, y2, color, thickness)
draw.text(str, x, y, size, color, {font, align, baseline, weight, style,
          stroke, strokeColor, strokeWidth,
          shadow, shadowColor, shadowBlur, shadowX, shadowY,
          gradient}?)                         // gradient: array of CSS colors top→bottom
draw.loadFont(name, url)                    // async — FontFace API, await before draw.text
draw.image(img, x, y, w?, h?)
draw.push() / draw.pop()                   // save/restore transform+alpha+blend
draw.translate(x, y) / draw.rotate(rad) / draw.scale(x, y?)
draw.resetTransform()
draw.alpha(0–1) / draw.blend(mode)         // modes: 'screen' 'multiply' 'lighter' etc.
draw.pixelate(source, blockSize, x?, y?, w?, h?)   // blocky pixelation of any canvas/video
draw.toASCII(canvas, {cols, rows, charset, bg, color}) → { el: <pre>, update(canvas) }
draw.at(z)                                 // switch to layer z (returns same API)
draw.width  // 1600
draw.height // 900
```

### Layers & CSS effects

```js
getCanvas(z?)                         // HTMLCanvasElement at logical z (default 0)
getLayer(z?)                          // Layer object
  .blur(px) .hue(deg) .brightness(n) .saturate(n) .invert(n) .opacity(n)
  .blendMode(mode)                    // CSS mix-blend-mode: 'screen' 'multiply' 'overlay' etc.
  .rotate(deg) .rotateX(deg) .rotateY(deg) .scale(x, y?) .perspective(px)
  .clip('circle(50%)') .reset()
```

Z-order: logical z → CSS z-index `20+z`. Media defaults to CSS 25, Shader to CSS 30.

### Image editing

```js
editImage(source)            // source: canvas | HTMLImageElement | HTMLVideoElement
  .crop(x, y, w, h)
  .rotate(deg)               // canvas expands to fit
  .filter(cssStr)            // 'blur(4px) hue-rotate(90deg)' etc.
  .flipH() / .flipV()
  .blend(other, mode)        // composite with another canvas/EditableImage
  .reset()                   // discard all ops
  .toCanvas()                // → HTMLCanvasElement (cached)
  .draw(drawTarget, x, y, w?, h?)
  .width / .height           // current output dimensions
```

---

## Shader — `new Shader(body, opts?)`

WebGPU fragment shaders. Chrome 113+ / Safari 18+.

Write only the fragment body — pre-declared: `pos` (vec2f px), `uv` (vec2f 0–1), `time` (f32 s), `res` (vec2f), `mouse` (vec2f 0–1), `custom` (vec4f user uniform).

```js
const s = new Shader(`
  let col = vec3f(uv.x, uv.y, sin(time) * 0.5 + 0.5);
  return vec4f(col, 1.0);
`, { z: 30, opacity: 1.0, video: null });

s.start()              // begin render loop
s.stop()               // pause
s.set([r, g, b, a])   // set all custom channels
s.set(index, value)    // set one channel (0=x 1=y 2=z 3=w)
s.video(source)        // set video/canvas source
s.opacity(0–1)
s.z(n)
```

Video input: pass `{ video: source }` in opts. Two WGSL bindings auto-declared: `video` (texture_2d<f32>), `videoSampler` (sampler). Sources: `window.__ar_video` (live camera), any `HTMLVideoElement`, any `HTMLCanvasElement`.

If fragment body starts with `@fragment` or `@vertex` → treated as full WGSL.

**JS arrow function** — compiled to WGSL at runtime via `jsToWGSL`. Destructure from `{ uv, time, mouse, res, custom }`, return `[r, g, b, a]` array:
```js
const s = new Shader(({ uv, time }) => {
  const r = Math.sin(uv.x * 10 + time) * 0.5 + 0.5;
  const g = Math.cos(uv.y * 8  - time) * 0.5 + 0.5;
  return [r, g, 0.5, 1.0];
});
```
The JS form round-trips cleanly to/from Blocks — each expression decomposes into connectable Scratch-style blocks.

---

## GLShader — `new GLShader(body, opts?)`

WebGL/GLSL fragment shaders. Works in **all browsers** (Chrome, Firefox, Safari, mobile).
Use when: porting ShaderToy code, targeting Firefox, or when an LLM generates GLSL.

Same API shape as `Shader`:
```js
const s = new GLShader(`
  // Pre-declared: uv (vec2 0-1), time, mouse, custom
  // Set gl_FragColor to output
  gl_FragColor = vec4(uv.x, uv.y, sin(uTime)*0.5+0.5, 1.0);
`, { z: 30, opacity: 1.0, video: null });

s.start()              // begin render loop
s.stop()               // pause
s.set([r, g, b, a])   // set all custom channels (uCustom)
s.set(index, value)    // set one channel (0=x 1=y 2=z 3=w)
s.video(source)        // set video/canvas source (uVideo sampler2D)
s.bind(audioSignal)    // auto-fill uCustom = [rms, bass, mid, high]
s.opacity(0–1)
s.z(n)
```

**Source detection:**
- Contains `void main()` or `#version` → used as-is (full GLSL program)
- Contains `void mainImage(out vec4, in vec2)` → **ShaderToy mode** — auto-wrapped
- Otherwise → fragment body, auto-wrapped with uniforms

**ShaderToy paste-in** — works with zero changes:
```js
new GLShader(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / uResolution;
  vec3 col = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0,2,4));
  fragColor = vec4(col, 1.0);
}
`).start();
```

**Presets:** `GLSL_PRESETS` — `{ gradient, plasma, waves, circles, noise }` fragment body strings.

---

## PIXI — `pixi`, `Stage`, `PIXI`

PIXI.js v7 — WebGL scene graph. Use for: sprites, particles, text, per-object filters, hit-testing.
Use `Shader`/`GLShader` for full-screen pixel effects. They layer: PIXI z=25, Shader z=30.

```js
// window.pixi  = PIXI.Application
// window.Stage = pixi.stage (root container)
// window.PIXI  = PIXI namespace

// Sprite from URL
const sprite = PIXI.Sprite.from('https://example.com/hero.png');
sprite.anchor.set(0.5);
sprite.x = pixi.screen.width / 2;
sprite.y = pixi.screen.height / 2;
Stage.addChild(sprite);

// Animation loop — tracked, cleaned up on Stop
pixi.tick(delta => {
  sprite.rotation += 0.01;
});

// Graphics
const g = new PIXI.Graphics();
g.beginFill(0xff6600);
g.drawCircle(0, 0, 60);
g.endFill();
g.x = 400; g.y = 225;
Stage.addChild(g);

// Text
const t = new PIXI.Text('hello', new PIXI.TextStyle({ fontSize: 48, fill: '#fff' }));
t.anchor.set(0.5);
Stage.addChild(t);

// Blur filter on any display object
sprite.filters = [new PIXI.filters.BlurFilter()];

// Container (group)
const group = new PIXI.Container();
group.addChild(sprite);
Stage.addChild(group);
```

**Key notes:**
- `pixi.tick(fn)` — preferred over `pixi.ticker.add(fn)`. Tracked for cleanup on Stop.
- `pixi.screen.width/height` — current canvas dimensions (responsive).
- `interactive = true` + `.on('pointerdown', fn)` — per-object click/hover.
- PIXI canvas is transparent, sits at z=25. Draw API (z=0) visible behind it.
- `Stage.removeChildren()` — clear scene. Auto-cleared on Stop.

---

## Audio — `audio`

Tone.js wrapper. `audio.start()` required to begin transport.

### Synths

```js
audio.synth(opts?)    // basic oscillator
audio.poly(opts?)     // polyphonic
audio.fm(opts?)       // FM — rich/metallic
audio.am(opts?)
audio.pluck(opts?)    // Karplus-Strong
audio.kick(opts?)     // membrane — kick/tom
audio.metal(opts?)    // metallic — hi-hats (no note arg)
audio.noise(opts?)    // white noise (no note arg)

s.play(note, dur, time?)   // dur: '8n' '4n' '1n' or seconds
s.attack(note) / s.release()
s.volume(db) / s.connect(fx) / s.chain(fx1, fx2)
```

### Effects

```js
audio.reverb(decay)                      // decay in seconds
audio.delay(time, feedback)
audio.distort(amount)                    // 0–1
audio.chorus(freq, delay, depth)
audio.filter(type, freq, Q)              // 'lowpass' 'highpass' 'bandpass' 'notch'
audio.autoFilter(rate) / audio.vibrato(freq, depth) / audio.tremolo(freq, depth)
audio.pitchShift(semitones) / audio.compressor(threshold, ratio) / audio.eq(low, mid, high)
```

### Patterns (mini-notation)

```js
pat(str, inst?)           // → Pattern (immutable, chainable transforms)
pat(str, (v,t,dur) => {}) // callback form
stack(pat1, pat2, ...)    // layer patterns; .bpm(v).start()

// Notation:
//   spaces=steps  []=group  <>=alternate  *N=repeat  !=replicate  @N=weight
//   ?=degrade(0.5)  ,=simultaneous  {}%N=polymeter  0..7=range  ~/.=rest

// Transforms (return new Pattern):
.fast(n) / .slow(n) / .speed(n)
.rev()                                    // reverse each cycle
.add(semitones)                           // transpose all notes
.gain(v)                                  // velocity scale 0–1
.pan(v)                                   // stereo pan 0–1
.note(scaleArr)                           // map numbers → scale degrees
.euclid(k, n, rot?)                       // Euclidean rhythm with optional rotation
.every(n, fn)                             // apply fn(pat) every N cycles
.off(t, fn)                               // original + t-shifted fn(pat) copy
.jux(fn)                                  // original (pan=0) + fn(pat) (pan=1)
.sometimesBy(p, fn) / .sometimes / .often / .rarely
.degrade() / .degradeBy(p)
.bpm(v)
.start(inst?) / .stop()
```

### Scales & analysis

```js
audio.scale('C4', 'minor')              // → note array. scales: major minor dorian phrygian lydian mixolydian locrian pentatonic blues chromatic
audio.note(scaleArr, degree)            // pick by degree (wraps)
audio.freq('C4')                        // → Hz
audio.bpm(120) / audio.volume(db) / audio.start() / audio.stop() / audio.now()

const meter = audio.meter()             // s.chain(meter) → meter.getValue() returns dB
const fft = audio.analyser(32)          // s.chain(fft) → fft.getValue() returns Float32Array
const lfo = audio.lfo(freq, min, max)   // lfo.connect(s._.frequency)
```

### Audio files

```js
const f = await audio.load(url)         // → AudioFile; await f.ready
const f = await audio.upload()          // file picker → AudioFile
f.play(offset?) / f.pause() / f.stop() / f.seek(t) / f.loop(bool) / f.volume(db)
f.currentTime / f.duration / f.state   // live getters
f.filter(type,freq,Q).reverb(decay).eq(lo,mid,hi).delay(t,fb).pitchShift(semi).distort(amt)
f.onTime(t, fn)                         // callback at playback position t (seconds)
f.waveform({ width, height, color, bg }) // → HTMLCanvasElement with live playhead
f.signal(bins)                          // → live FFT signal { bass, mid, high, stream(fn) }
```

### Master FFT — `audio.fft`

```js
audio.fft.bass / audio.fft.mid / audio.fft.high  // energy bands 0–1
audio.fft.value                                   // dominant bin
audio.fft.fft                                     // Float32Array raw bins
audio.fft.stream(fn)                              // RAF push
```

### Visualizers

```js
const sg   = audio.spectrogram(source, { palette, width, height })  // → { canvas }
const roll = audio.pianoRoll({ z, opacity, speed, midiMin, midiMax })
const eq   = audio.eqWidget({ x, y })  // eq.low/mid/high(dB); synth.chain(eq)
```

### Microphone

```js
const mic = await audio.mic()           // prompts permission; connect to fx or meter
audio.level                             // live 0–1 RMS (mic toolbar toggle must be on)
audio.onLevel(threshold, onEnter, onExit?)   // edge-trigger
audio.onWord(word, fn) / audio.onSpeech(fn)  // Web Speech API (Chrome/Edge)
audio.say(text, opts?)                       // speechSynthesis; opts: voice,rate,pitch,volume,lang
audio.voices()                               // → SpeechSynthesisVoice[]
```

---

## Render Pipeline — `pipe`

Fluent visual pipeline. Each stage exposes a canvas the next stage samples — one shared raf loop, auto-cleanup on reset. No manual `captureWindow`, `wm.spawn`, or `setInterval` needed.

```js
// Source types pipe() accepts:
//   CameraStream  (from Camera.open())
//   HTMLCanvasElement  (getCanvas(z), etc.)
//   HTMLVideoElement
//   GLShader / Shader instance  (.canvas property)
//   Layer  (._canvas property)

const cam = await Camera.open();

pipe(cam)
  .ascii({ cols: 150, color: '#00ff41', bg: '#0d0208' })  // ASCII art stage
  .glshader(`                                               // GLSL post-process
    vec4 a = texture2D(uVideo, uv);
    float l = dot(a.rgb, vec3(.299,.587,.114));
    vec3 rain = .5+.5*cos(6.28*(uv.y+time*.4+vec3(0,.33,.67)));
    gl_FragColor = vec4(rain*l, 1.);
  `)
  .show('ASCII Cam', { w: 700, h: 500 });  // spawns wm window
```

### Stage methods (chainable, return `this`)

```js
.ascii({ cols, rows, charset, bg, color, cellW, cellH })
  // Render glyphs to canvas. Default charset: ' .:-=+*#%@'.
  // Luma weights match draw.toASCII (0.299/0.587/0.114).

.pixelate({ blockSize })
  // Mosaic effect — downscale then upscale without smoothing.

.fx(cssFilterString)
  // CSS filter on upstream: 'blur(4px)', 'hue-rotate(90deg) saturate(2)', 'invert(1)', etc.

.glshader(fragBody, { z, opacity })
  // WebGL/GLSL stage. uVideo samples upstream canvas. Same syntax as new GLShader(body).

.shader(fragBody, { z, opacity })
  // WebGPU/WGSL stage. Same syntax as new Shader(body).

.subtitle(srtText, {
    fontSize, color, bg, font, weight,
    stroke, strokeColor, strokeWidth, marginBottom
  })
  // SRT subtitle overlay. Parses the SRT string and draws the active cue on each frame,
  // synced to source.currentTime. Use with a video source.
  // srtText format: "1\n00:00:00,000 --> 00:00:02,500\nHello world\n\n2\n..."

.use(factory)
  // Custom stage escape hatch. factory(srcDrawable) called once at start; returns
  // { canvas: HTMLCanvasElement, read() }. read() called every raf tick.
  // srcDrawable is the upstream HTMLCanvasElement or HTMLVideoElement.
  // Use to write any arbitrary canvas transform without subclassing.
  // Example:
  //   .use(src => {
  //     const canvas = document.createElement('canvas');
  //     canvas.width = 800; canvas.height = 600;
  //     const ctx = canvas.getContext('2d');
  //     return { canvas, read() { ctx.drawImage(src, 0, 0); /* custom processing */ } };
  //   })
```

### Registering named stages — `pipe.register(name, factory, descriptor)`

Package a custom stage factory as a reusable named method. After registration:
- `pipe(src).yourStageName(opts)` works in any pipeline
- Appears in the text-toolkit sidebar (draggable snippet)
- Generates a Blockly block from `descriptor.fields` (usable in blocks mode)

```js
pipe.register('glowAscii', (src, opts = {}) => {
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 600;
  const ctx = canvas.getContext('2d');
  // setup using opts.cols, opts.color, etc.
  return {
    canvas,
    read() {
      // called every frame — draw to canvas using src (canvas or video) as input
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    },
  };
}, {
  label:  'Glow ASCII',            // toolkit + block display name
  hint:   'ASCII art with glow',   // tooltip in sidebar
  colour: 80,                      // Blockly block hue (0–360)
  fields: [
    { name: 'cols',  label: 'cols',  type: 'number', default: 120 },
    { name: 'color', label: 'color', type: 'color',  default: '#00ff41' },
  ],
  // code: '...'  // optional custom snippet; auto-generated from fields if omitted
});

// Use anywhere:
pipe(cam).glowAscii({ cols: 120, color: '#00ff41' }).show('Glow', { w: 700, h: 500 });
// Chains with built-ins:
pipe(cam).ascii({ cols: 60 }).glowAscii({ cols: 60 }).fx('blur(2px)').show('out');
```

**field `type` values:** `'number'` (numeric, Blockly number field), `'color'` (colour picker), `'text'` (text input), `'boolean'` (checkbox).

### Sink methods (start the loop)

```js
.show(title, { w, h, noChrome, transparent })
  // Spawn a wm window and render the pipeline inside it.
  // Closing the window auto-stops the pipeline.

.layer(z)
  // Render pipeline output onto canvas layer at z-index z.

.to(el)
  // Mount into any DOM element (selector string or HTMLElement).

.start()
  // Start headless — access output via .canvas.

.stop()   // halt raf loop; cleanup happens automatically on reset
.canvas   // the final output canvas (available after start())
```

---

## User Library — `library`

Persistent cross-project store for named shader bodies and code snippets. Survives project switches and page reloads. Stored in `localStorage['vl_library']` — separate from `.vljson` project files by design.

```js
// Save to library — available in every project from now on
library.glsl('rainbow', `
  vec4 a = texture2D(uVideo, uv);
  float l = dot(a.rgb, vec3(.299,.587,.114));
  vec3 c = .5+.5*cos(6.28*(uv.y+time*.4+vec3(0,.33,.67)));
  gl_FragColor = vec4(c*l, 1.);
`);

library.wgsl('plasma', ({ uv, time }) => {
  let c = vec2f(uv.x * 3.0, uv.y * 3.0 + time);
  return vec4f(sin(c.x), sin(c.y), sin(c.x + c.y), 1.0);
});

library.snippet('camSetup', `
const cam = await Camera.open();
pipe(cam)
  .ascii({ cols: 120, color: '#00ff41', bg: '#0d0208' })
  .show('ASCII Cam', { w: 700, h: 500 });
`);

// Use by name — GLShader and Shader constructors auto-resolve
new GLShader('rainbow').start();
pipe(cam).glshader('rainbow').show('out');
new Shader('plasma').start();

// Static convenience aliases (equivalent to library.glsl / library.wgsl)
GLShader.define('rainbow', glslBody);
Shader.define('plasma', wgslBody);
```

### Methods

```js
library.glsl(name, body)       // save GLSL body; returns library (chainable)
library.wgsl(name, body)       // save WGSL body or JS arrow fn
library.snippet(name, code)    // save arbitrary code snippet
library.list()                 // → [{type:'glsl'|'wgsl'|'snippet', name, preview}]
library.remove(type, name)     // delete one entry
library.clear()                // delete all user entries
library.export()               // → JSON string (portable between devices)
library.import(jsonOrObj)      // merge from JSON string or parsed object
```

After saving, entries appear as draggable buttons in the **My Library** toolkit category. Snippets produce the full code when dragged; shader entries produce a usage snippet by name.

---

## Camera — `Camera`

Multi-camera streaming. Toolbar camera: enable via camera toggle button.

```js
const cam = await Camera.open({ index: 0 })  // or { deviceId }
// cam.element → <video> with live stream
cam.flip(true)   // mirror horizontally; cam.flip(false) to undo
cam.stop()       // release stream

const list = await Camera.list()  // → [{index, deviceId, label}, ...]
```

Toolbar mirror button (↔): shown when camera is on. Mirrors the main canvas drawImage. Tracks `window.__ar_camera_mirrored`.

---

## Vision — `vision`

MediaPipe. Camera must be enabled in toolbar. Results at ~10fps.

```js
vision.objects()              // → [{label, confidence, cx, cy}, ...]  (COCO classes)
vision.nearest(label?)        // → {label, confidence, cx, cy} | null
vision.any(label) / vision.count(label)

vision.hands()                // → [{gesture, confidence, cx, cy}, ...]
vision.gesture()              // → 'Thumb_Up'|'Open_Palm'|'Closed_Fist'|'Pointing_Up'|'Victory'|'ILoveYou'|'None'|null

vision.face()                 // → {expression, cx, cy, landmarks} | null
vision.expression()           // → 'smile'|'surprise'|'frown'|'mouth_open'|'neutral'|null

vision.onGesture(name, fn)    // edge-triggered (fires once per appearance)
vision.onExpression(name, fn)
```

cx/cy: canvas-centered coords. cx ∈ [-800,800], cy ∈ [-450,450] (positive=up). Map: `px = cx+800`, `py = 450-cy`.

---

## Video Signals — `video`

Sample pixel regions from canvas or camera as live numeric signals.

```js
const sig = video.signal(source, {x:0.5, y:0.5, radius:0.05, fps:30})
// source: 'camera' | HTMLCanvasElement | HTMLVideoElement
// sig.brightness/r/g/b (0–1), sig.hue (0–360), sig.motion (0–1)
sig.stream(fn)     // RAF push

video.onMotion(sourceOrSig, threshold, onEnter, onExit?)
video.onBrightness(sourceOrSig, threshold, onEnter, onExit?)
```

---

## Sensors — `sensors`

All return signal objects with live getters + `.stream(fn)` + edge triggers.

```js
const m = sensors.mouse()
// m.x/y (0–1 normalized), m.px/py (px), m.vx/vy/speed, m.left/right/middle
m.stream(fn) / m.onMove(threshold, onEnter, onExit?) / m.onButton(btn, onDown, onUp?)

const kb = sensors.keyboard()
// kb.held (Set), kb.last, kb.is(key), kb.any(...keys)
kb.onKey(key, onDown, onUp?)   // key='*' matches any

const pad = sensors.gamepad(index?)
// pad.axis(i) -1..1, pad.button(i), pad.pressed(i), pad.connected
pad.onButton(i, onDown, onUp?) / pad.onAxis(i, threshold, onEnter, onExit?)

const motion = sensors.motion()  // or: await sensors.requestMotion() (iOS 13+)
// motion.ax/ay/az (m/s²), motion.gx/gy/gz (deg/s), motion.alpha/beta/gamma, motion.magnitude
motion.onShake(threshold?, onEnter, onExit?) / motion.onTilt(axis, threshold, onEnter, onExit?)

const geo = sensors.geo({highAccuracy?})
// geo.lat/lon/altitude/accuracy/speed/heading/ready/error
geo.stream(fn)

const net = sensors.network()
// net.online, net.type, net.downlink, net.rtt, net.saveData
net.onChange(fn)

const bat = await sensors.battery()
// bat.level (0–1), bat.charging, bat.timeToFull, bat.timeToEmpty
bat.onChange(fn)
```

---

## Windows — `wm`

```js
wm.show(id) / wm.hide(id) / wm.toggle(id) / wm.focus(id)
wm.maximize(id) / wm.restore(id) / wm.close(id)
wm.move(id, x, y) / wm.resize(id, w, h)
wm.setZ(id, z)          // live CSS z-index update
wm.setOpacity(id, v)    // live CSS opacity (0–1)
wm.filter(id, cssStr)   // CSS filter on .wm-body: 'brightness(2) hue-rotate(30deg)'; '' to clear
wm.getByTitle(title)    // → window id or null (case-insensitive title match)
wm.layout('split')
wm.list()               // → all window ids

wm.spawn(title, opts)   // → id
// opts.type: 'html'|'image'|'video'|'camera'|'canvas'|'shader'|'viz'|'sensor'
// opts: x,y,w,h,id + type-specific: html,src,loop,controls,z,shader
// opts.noChrome: true → hide titlebar
// opts.transparent: true → semi-transparent background
// opts.z: number → initial CSS z-index
// opts.onClose: fn → called when window is closed (e.g. stopRunning)
// Video windows: ⟳ sync button; ♪ button folds out spectrum/waveform panel (source+style selectors)
// Image/video/html/sensor windows: ↔/↕ flip buttons apply scale() transform to body
// Sensor windows: opts.source = 'motion'|'gamepad'|'geo'|'battery' — live gauge/bar displays
wm.spawn('Motion', { type: 'sensor', source: 'motion', w: 480, h: 200 })
wm.spawn('Gamepad', { type: 'sensor', source: 'gamepad', w: 380, h: 200 })

wm.pickFile(key, pickerOpts?)   // async → blob URL (cached by key, re-prompts once)
```

Built-in ids: `win-editor` `win-canvas` `win-console` `win-toolkit` `win-camera` `win-mic`

### Embed / share

App toolbar ⇒ **⇒ share** button serializes the full desktop (all editors + layout) and copies:
```
https://your-host/?embed=1&project=<base64>
```
Loading this URL runs the art fullscreen — editor chrome hidden, canvas fills viewport, user-spawned windows at saved positions. Single-editor variant: `?embed=1&code=<base64>`.

---

## Desktop — `desktop`

```js
desktop.add(url, opts?)   // → {id, name, type, url}
// opts: name, type, x, y
//   rotation: deg           — rotate icon
//   tint: deg               — hue-rotate thumbnail
//   scale: number           — scale icon
//   animate: 'spin'|'bounce'|'pulse'|CSS — animate icon
//   labelPosition: 'above'|'below'
//   labelColor: color string
desktop.remove(id) / desktop.clear()
desktop.files()                          // → [{id, name, type, url, x, y}, ...]
desktop.onFile(({id, name, type, url}) => {})   // fires on double-click
desktop.open(id)
// Drag icon over trash zone (shows at bottom center during drag) → releases/deletes icon
// Green badge appears on icon when its spawned window is open
```

---

## Utilities

```js
// Timers (auto-tracked)
setInterval(fn, ms) / clearInterval(id)
setTimeout(fn, ms) / clearTimeout(id)

// Color
Color.random()          // random vivid HSL string
Color.invert(str)       // invert any CSS color
randUni(lo, hi)         // random float in [lo, hi)

// Keyboard shorthand
onKey(key, fn)          // keydown handler; key='any' matches all

// Execution
pause() / resume() / stop()

// Console
console.log(...) / console.error(...) / console.clear()
```

---

## Examples

### Animated draw loop

```js
draw.bg('#111');
let t = 0;
setInterval(() => {
  draw.clear().bg('#111');
  draw.circle(800 + Math.cos(t) * 300, 450 + Math.sin(t) * 200, 30, `hsl(${t*20%360},80%,60%)`);
  t += 0.04;
}, 16);
```

### Shader driven by mouse + audio

```js
const s = audio.fm();
const meter = audio.meter();
s.chain(meter);
pat("C4 E4 G4 B4", s).bpm(120).start();
audio.start();

const shader = new Shader(`
  let amp = custom.x;
  let d = distance(uv, mouse);
  let glow = exp(-d * (4.0 + amp * 16.0));
  return vec4f(glow, glow * 0.4, glow * 0.1, glow);
`);
shader.start();
setInterval(() => {
  const db = meter.getValue();
  shader.set(0, isFinite(db) ? Math.pow(10, db / 20) : 0);
}, 16);
```

### Sensor-reactive particle system

```js
const kb = sensors.keyboard();
const m = sensors.mouse();
let particles = [];

setInterval(() => {
  draw.alpha(0.1).bg('#000').alpha(1);
  if (kb.is(' ')) {
    particles.push({ x: m.px, y: m.py, vx: randUni(-4,4), vy: randUni(-6,-1), life: 1, hue: randUni(0,360) });
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy += 0.2; p.life -= 0.02;
    if (p.life <= 0) { particles.splice(i,1); continue; }
    draw.alpha(p.life).circle(p.x, p.y, 5, `hsl(${p.hue},90%,65%)`).alpha(1);
  }
}, 16);
```

### Vision + audio

```js
const kick = audio.kick();
pat("x . x .", kick).bpm(100).start();
audio.start();

vision.onGesture('Open_Palm', () => audio.bpm(160));
vision.onGesture('Closed_Fist', () => audio.bpm(80));

setInterval(() => {
  const h = vision.hands()[0];
  draw.clear().bg('#111');
  if (h) draw.circle(h.cx + 800, 450 - h.cy, 20, 'lime');
}, 16);
```
