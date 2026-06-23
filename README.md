# Visual Live Coding IDE

A live coding environment for creating audiovisual experiences in the browser — shaders, synthesizers, video, and computer vision, all from a single JavaScript editor.

## Project Principles

* Reactivity
* Automation
* Flexibility and Connectedness
* Customizability

## What you can make

- **GPU shaders** — full-screen WebGPU/WGSL fragment shaders with `time`, `uv`, `mouse`, and custom uniforms
- **Audio synthesis** — synths, sequencers, effects chains via [Tone.js](https://tonejs.github.io/)
- **Voice & TTS** — recognize spoken words with `audio.onWord()` / `audio.onSpeech()`, speak with `audio.say()`
- **Camera + vision** — react to hand gestures, facial expressions, and detected objects via [MediaPipe](https://github.com/google-ai-edge/mediapipe)
- **Signal bus** — any live signal (mic level, mouse position, camera brightness, device motion, gamepad axis) can drive any sink (shader uniform, filter cutoff, draw parameter, pattern speed). `audio.level`, `video.signal`, `sensors.mouse/keyboard/gamepad/motion/geo/network/battery` all follow the same live-getter + edge-trigger pattern
- **Media layers** — image and video overlaid on the canvas with z-ordering
- **2D canvas** — draw on z-indexed layers with CSS filter effects (blur, hue, brightness, etc.)
- **Window management** — spawn floating windows (image, video, camera, canvas, shader, HTML), browse local directories, move/resize/maximize from code (`wm.spawn`, `wm.browse`, `wm.layout`, etc.); manage desktop file icons with `desktop.add/onFile/files`

## Editor features

- [CodeMirror 5](https://codemirror.net/5/) with syntax highlighting, bracket matching, code folding, and inline widgets
  - **Color swatches** — click any color string to open an HSL picker; edits write back to the source
  - **Number scrubbers** — drag any numeric literal to change its value live
- **Blocks panel** (toggle on/off) — visual [Blockly](https://developers.google.com/blockly) workspace for Audio, Shader, Vision, Canvas, and Media blocks; coexists with the text editor
- **API drawer** (toggle on/off) — drag-to-text code snippets for every API
- Infinite loop protection ([Esprima](https://esprima.org/))
- Friendly runtime error messages
- Pause / Resume program execution

## APIs available in user code

```js
// Audio
const s = audio.synth();
s.play('C4', '8n');
audio.bpm(120);
audio.start();

// Shaders
const shader = new Shader(`
  let col = vec3f(uv.x, uv.y, sin(time) * 0.5 + 0.5);
  return vec4f(col, 1.0);
`);
shader.start();

// Post-process shader FX
const fx = new ShaderFX('blur');
fx.start();

// Camera streams
const cam = new Camera();
const stream = await cam.open(); // CameraStream — stream.element is a <video>

// Media
const vid = Media.video('https://example.com/clip.mp4');
vid.play();

// Mic level trigger (enable mic in toolbar first)
audio.onLevel(0.7, () => draw.bg('red'), () => draw.bg('black'));
setInterval(() => console.log(audio.level.toFixed(3)), 100); // live 0–1 RMS

// Voice recognition (Chrome/Edge — Web Speech API)
audio.onWord('red', () => draw.bg('red'));
audio.onSpeech((text) => draw.text(text, 50, 50));

// Text to speech
audio.say('hello world');
audio.say('slow and low', { voice: 'Samantha', rate: 0.6, pitch: 0.8 });
console.log(audio.voices()); // list available voice names

// Vision
vision.onGesture('Thumb_Up', () => { /* ... */ });
const face = vision.face(); // { expression, cx, cy, landmarks }

// 2D draw API (layer 0)
draw.bg('#000').circle(400, 300, 50, 'red').text('hi', 100, 100);

// Raw canvas layers
const ctx = getCanvas(0).getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, 100, 100);
getLayer(0).blur(5);

// Capture a DOM element to canvas (usable as shader video input)
const cap = captureWindow(document.getElementById('win-editor'), 12);

// Window management
wm.spawn('Info', { type: 'html', html: '<h2>hello</h2>', w: 320, h: 240 });
wm.spawn('Photo', { type: 'image', src: url, w: 480, h: 360 });
wm.spawn('Clip',  { type: 'video', src: url, w: 640, h: 480, controls: true });
wm.spawn('Cam',   { type: 'camera', w: 320, h: 240 });
wm.spawn('Layer', { type: 'canvas', z: 0, w: 640, h: 480 });
wm.spawn('FX',    { type: 'shader', shader: s, w: 640, h: 480 });

// All spawn opts: x, y, w, h, id (+ type-specific)

// File picker — returns blob URL; caches handle by key (no re-prompt)
const url = await wm.pickFile('myPhoto');

// Directory browser — spawns a file-tree window; click file → callback
await wm.browse('assets', (url, name) => {
  wm.spawn(name, { type: 'image', src: url });
});

// Window control
wm.show('win-canvas');   wm.hide('win-canvas');   wm.toggle('win-console');
wm.focus('win-editor');  wm.close(id);
wm.move(id, 200, 100);   wm.resize(id, 640, 480);
wm.maximize(id);          wm.restore(id);
wm.layout('split');       // built-in layout
console.log(wm.list());   // all window ids

// Per-window audio routing (mute/volume controls in titlebar affect this channel)
synth.connect(wm.channel(id));

// Desktop file icons — drag files onto the IDE desktop or add programmatically
desktop.onFile(({ name, type, url }) => {
  wm.spawn(name, { type, src: url });   // open icon → spawn window
});
desktop.add(url, { name: 'snapshot.png', type: 'image' });
console.log(desktop.files());           // list all icons

// Video signals — sample a canvas/camera region as live numeric signals
const sig = video.signal('camera', { x: 0.5, y: 0.5, radius: 0.1 });
setInterval(() => {
  console.log(sig.brightness, sig.motion, sig.hue);
}, 100);

// Edge-trigger: fire when motion in a region spikes
video.onMotion('camera', 0.3, () => draw.bg('red'), () => draw.bg('black'));

// Signals from any canvas too
const sig2 = video.signal(getCanvas(0), { x: 0.2, y: 0.8 });
sig2.stream(s => { /* s.brightness live every frame */ });

// Sensors — unified signal bus
const mouse = sensors.mouse();
mouse.stream(m => draw.circle(m.x * 1600, m.y * 900, 10, 'white'));
mouse.onMove(0.01, () => console.log('moving'));

const kb = sensors.keyboard();
kb.onKey('ArrowLeft', () => x -= 10);
setInterval(() => { if (kb.is('w')) y -= 5; }, 16);

const pad = sensors.gamepad();
pad.stream(g => {
  const x = g.axis(0); // left stick x -1..1
  const fire = g.pressed(0); // A button
});

const motion = sensors.motion();
motion.onShake(20, () => draw.clear());
motion.stream(m => console.log(m.magnitude));

const geo = sensors.geo();
geo.stream(g => draw.text(`${g.lat?.toFixed(4)}, ${g.lon?.toFixed(4)}`, 50, 50));

const bat = await sensors.battery();
console.log(bat.level, bat.charging);
```

## Tech stack

- **Vite** — build tooling
- **CodeMirror 5** — editor
- **Blockly** — visual block coding
- **Tone.js** — audio synthesis and sequencing
- **WebGPU + WGSL** — GPU fragment shaders
- **MediaPipe Tasks Vision** — gesture, face, and object detection
- **Esprima** — infinite loop detection

## Dev

```sh
npm install --legacy-peer-deps
npm run dev                               # dev server
node node_modules/vite/bin/vite.js build  # production build
npm test                                  # run all tests
```
