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
draw.text(str, x, y, size, color, {font, align, baseline}?)
draw.image(img, x, y, w?, h?)
draw.push() / draw.pop()                   // save/restore transform+alpha+blend
draw.translate(x, y) / draw.rotate(rad) / draw.scale(x, y?)
draw.resetTransform()
draw.alpha(0–1) / draw.blend(mode)         // modes: 'screen' 'multiply' 'lighter' etc.
draw.at(z)                                 // switch to layer z (returns same API)
draw.width  // 1600
draw.height // 900
```

### Layers & CSS effects

```js
getCanvas(z?)                         // HTMLCanvasElement at logical z (default 0)
getLayer(z?)                          // Layer object
  .blur(px) .hue(deg) .brightness(n) .saturate(n) .invert(n) .opacity(n)
  .rotate(deg) .rotateX(deg) .rotateY(deg) .scale(x, y?) .perspective(px)
  .clip('circle(50%)') .reset()
```

Z-order: logical z → CSS z-index `20+z`. Media defaults to CSS 25, Shader to CSS 30.

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
pat(str, synth)                          // str: "C4 E4 G4"
pat(str, (note, time, dur) => {})        // callback form
stack(pat1, pat2, ...)                   // layer patterns

// Pattern modifiers:
.speed(2) / .slow(2) / .euclid(k, n) / .every(n, fn) / .bpm(120) / .start() / .stop()

// Notation: spaces=steps  [E4 G4]=group  <C4 G3>=alternate  *N=repeat  ~/. =rest
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

### Microphone

```js
const mic = await audio.mic()           // prompts permission; connect to fx or meter
audio.level                             // live 0–1 RMS (mic toolbar toggle must be on)
audio.onLevel(threshold, onEnter, onExit?)   // edge-trigger
audio.onWord(word, fn) / audio.onSpeech(fn)  // Web Speech API (Chrome/Edge)
audio.say(text, opts?)                       // speechSynthesis
```

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
wm.layout('split')
wm.list()   // → all window ids

wm.spawn(title, opts)   // → id
// opts.type: 'html'|'image'|'video'|'camera'|'canvas'|'shader'
// opts: x,y,w,h,id + type-specific: html,src,loop,controls,z,shader

wm.pickFile(key, pickerOpts?)   // async → blob URL (cached by key, re-prompts once)
```

Built-in ids: `win-editor` `win-canvas` `win-console` `win-toolkit` `win-camera` `win-mic`

---

## Desktop — `desktop`

```js
desktop.add(url, {name, type, x, y}?)   // → {id, name, type, url}
desktop.remove(id) / desktop.clear()
desktop.files()                          // → [{id, name, type, url, x, y}, ...]
desktop.onFile(({id, name, type, url}) => {})   // fires on double-click
desktop.open(id)
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
