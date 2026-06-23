# Visual Live Coding IDE

A live coding environment for creating audiovisual experiences in the browser — shaders, synthesizers, video, and computer vision, all from a single JavaScript editor.

## What you can make

- **GPU shaders** — full-screen WebGPU/WGSL fragment shaders with `time`, `uv`, `mouse`, and custom uniforms
- **Audio synthesis** — synths, sequencers, effects chains via [Tone.js](https://tonejs.github.io/)
- **Media layers** — image and video overlaid on the canvas with z-ordering
- **Camera + vision** — react to hand gestures, facial expressions, and detected objects via [MediaPipe](https://github.com/google-ai-edge/mediapipe)
- **2D canvas** — draw on z-indexed layers with CSS filter effects (blur, hue, brightness, etc.)
- **Window management** — spawn, tile, move, and resize IDE panels from code (`wm.spawn`, `wm.layout`, etc.)

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

// Media
const vid = Media.video('https://example.com/clip.mp4');
vid.play();

// Vision
vision.onGesture('Thumb_Up', () => { /* ... */ });
const face = vision.face(); // { expression, cx, cy, landmarks }

// Canvas layers
const ctx = getCanvas(0).getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, 100, 100);
getLayer(0).blur(5);
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
node node_modules/vite/bin/vite.js        # dev server (note: npx/npm run broken on Node 25)
node node_modules/vite/bin/vite.js build  # production build
```
