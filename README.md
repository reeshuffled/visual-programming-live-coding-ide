# createos

A live coding environment for creating audiovisual experiences in the browser — shaders, synthesizers, video, and computer vision, all from a single JavaScript editor.

## Project Principles

* Reactivity
* Automation
* Flexibility and Connectedness
* Customizability

## What we offer

### Graphics
- **GPU shaders** — full-screen WebGPU/WGSL fragment shaders (`Shader`) or WebGL/GLSL (`GLShader`, all browsers, ShaderToy paste-in) with `time`, `uv`, `mouse`, and custom uniforms
- **3D scenes** — Three.js via `ThreeScene` + full `THREE` namespace; tick loop, z-layering, signal binding, opacity — composable with shaders and draw
- **PIXI.js** — WebGL scene graph for sprites, particles, rich text, per-object filters, and hit-testing; layers cleanly with shaders and draw
- **2D canvas** — draw on z-indexed layers with CSS filter effects; rich text with stroke, shadow, gradient, and web fonts (`draw.loadFont`)
- **Render pipeline** — chain visual stages with `pipe(source).ascii().glshader().fx('hue-rotate(90deg)').subtitle(srt).show()`; sources: camera, canvas, video, shader; stages compose freely

### Audio
- **Synthesis** — synths, sequencers, effects chains via [Tone.js](https://tonejs.github.io/); pattern sequencing with a [Strudel](https://strudel.cc/) / [TidalCycles](https://tidalcycles.org/)-inspired mini-notation and composable `Pattern` algebra (`pat("bd*2 sd").fast(2).every(4, p => p.rev()).start()`)
- **Visualization** — live spectrogram, piano roll, and EQ widget (draggable frequency curve over live FFT); `audio.fft.bass/mid/high` as control signals
- **MIDI** — Web MIDI input: `midi.onNote(fn)`, `midi.onCC(ch, cc, fn)`, `midi.signal(ch, cc)` → live 0–1 signal wired to anything
- **Voice & TTS** — recognize spoken words with `audio.onWord()` / `audio.onSpeech()`, speak with `audio.say()`

### Camera & Vision
- **Camera streams** — open one or many cameras with `Camera.open()`; `CameraStream.element` is a live `<video>` usable as shader input or pipeline source
- **Computer vision** — react to hand gestures, facial expressions, and detected objects via [MediaPipe](https://github.com/google-ai-edge/mediapipe); `vision.onGesture()`, `vision.onExpression()`, `vision.face()`

### Signals & Input
- **Signal bus** — any live signal (mic level, mouse position, camera brightness, device motion, gamepad axis, MIDI CC, external weather/API) drives any sink (shader uniform, filter cutoff, draw parameter, pattern speed); all signals share the same live-getter + `.stream(fn)` + edge-trigger pattern
- **Sensors** — unified input bus: `sensors.mouse()`, `sensors.keyboard()`, `sensors.gamepad()`, `sensors.motion()`, `sensors.geo()`, `sensors.network()`, `sensors.battery()`
- **External data** — pull live signals from web APIs and weather with `external.weather(lat, lon)` and `external.signal(url, selector)`

### Media
- **Video** — play, seek, loop, and layer video with `Media.video()`; sample regions as live brightness/motion/color signals via `video.signal()`
- **Images** — overlay, crop, rotate, filter, and blend images with `editImage()`; z-ordered on any canvas layer
- **Subtitles** — SRT overlay synced to video playback via `pipe(vid).subtitle(srt).show()`

### Desktop & Windows
- **Window management** — spawn floating windows (image, video, camera, canvas, shader, HTML) from code; move/resize/maximize/filter with `wm.spawn`, `wm.layout`, `wm.filter`, etc.
- **File management** — pick files with `wm.pickFile()`, browse directories with `wm.browse()`; manage desktop icons with `desktop.add/onFile/files`

## Editor features

- [CodeMirror 6](https://codemirror.net/) with syntax highlighting, bracket matching, code folding, and inline widgets
  - **Color swatches** — click any color string to open an HSL picker; edits write back to the source
  - **Number scrubbers** — drag any numeric literal to change its value live
  - **Syntax linting** — squiggles + hover tooltips on parse errors; runtime error highlights
- **Blocks panel** (toggle on/off) — visual [Blockly](https://developers.google.com/blockly) workspace for Audio, Shader, GLShader, PIXI, Vision, Canvas, and Media blocks; coexists with the text editor
- **API drawer** (toggle on/off) — drag-to-text code snippets for every API
- Infinite loop protection ([Esprima](https://esprima.org/))
- Friendly runtime error messages
- Pause / Resume program execution
- **Auto-execute** (⚡ toolbar toggle) — re-runs code 1s after each edit; syntax-gated so broken code doesn't tear down a running sketch
- **Share / Embed** — toolbar button encodes the full desktop to a URL (`?embed=1&project=<b64>`); opening it runs the art fullscreen with no editor chrome

## Known Weird Behavior

* Is there a way to not exit fullscreen when using the browser’s file picker?
    * Not feasible. Browser forces fullscreen exit for native file pickers — security feature, can't override. You can try re-requesting fullscreen after the picker resolves, but:
        * Causes visible flash (exit → dialog → re-enter)
        * requestFullscreen() needs a user gesture; whether the picker's .then() counts varies by browser/version
        * Unreliable on Safari
    * Proactive exit is the right call — makes behavior predictable instead of broken. Current fix stands.
* Can you remove that annoying upload prompt?
    * That's Chrome/browser security — required before showDirectoryPicker grants folder access. Can't remove it, it's outside our control.

## APIs available in user code

### Graphics

```js
// Shader — WebGPU/WGSL (Chrome/Edge/Safari 18+)
const shader = new Shader(`
  let col = vec3f(uv.x, uv.y, sin(time) * 0.5 + 0.5);
  return vec4f(col, 1.0);
`);
shader.start();

// GLShader — WebGL/GLSL (all browsers)
new GLShader(`
  gl_FragColor = vec4(uv.x, uv.y, sin(uTime)*0.5+0.5, 1.0);
`).start();

// ShaderToy paste-in — void mainImage auto-detected, zero edits needed
new GLShader(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / uResolution;
  vec3 col = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0,2,4));
  fragColor = vec4(col, 1.0);
}
`).start();

// Post-process shader FX
new ShaderFX('blur').start();

// Three.js 3D scene
const scene = new ThreeScene({ w: 800, h: 600 }).start();
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshNormalMaterial()
);
scene.add(mesh);
scene.tick(({ time }) => { mesh.rotation.y = time; });

// PIXI — scene graph, sprites, particles, filters (WebGL, z=25)
const g = new PIXI.Graphics();
g.beginFill(0x4488ff);
g.drawCircle(0, 0, 60);
g.endFill();
g.x = pixi.screen.width / 2;
g.y = pixi.screen.height / 2;
Stage.addChild(g);
pixi.tick(() => { g.rotation += 0.01; }); // cleaned up on Stop

const sprite = PIXI.Sprite.from('https://example.com/hero.png');
sprite.anchor.set(0.5);
sprite.interactive = true;
sprite.on('pointerdown', () => draw.bg(Color.random()));
Stage.addChild(sprite);

// 2D draw (layer 0)
draw.bg('#000').circle(400, 300, 50, 'red');
draw.text('HELLO', 400, 300, 72, '#fff', {
  stroke: true, strokeColor: '#f0f', strokeWidth: 3,
  shadow: true, shadowBlur: 20, shadowColor: '#f0f',
  gradient: ['#f0f', '#0ff'],
});
await draw.loadFont('Orbitron', 'https://fonts.gstatic.com/...');
draw.text('SPACE', 400, 400, 48, '#0ff', { font: 'Orbitron' });

// Raw canvas layers
const ctx = getCanvas(0).getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, 100, 100);
getLayer(0).blur(5);

// Render pipeline — chain visual stages
const cam = await Camera.open();
pipe(cam).ascii({ cols: 120, color: '#0f0', bg: '#000' }).show('ASCII Cam');
pipe(cam).glshader(`
  vec4 c = texture2D(uVideo, uv);
  gl_FragColor = vec4(c.b, c.r, c.g, 1.0);
`).show('Channel Swap');

// Capture a DOM element to canvas (usable as shader video input)
const cap = captureWindow(document.getElementById('win-editor'), 12);
```

### Audio

```js
// Synthesis
const s = audio.synth();
s.play('C4', '8n');
audio.bpm(120);
audio.start();

// Pattern sequencing — Strudel/TidalCycles-inspired mini-notation
pat('bd*2 sd').fast(2).every(4, p => p.rev()).start();

// Mic level trigger (enable mic in toolbar first)
audio.onLevel(0.7, () => draw.bg('red'), () => draw.bg('black'));
setInterval(() => console.log(audio.level.toFixed(3)), 100); // live 0–1 RMS

// Audio visualization — fft signals usable as control values
console.log(audio.fft.bass, audio.fft.mid, audio.fft.high);

// MIDI
await midi.open();
midi.onNote((note, vel, ch) => audio.synth().play(note, '8n'));
midi.onCC(1, 74, v => shader.set(v)); // CC 74 → shader uniform
const cutoff = midi.signal(1, 74);    // live 0–1 signal

// Voice recognition (Chrome/Edge — Web Speech API)
audio.onWord('red', () => draw.bg('red'));
audio.onSpeech((text) => draw.text(text, 50, 50));

// Text to speech
audio.say('hello world');
audio.say('slow and low', { voice: 'Samantha', rate: 0.6, pitch: 0.8 });
console.log(audio.voices()); // list available voice names
```

### Camera & Vision

```js
// Camera streams
const cam = await Camera.open();  // CameraStream — cam.element is a <video>
console.log(await Camera.list()); // list available devices

// Multiple cameras
const cam0 = await Camera.open({ index: 0 });
const cam1 = await Camera.open({ index: 1 });
cam0.flip(true); // mirror horizontally

// Computer vision — MediaPipe gestures, expressions, object detection
vision.onGesture('Thumb_Up', () => { /* ... */ });
vision.onExpression('smile', () => draw.bg('yellow'));
const face = vision.face(); // { expression, cx, cy, landmarks }
```

### Signals & Input

```js
// Sensors — unified signal bus
const mouse = sensors.mouse();
mouse.stream(m => draw.circle(m.x * 1600, m.y * 900, 10, 'white'));
mouse.onMove(0.01, () => console.log('moving'));

const kb = sensors.keyboard();
kb.onKey('ArrowLeft', () => x -= 10);
setInterval(() => { if (kb.is('w')) y -= 5; }, 16);

const pad = sensors.gamepad();
pad.stream(g => {
  const x = g.axis(0);    // left stick x -1..1
  const fire = g.pressed(0); // A button
});

const motion = sensors.motion();
motion.onShake(20, () => draw.clear());
motion.stream(m => console.log(m.magnitude));

const geo = sensors.geo();
geo.stream(g => draw.text(`${g.lat?.toFixed(4)}, ${g.lon?.toFixed(4)}`, 50, 50));

const bat = await sensors.battery();
console.log(bat.level, bat.charging);

// Video signals — sample canvas/camera region as live numeric signals
const sig = video.signal('camera', { x: 0.5, y: 0.5, radius: 0.1 });
sig.stream(s => console.log(s.brightness, s.motion, s.hue));
video.onMotion('camera', 0.3, () => draw.bg('red'), () => draw.bg('black'));

const sig2 = video.signal(getCanvas(0), { x: 0.2, y: 0.8 });
sig2.stream(s => { /* s.brightness live every frame */ });

// External data signals
const wx = external.weather(37.77, -122.41);
wx.stream(w => draw.text(`${w.temp}°C`, 50, 50));

const price = external.signal('https://api.example.com/btc', '.price');
price.stream(v => draw.text(`$${v}`, 50, 100));
```

### Media

```js
// Video
const vid = Media.video('https://example.com/clip.mp4');
vid.play();

// Video with SRT subtitles via render pipeline
pipe(vid).subtitle(srtString, { fontSize: 28 }).show('Subtitled');

// Images — load, edit, draw
const img = editImage('https://example.com/photo.jpg');
img.crop(0, 0, 400, 300).rotate(15).filter('grayscale(1)').draw(draw, 100, 100);
```

### Desktop & Windows

```js
// Spawn floating windows
wm.spawn('Info',  { type: 'html',   html: '<h2>hello</h2>', w: 320, h: 240 });
wm.spawn('Photo', { type: 'image',  src: url, w: 480, h: 360 });
wm.spawn('Clip',  { type: 'video',  src: url, w: 640, h: 480, controls: true });
wm.spawn('Cam',   { type: 'camera', w: 320, h: 240 });
wm.spawn('Layer', { type: 'canvas', z: 0,   w: 640, h: 480 });
wm.spawn('FX',    { type: 'shader', shader: s, w: 640, h: 480 });

// Window control
wm.show('win-canvas');   wm.hide('win-canvas');   wm.toggle('win-console');
wm.focus('win-editor');  wm.close(id);
wm.move(id, 200, 100);   wm.resize(id, 640, 480);
wm.maximize(id);          wm.restore(id);
wm.layout('split');
console.log(wm.list());

// Per-window audio routing
synth.connect(wm.channel(id));

// File picker — returns blob URL; caches handle by key (no re-prompt)
const url = await wm.pickFile('myPhoto');

// Directory browser — spawns a file-tree window; click file → callback
await wm.browse('assets', (url, name) => {
  wm.spawn(name, { type: 'image', src: url });
});

// Desktop file icons
desktop.onFile(({ name, type, url }) => {
  wm.spawn(name, { type, src: url });
});
desktop.add(url, { name: 'snapshot.png', type: 'image' });
console.log(desktop.files());
```

## Dev

```sh
npm install --legacy-peer-deps
npm run dev                               # dev server
node node_modules/vite/bin/vite.js build  # production build
npm test                                  # run all tests
```
