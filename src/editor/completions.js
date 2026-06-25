export const TOOLKIT_CATEGORIES = [
  {
    name: "Draw",
    commands: [
      {
        label: "background",
        code: "draw.bg('#111');",
        hint: "Fill entire canvas with a color",
      },
      {
        label: "rect",
        code: "draw.rect(x, y, w, h, 'red');",
        hint: "Filled rectangle — x, y, width, height, color",
      },
      {
        label: "circle",
        code: "draw.circle(x, y, r, 'red');",
        hint: "Filled circle — x, y, radius, color",
      },
      {
        label: "line",
        code: "draw.line(x1, y1, x2, y2, 'white', 2);",
        hint: "Line — start, end, color, thickness",
      },
      {
        label: "ring",
        code: "draw.ring(x, y, r, 'white', 3);",
        hint: "Stroked circle — x, y, radius, color, thickness",
      },
      {
        label: "stroked rect",
        code: "draw.rectStroke(x, y, w, h, 'white', 2);",
        hint: "Stroked rectangle — x, y, w, h, color, thickness",
      },
      {
        label: "polygon",
        code: "draw.poly([[0,0],[100,0],[50,100]], 'teal');",
        hint: "Filled polygon — array of [x,y] points, color",
      },
      {
        label: "text",
        code: "draw.text('hello', x, y, 32, 'white');",
        hint: "Text — string, x, y, size(px), color. Optional 6th arg: { font, align, baseline }",
      },
      {
        label: "text centered",
        code: "draw.text('hello', draw.width/2, draw.height/2, 48, 'white', { align: 'center', baseline: 'middle' });",
        hint: "Center text on canvas using draw.width/draw.height",
      },
      {
        label: "arc / pie",
        code: "draw.arc(x, y, r, 0, Math.PI, 'orange');",
        hint: "Filled arc/pie slice — x, y, radius, startAngle, endAngle, color",
      },
      {
        label: "arc stroke",
        code: "draw.arcStroke(x, y, r, 0, Math.PI * 1.5, 'white', 4);",
        hint: "Stroked arc — x, y, radius, start, end, color, thickness",
      },
      {
        label: "image",
        code: "const img = await Media.image('https://example.com/photo.jpg');\ndraw.image(img, x, y, w, h);",
        hint: "Draw an image — load with Media.image(), then draw.image(img, x, y, w?, h?)",
      },
      {
        label: "alpha",
        code: "draw.alpha(0.5);\ndraw.circle(x, y, r, 'red');\ndraw.alpha(1);",
        hint: "Set global alpha (0–1) — affects all subsequent draw calls until changed",
      },
      {
        label: "blend mode",
        code: "draw.blend('screen');\ndraw.circle(x, y, r, 'blue');\ndraw.blend('source-over');",
        hint: "Set composite blend mode — screen, multiply, add, overlay, etc.",
      },
      {
        label: "save / restore",
        code: "draw.push();\ndraw.alpha(0.3);\ndraw.translate(100, 100);\ndraw.circle(0, 0, 50, 'white');\ndraw.pop();",
        hint: "push()/pop() save and restore all ctx state (alpha, blend, transform)",
      },
      {
        label: "transform",
        code: "draw.push();\ndraw.translate(draw.width/2, draw.height/2);\ndraw.rotate(Math.PI / 4);\ndraw.rect(-50, -50, 100, 100, 'cyan');\ndraw.pop();",
        hint: "translate/rotate/scale — use push/pop to scope transforms",
      },
      {
        label: "animate",
        code: "draw.bg('#111');\nlet t = 0;\nsetInterval(() => {\n  draw.clear();\n  draw.bg('#111');\n  draw.circle(draw.width/2 + Math.cos(t)*200, draw.height/2, 40, 'red');\n  t += 0.05;\n}, 16);",
        hint: "Animation loop — clear each frame, update state, redraw",
      },
      {
        label: "other layer",
        code: "draw.at(2).rect(x, y, w, h, 'blue');",
        hint: "draw.at(z) targets a different z-layer canvas",
      },
      {
        label: "reset state",
        code: "draw.reset();",
        hint: "Reset alpha, blend, transform to defaults without clearing pixels",
      },
    ],
  },
  {
    name: "Media",
    commands: [
      {
        label: "image layer",
        code: "const layer = await Media.imageLayer('https://example.com/photo.jpg');\n// fit: 'cover' (default), 'contain', or 'stretch'",
        hint: "Load image URL as full-canvas overlay. Awaitable.",
      },
      {
        label: "load image",
        code: "const img = await Media.image('https://example.com/photo.jpg');\ndraw.image(img, 0, 0);",
        hint: "Load image URL — returns HTMLImageElement. Draw with draw.image(img, x, y) or draw.image(img, x, y, w, h).",
      },
      {
        label: "video layer",
        code: "const vid = Media.video('https://example.com/clip.mp4');\nvid.play();",
        hint: "Create a video layer — loops and muted by default.",
      },
      {
        label: "video options",
        code: "const vid = Media.video('https://example.com/clip.mp4', { z: 15, opacity: 0.8, loop: true, muted: true });\nvid.play();",
        hint: "Video with z-order, opacity, loop, and mute options",
      },
      {
        label: "video controls",
        code: "vid.pause();\nvid.stop();\nvid.seek(5);\nvid.mute(false);\nvid.opacity(0.5);",
        hint: "Control video: pause, stop, seek(seconds), mute, opacity",
      },
      {
        label: "image fit",
        code: "layer.fit('contain'); // 'cover', 'contain', or 'stretch'",
        hint: "Change how image fills the canvas",
      },
    ],
  },
  {
    name: "Shader",
    commands: [
      {
        label: "hello shader",
        code: "const s = new Shader(`\n  // pos = pixel coords (top-left origin)\n  // uv = pos / res (0..1)\n  // time = seconds, mouse = normalized 0..1, custom = vec4f\n  let col = vec3f(uv.x, uv.y, sin(time) * 0.5 + 0.5);\n  return vec4f(col, 1.0);\n`);\ns.start();",
        hint: "Full-screen WebGPU shader. Write the fragment body — pos, uv, time, res, mouse, custom are pre-declared.",
      },
      {
        label: "plasma",
        code: "const s = new Shader(`\n  let x = uv.x * 6.28;\n  let y = uv.y * 6.28;\n  let r = sin(x + time) * 0.5 + 0.5;\n  let g = sin(y + time * 1.3) * 0.5 + 0.5;\n  let b = sin(x + y + time * 0.7) * 0.5 + 0.5;\n  return vec4f(r, g, b, 1.0);\n`);\ns.start();",
        hint: "Classic plasma / color wave effect",
      },
      {
        label: "set custom uniform",
        code: "s.set([1.0, 0.5, 0.0, 1.0]);",
        hint: "Set the custom vec4f uniform — readable in shader as `custom.x .y .z .w`",
      },
      {
        label: "set one channel",
        code: "s.set(0, 0.5);",
        hint: "Set one channel of custom uniform by index (0=x, 1=y, 2=z, 3=w)",
      },
      {
        label: "shader opacity",
        code: "s.opacity(0.5);",
        hint: "Layer opacity 0–1",
      },
      {
        label: "shader z-order",
        code: "s.z(25);",
        hint: "CSS z-index — 20+ = above canvas, negative = behind camera",
      },
      {
        label: "stop shader",
        code: "s.stop();",
        hint: "Stop the render loop",
      },
      {
        label: "mouse reactive",
        code: "const s = new Shader(`\n  let d = distance(uv, mouse);\n  let ring = smoothstep(0.02, 0.0, abs(d - 0.1));\n  return vec4f(ring, ring * 0.5, 0.0, ring);\n`);\ns.start();",
        hint: "Shader that reacts to mouse position",
      },
      {
        label: "full WGSL",
        code: "const s = new Shader(`\nstruct U { res: vec2f, mouse: vec2f, time: f32, _p1: f32, _p2: f32, _p3: f32, custom: vec4f }\n@group(0) @binding(0) var<uniform> u: U;\n@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {\n  var v = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));\n  return vec4f(v[vi], 0.0, 1.0);\n}\n@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {\n  let uv = p.xy / u.res;\n  return vec4f(uv, sin(u.time)*0.5+0.5, 1.0);\n}\n`);\ns.start();",
        hint: "Full WGSL — include @vertex and @fragment entrypoints yourself",
      },
      {
        label: "video shader",
        code: "const vid = Media.video('https://example.com/clip.mp4');\nvid.play();\nconst s = new Shader(`\n  let col = textureSample(video, videoSampler, uv);\n  return vec4f(col.rgb, 1.0);\n`, { video: vid });\ns.start();",
        hint: "Feed a video into a shader — `video` and `videoSampler` auto-declared. Sample with textureSample(video, videoSampler, uv).",
      },
      {
        label: "preset shader",
        code: "ShaderFX.preset('plasma');",
        hint: "Quick fullscreen preset. Presets: gradient, plasma, waves, circles, noise",
      },
      {
        label: "video effect",
        code: "const vid = Media.video('https://example.com/clip.mp4');\nvid.play();\nShaderFX.video(vid, 'greyscale');",
        hint: "Apply a shader effect to a video. Effects: greyscale, invert, channel_swap, posterize, scanlines",
      },
      {
        label: "window shader",
        code: "ShaderFX.window('editor', 'greyscale');",
        hint: "Apply a shader effect to an IDE window. Windows: 'editor', 'console', 'canvas'. Effects: greyscale, invert, channel_swap, posterize, scanlines",
      },
      {
        label: "shader — JS function",
        code: "// Write shaders as plain JS — no WGSL needed.\n// Params: { uv, time, custom, res, mouse } — destructure what you need.\n// vec2/vec3/vec4 constructors available. Math.sin/cos/abs/etc. → WGSL built-ins.\n// return [r, g, b, a]  →  vec4f automatically\nconst s = new Shader(({ uv, time }) => {\n  const r = Math.sin(uv.x * 10 + time) * 0.5 + 0.5;\n  const g = Math.cos(uv.y * 8  - time) * 0.5 + 0.5;\n  return [r, g, 0.5, 1.0];\n});\ns.start();",
        hint: "new Shader(fn) — pass a JS arrow function instead of WGSL. Transpiled automatically. Supports: let/const, if/else, for/while, Math.*, vec2/3/4, ternary, helper functions (type from default params). return [r,g,b,a] → vec4f.",
      },
      {
        label: "shader JS + video",
        code: "// col = video sample at current uv (vec4f with .r .g .b .a)\nconst cam = new Camera();\nawait cam.open();\nconst s = new Shader(({ uv, time, col }) => {\n  const grey = col.r * 0.299 + col.g * 0.587 + col.b * 0.114;\n  return [grey, grey * Math.abs(Math.sin(time)), grey * 0.5, 1.0];\n}, { video: cam });\ns.start();",
        hint: "Destructure col to get the video/camera pixel at current uv. Pass video: in opts — any HTMLVideoElement, HTMLCanvasElement, or Camera instance.",
      },
      {
        label: "shader JS + helper fns",
        code: "// Define helper functions — type params with default values as hints:\n//   r = 0.0 → f32,   c = vec2(0,0) → vec2f\nconst s = new Shader(({ uv, time }) => {\n  function circle(center = vec2(0, 0), p = vec2(0, 0), r = 0.0) {\n    return 1.0 - smoothstep(r - 0.01, r + 0.01, length(p - center));\n  }\n  const c = circle(vec2(0.5, 0.5), uv, 0.25 + Math.sin(time) * 0.1);\n  return [c, c * 0.4, c * 0.9, 1.0];\n});\ns.start();",
        hint: "Inner function declarations become WGSL helper fns. Type each param with a default value: f32 params use 0.0, vec2f use vec2(0,0), vec3f use vec3(0,0,0), etc.",
      },
      {
        label: "shader JS + audio reactive",
        code: "// custom.x/y/z/w filled by .bind(signal)\nconst sig = audio.signal(audio.master);\nconst s = new Shader(({ uv, time, custom }) => {\n  const bass = custom.x;      // 0–1 RMS of bound signal\n  const r = Math.sin(uv.x * 20 * (1.0 + bass * 5.0) + time) * 0.5 + 0.5;\n  return [r * bass, r * 0.3, 1.0 - r, 1.0];\n});\ns.bind(sig);\ns.start();",
        hint: "Call .bind(audio.signal(...)) — fills custom.x=rms, custom.y=bass, custom.z=mid, custom.w=high each frame. Use custom.x/y/z/w in the JS shader fn.",
      },
      {
        label: "capture window shader",
        code: "const s = new Shader(`\n  let col = textureSample(video, videoSampler, uv);\n  return vec4f(col.rgb, 1.0);\n`, { video: captureWindow('.CodeMirror') });\ns.start();",
        hint: "Capture any DOM element as a live shader texture — pass a CSS selector or element. canvas/video elements pass through directly.",
      },
      {
        label: "mic viz shader",
        code: "ShaderFX.micViz('invert');",
        hint: "Apply a WebGPU shader effect to the mic visualizer. Enable mic in toolbar first. Effects: greyscale, invert, channel_swap, posterize, scanlines. Or use audio.micCanvas as video: source in a custom Shader.",
      },
      {
        label: "mic canvas custom shader",
        code: "const s = new Shader(`\n  let col = textureSample(video, videoSampler, uv);\n  let v = col.r;\n  return vec4f(v * 0.2, v, v * 0.8, 1.0);\n`, { video: audio.micCanvas });\ns.start();",
        hint: "Use audio.micCanvas as a live texture input — samples the mic frequency bar visualization. Enable mic in toolbar first.",
      },
    ],
  },
  {
    name: "Audio",
    commands: [
      {
        label: "synth",
        code: "const s = audio.synth();\ns.play('C4', '8n');",
        hint: "Basic monophonic synth — play(note, duration)",
      },
      {
        label: "poly synth",
        code: "const p = audio.poly();\np.play(['C4', 'E4', 'G4'], '4n');",
        hint: "Polyphonic synth — play chords with arrays of notes",
      },
      {
        label: "fm synth",
        code: "const s = audio.fm();\ns.play('C4', '8n');",
        hint: "FM synthesis — rich metallic/electric tones",
      },
      {
        label: "pluck",
        code: "const s = audio.pluck();\ns.play('C4', '8n');",
        hint: "Karplus-Strong plucked string synth",
      },
      {
        label: "kick drum",
        code: "const k = audio.kick();\nk.play('C1', '8n');",
        hint: "Membrane synth — good for kick/tom drums",
      },
      {
        label: "metal",
        code: "const m = audio.metal();\nm.play('8n');",
        hint: "Metallic synth for hi-hats and cymbals — no note arg needed",
      },
      {
        label: "noise",
        code: "const n = audio.noise();\nn.play('8n');",
        hint: "White noise synth — no note arg needed",
      },
      {
        label: "reverb",
        code: "const rev = audio.reverb(2);\nconst s = audio.synth();\ns.connect(rev);",
        hint: "Reverb effect — reverb(decay seconds). Connect instrument to it.",
      },
      {
        label: "delay",
        code: "const del = audio.delay(0.25, 0.5);\nconst s = audio.synth();\ns.connect(del);",
        hint: "Feedback delay — delay(time, feedback 0–1)",
      },
      {
        label: "distort",
        code: "const dist = audio.distort(0.8);\nconst s = audio.synth();\ns.connect(dist);",
        hint: "Distortion effect — distort(amount 0–1)",
      },
      {
        label: "filter",
        code: "const filt = audio.filter('lowpass', 800);\nconst s = audio.synth();\ns.connect(filt);",
        hint: "filter(type, freq, Q) — types: lowpass, highpass, bandpass, notch",
      },
      {
        label: "auto filter",
        code: "const af = audio.autoFilter(0.5);\nconst s = audio.fm();\ns.connect(af);",
        hint: "autoFilter(rate Hz) — LFO-driven filter sweep",
      },
      {
        label: "lfo",
        code: "const s = audio.synth();\nconst l = audio.lfo(2, 200, 2000);\nl.connect(s._.frequency);\nconst seq = audio.loop(time => s.play('C4', '8n', time), '4n');\nseq.start(0);\naudio.start();",
        hint: "lfo(freq, min, max) — connects to any Tone signal param: s._.frequency, s._.volume, etc.",
      },
      {
        label: "vibrato",
        code: "const vib = audio.vibrato(5, 0.2);\nconst s = audio.fm();\ns.connect(vib);",
        hint: "vibrato(freq Hz, depth 0–1) — pitch wobble",
      },
      {
        label: "tremolo",
        code: "const trem = audio.tremolo(8, 0.5);\nconst s = audio.synth();\ns.connect(trem);",
        hint: "tremolo(freq Hz, depth 0–1) — volume wobble",
      },
      {
        label: "compressor",
        code: "const comp = audio.compressor(-24, 12);\nconst s = audio.synth();\ns.connect(comp);",
        hint: "compressor(threshold dB, ratio) — dynamic range control",
      },
      {
        label: "eq",
        code: "const eq = audio.eq(3, 0, -6);\nconst s = audio.fm();\ns.connect(eq);",
        hint: "eq(low, mid, high) — 3-band EQ in dB",
      },
      {
        label: "phaser",
        code: "const ph = audio.phaser(0.5, 3);\nconst s = audio.fm();\ns.connect(ph);",
        hint: "phaser(rate Hz, octaves) — classic phase shift",
      },
      {
        label: "wah",
        code: "const wah = audio.wah(350);\nconst s = audio.fm();\ns.connect(wah);",
        hint: "wah(baseFreq) — auto-wah envelope filter",
      },
      {
        label: "pitch shift",
        code: "const ps = audio.pitchShift(7);\nconst s = audio.pluck();\ns.connect(ps);",
        hint: "pitchShift(semitones) — shift pitch up/down without changing speed",
      },
      {
        label: "chain effects",
        code: "const rev = audio.reverb(2);\nconst del = audio.delay(0.25, 0.3);\nconst s = audio.fm();\ns.chain(del, rev);",
        hint: "chain(...effects) — route instrument through multiple effects in series to output",
      },
      {
        label: "sequence",
        code: "const s = audio.synth();\nconst seq = audio.sequence(['C4','E4','G4','E4'], '8n', (note, time) => {\n  s.play(note, '8n', time);\n});\nseq.start(0);\naudio.bpm(120);\naudio.start();",
        hint: "Step sequencer — sequence(notes, subdivision, callback). Call seq.start(0) then audio.start().",
      },
      {
        label: "loop",
        code: "const s = audio.synth();\nconst l = audio.loop((time) => {\n  s.play('C4', '8n', time);\n}, '4n');\nl.start(0);\naudio.start();",
        hint: "Repeat callback every interval — loop(fn, interval). Call l.start(0) then audio.start().",
      },
      {
        label: "set bpm",
        code: "audio.bpm(120);",
        hint: "Set transport tempo in BPM",
      },
      {
        label: "start transport",
        code: "audio.start();",
        hint: "Start the transport clock — needed for sequence() and loop()",
      },
      {
        label: "master volume",
        code: "audio.volume(-6);",
        hint: "Set master output volume in dB (0 = unity, -6 = quieter)",
      },
      {
        label: "load audio file",
        code: "const file = audio.load('https://example.com/sound.mp3');\nawait file.ready;\nfile.play();",
        hint: "Load a remote audio file and play it. await file.ready before play() to ensure the buffer is loaded.",
      },
      {
        label: "upload audio file",
        code: "const file = await audio.upload();\nif (file) { await file.ready; file.play(); }",
        hint: "Open a file picker and load the chosen audio file. Returns null if cancelled.",
      },
      {
        label: "audio FX chain",
        code: "const file = audio.load('https://example.com/sound.mp3');\nawait file.ready;\nfile.filter('lowpass', 800).reverb(2).volume(-6).play();",
        hint: "Chain effects on a loaded file: .filter(type, freq, Q), .reverb(decay), .eq(lo,mid,hi), .delay(time, feedback), .pitchShift(semitones)",
      },
      {
        label: "audio.onTime callback",
        code: "const file = audio.load('https://example.com/sound.mp3');\nawait file.ready;\nfile.onTime(5, () => draw.bg('red'));\nfile.onTime(10, () => draw.bg('blue'));\nfile.play();",
        hint: "Fire callbacks at specific timestamps during playback (seconds). Resets on file.stop().",
      },
      {
        label: "seek + loop",
        code: "const file = audio.load('https://example.com/sound.mp3');\nawait file.ready;\nfile.loop(true).seek(30).play();\n// file.pause();  file.stop();  file.currentTime",
        hint: "Seek to a position (seconds), enable looping, pause/stop, read currentTime and duration.",
      },
    ],
  },
  {
    name: "Audio→Visual",
    commands: [
      {
        label: "beat → CA step",
        code: `const W = 64;
let cells = Array.from({length: W}, () => Math.random() > 0.6 ? 1 : 0);

function stepCA(c) {
  return c.map((_, i) => {
    const l = c[(i - 1 + W) % W], r = c[(i + 1) % W];
    return (c[i] + l + r) % 2; // XOR rule — try other combos
  });
}
function drawCA(c) {
  const bw = draw.width / W;
  draw.clear();
  c.forEach((v, i) => draw.rect(i * bw, 0, bw, draw.height, v ? '#fff' : '#111'));
}

const k = audio.kick();
pat('x . x . x . x x', (note, time, dur) => {
  k.play('C1', dur, time);
  cells = stepCA(cells);
  drawCA(cells);
}).start();
audio.bpm(120);
audio.start();`,
        hint: "Each kick advances a 1D cellular automaton one generation. Audio is the clock — visuals evolve independently.",
      },
      {
        label: "note → palette swap",
        code: `const palettes = [
  ['#ff0040','#ff6600','#ffcc00'],
  ['#00ffcc','#0066ff','#cc00ff'],
  ['#ffffff','#aaaaaa','#333333'],
  ['#ff00ff','#00ff00','#0000ff'],
];
let pal = palettes[0];
let particles = Array.from({length: 40}, () => ({
  x: Math.random(), y: Math.random(),
  vx: (Math.random()-0.5)*0.005, vy: (Math.random()-0.5)*0.005,
}));

setInterval(() => {
  draw.alpha(0.15).bg('#000').alpha(1);
  particles.forEach((p, i) => {
    p.x = (p.x + p.vx + 1) % 1;
    p.y = (p.y + p.vy + 1) % 1;
    draw.circle(p.x * draw.width, p.y * draw.height, 4, pal[i % pal.length]);
  });
}, 16);

const s = audio.fm({ volume: -6 });
const notes = ['C4','Eb4','G4','Bb4','D5'];
pat(notes.join(' '), (note, time, dur) => {
  s.play(note, dur, time);
  const idx = notes.indexOf(note);
  pal = palettes[idx % palettes.length]; // note value selects palette
}).start();
audio.bpm(100);
audio.start();`,
        hint: "Each note value selects a color palette. Audio drives visual state transitions — not a visualizer, a shared index.",
      },
      {
        label: "amplitude → gravity",
        code: `const meter = audio.meter();

let balls = Array.from({length: 20}, () => ({
  x: Math.random(), y: Math.random() * 0.5,
  vx: (Math.random()-0.5) * 0.01, vy: 0,
}));

setInterval(() => {
  const db = meter.getValue();
  const amp = isFinite(db) ? Math.pow(10, db / 20) : 0; // 0..1
  const gravity = amp * 0.004; // loud = strong pull

  draw.alpha(0.2).bg('#000').alpha(1);
  balls.forEach(b => {
    b.vy += gravity;
    b.x = (b.x + b.vx + 1) % 1;
    b.y += b.vy;
    if (b.y > 1) { b.y = 0; b.vy = 0; } // wrap top
    draw.circle(b.x * draw.width, b.y * draw.height, 6, \`hsl(\${b.x * 360}, 80%, 60%)\`);
  });
}, 16);

const s = audio.fm();
s.chain(meter); // synth → meter → destination
pat('C3 G3 E3 Bb3 D4', s).speed(1.5).start();
audio.bpm(130);
audio.start();`,
        hint: "RMS amplitude becomes gravitational force in a particle sim. Loud → balls fall faster. Nothing draws audio — amplitude perturbs physics.",
      },
      {
        label: "note pitch → shader",
        code: `const s = new Shader(\`
  let pulse = custom.x;      // amplitude (0..1)
  let hueShift = custom.y;   // mapped from pitch
  let d = distance(uv, vec2f(0.5));
  let ring = sin(d * 20.0 - time * 3.0 + pulse * 10.0) * 0.5 + 0.5;
  let h = hueShift + ring * 0.3;
  let col = vec3f(
    sin(h * 6.28) * 0.5 + 0.5,
    sin(h * 6.28 + 2.09) * 0.5 + 0.5,
    sin(h * 6.28 + 4.19) * 0.5 + 0.5
  );
  return vec4f(col * ring, 1.0);
\`);
s.start();

const meter = audio.meter();
const synth = audio.fm({ volume: -4 });
synth.chain(meter); // synth → meter → destination

const notes = ['C3','E3','G3','Bb3','D4','F4'];
pat(notes.join(' '), (note, time, dur) => {
  synth.play(note, dur, time);
  const midi = audio.freq(note);
  const hue = (midi - 130) / 600; // map freq range to 0..1
  s.set(1, hue);                  // pitch → hue shift in shader
}).start();

setInterval(() => {
  const db = meter.getValue();
  const amp = isFinite(db) ? Math.pow(10, db / 20) : 0;
  s.set(0, amp); // amplitude → ring distortion
}, 16);

audio.bpm(90);
audio.start();`,
        hint: "Pitch maps to shader hue, amplitude maps to ring distortion. Shader has its own visual logic — audio is just two input parameters.",
      },
      {
        label: "meter → blur",
        code: `const layer = getLayer(0);
const meter = audio.meter();

let angle = 0;
setInterval(() => {
  draw.clear();
  draw.push();
  draw.translate(draw.width/2, draw.height/2).rotate(angle);
  for (let i = 0; i < 6; i++) {
    draw.push().rotate(i * Math.PI / 3).rect(20, -4, 80, 8, \`hsl(\${i*60}, 70%, 60%)\`).pop();
  }
  draw.pop();
  angle += 0.01;

  const db = meter.getValue();
  const amp = isFinite(db) ? Math.pow(10, db / 20) : 0;
  layer.blur(amp * 20); // loud = blurry
}, 16);

const s = audio.fm();
s.chain(meter); // synth → meter → destination
pat('<C3 C4> E4 G4 <Bb3 B3>', s).speed(0.5).start();
audio.bpm(80);
audio.start();`,
        hint: "Amplitude drives CSS blur on the canvas layer. Loud moments go soft-focus. Audio influences visual *quality*, not what's drawn.",
      },
      {
        label: "mic → visual",
        code: "const mic = await audio.mic();\nconst meter = audio.meter();\nmic.connect(meter);\n\nlet radius = 10;\nsetInterval(() => {\n  const db = meter.getValue();\n  const amp = isFinite(db) ? Math.pow(10, db / 20) : 0;\n  radius = radius * 0.85 + amp * 300 * 0.15; // smoothed\n  draw.alpha(0.15).bg('#000').alpha(1);\n  draw.circle(draw.width/2, draw.height/2, Math.max(4, radius), `hsl(${amp * 200}, 80%, 60%)`);\n}, 16);",
        hint: "Mic amplitude drives a pulsing circle — loud = big and saturated. Replace the drawing with anything: particles, shader uniforms, layer blur.",
      },
      {
        label: "synth visualizer (bars)",
        code: "const synth = audio.fm();\nconst viz = audio.viz(synth).start();\n\nsynth.play('C3', '2n');\nsetInterval(() => synth.play('C3', '2n'), 2000);",
        hint: "audio.viz(source) creates an AudioViz — draws frequency bars full-screen. source can be any Instrument or Tone node. Modes: bars, wave, ring.",
      },
      {
        label: "visualizer modes",
        code: "const synth = audio.synth();\nconst viz = audio.viz(synth, { mode: 'wave', bins: 256, z: 5, opacity: 0.85 }).start();\n// modes: 'bars' (FFT spectrum), 'wave' (waveform), 'ring' (circular waveform)\n// viz.mode('ring')  — switch mode live\n// viz.color(120)    — hue override (degrees)\n// viz.opacity(0.5)\n// viz.stop()\n\nsetInterval(() => synth.play('E4', '8n'), 500);",
        hint: "AudioViz modes — bars=FFT spectrum, wave=waveform line, ring=circular waveform. Switch mode live with viz.mode('ring'). viz.canvas is a live canvas for shader use.",
      },
      {
        label: "visualizer + shader (fn)",
        code: "const synth = audio.pluck();\nconst viz = audio.viz(synth, { mode: 'bars' }).start();\n\n// Pass a JS function — auto-converts to WebGPU shader\n// v = frequency value 0-1, t = time\nviz.shader((v, t) => [v * Math.sin(t), v * 0.3, 1.0 - v, 1.0]);\n\nconst notes = ['C3','E3','G3','B3','C4','E4','G4'];\nsetInterval(() => synth.play(notes[Math.floor(Math.random()*notes.length)], '8n'), 300);",
        hint: "viz.shader(fn) converts a JS arrow function to WGSL automatically. (v) = frequency 0-1, (v, t) also gets time. Must return [r, g, b, a]. Math.sin/cos/abs/min/max/floor/sqrt/pow work. Use float literals (1.0 not 1).",
      },
      {
        label: "visualizer + shader (preset)",
        code: "const synth = audio.fm();\nconst viz = audio.viz(synth, { mode: 'ring', bins: 128 }).start();\n\n// Named presets: thermal, cool, rainbow, mono, neon\nviz.shader('rainbow');\n\nsetInterval(() => synth.play('C3', '2n'), 2000);",
        hint: "viz.shader('preset') — built-in palettes: thermal, cool, rainbow, mono, neon. AudioViz.presets lists all names.",
      },
      {
        label: "audio.signal → shader bind",
        code: "const synth = audio.fm();\nconst sig = audio.signal(synth);\n// sig.value=overall rms  sig.bass/mid/high=band averages  sig.fft=Float32Array\n\nconst s = new Shader(`\n  let amp = custom.x;  // rms\n  let bass = custom.y;\n  let mid  = custom.z;\n  let high = custom.w;\n  return vec4f(bass, mid * 0.5, high * 2.0, 1.0);\n`).bind(sig).start();\n\nsetInterval(() => synth.play('C3', '4n'), 500);\naudio.start();",
        hint: "audio.signal(source) → live {value, bass, mid, high, fft} object. shader.bind(sig) auto-fills custom=[rms,bass,mid,high] every frame. source can be any Tone node, Tone.Analyser, Web Audio AnalyserNode, or 'mic'.",
      },
      {
        label: "audio.signal → stream (RAF push)",
        code: "const synth = audio.fm();\nconst sig = audio.signal(synth);\n\n// .stream() fires fn every frame — no setInterval needed\nsig.stream(s => {\n  draw.clear();\n  draw.circle(800, 450, s.bass * 400, `hsl(${s.high * 360}, 80%, 50%)`);\n  draw.rect(0, 450 - s.mid * 200, 1600, 4, 'cyan');\n});\n\nsetInterval(() => synth.play('C3', '4n'), 500);\naudio.start();",
        hint: "sig.stream(fn) — RAF-driven push, fn(sig) called every frame. Cleaned up automatically on stop. No polling loop needed. Chainable: audio.signal(src).stream(fn).",
      },
      {
        label: "audio.signal → mic bind",
        code: "// Make sure mic toggle is on in the toolbar\nconst sig = audio.signal('mic');\n\nconst s = new Shader(`\n  let amp = custom.x; // mic rms\n  let r = sin(uv.x * 10.0 + time) * amp;\n  return vec4f(amp, r, custom.z, 1.0);\n`).bind(sig).start();",
        hint: "Pass 'mic' as source to audio.signal() or audio.fftCanvas() — reads from the harness mic analyser. Enable mic with the toolbar toggle first.",
      },
      {
        label: "audio.fftCanvas → shader texture",
        code: "const synth = audio.pluck();\n// fftCanvas: bins×1 canvas, R channel = FFT magnitude 0-1\n// uv.x in shader addresses frequency (0=bass, 1=treble)\nconst fftTex = audio.fftCanvas(synth, 256);\n\nconst s = new Shader(`\n  let amp = textureSample(video, videoSampler, vec2f(uv.x, 0.5)).r;\n  return vec4f(amp * 2.0, amp * uv.y, 1.0 - amp, 1.0);\n`, { video: fftTex }).start();\n\nconst notes = ['C3','E3','G3','B3','C4'];\nsetInterval(() => synth.play(notes[Math.floor(Math.random()*notes.length)], '8n'), 300);\naudio.start();",
        hint: "audio.fftCanvas(source, bins) returns a live bins×1 canvas. Feed it as video: to any Shader. Sample with uv.x (0=bass, 1=treble). Source can be Tone node, 'mic', or Tone.Analyser.",
      },
      {
        label: "audio.fftCanvas → mic texture",
        code: "// Make sure mic toggle is on\nconst fftTex = audio.fftCanvas('mic', 256);\n\nconst s = new Shader(`\n  let amp = textureSample(video, videoSampler, vec2f(uv.x, 0.5)).r;\n  let glow = amp * amp * 3.0;\n  return vec4f(glow, glow * 0.3, glow * 0.1, 1.0);\n`, { video: fftTex }).start();",
        hint: "audio.fftCanvas('mic') reads the harness mic analyser directly into a texture — full spectrum, no Tone nodes needed.",
      },
      {
        label: "audio.fft signal (master)",
        code: "// audio.fft taps the master output — no source needed\nconst s = new Shader(({ uv, time, custom }) => {\n  const bass = custom.x;\n  const high = custom.w;\n  return [uv.x * bass * 3.0, uv.y * 0.5, high * 2.0, 1.0];\n});\ns.bind(audio.fft);\ns.start();",
        hint: "audio.fft is a master-output signal: { value, bass, mid, high, fft }. Taps Tone.Destination automatically. Use .bind(audio.fft) on a Shader to fill custom.x/y/z/w each frame.",
      },
      {
        label: "audio.spectrogram",
        code: "const synth = audio.fm();\nconst spec = audio.spectrogram(synth, { bins: 256, width: 512, height: 256, palette: 'rainbow' });\ndocument.getElementById('canvasWrapper')?.appendChild(spec.canvas);\nObject.assign(spec.canvas.style, { position:'absolute', top:'0', left:'0', width:'100%', height:'100%' });\n\nsetInterval(() => synth.play('C3', '4n'), 500);\naudio.start();",
        hint: "audio.spectrogram(source, opts) → SpectrogramCanvas — scrolling frequency/time map. Palettes: rainbow, thermal, cool, mono. .canvas gives the live HTMLCanvasElement. source: Tone node, 'mic', or signal object.",
      },
      {
        label: "audio.pianoRoll",
        code: "const synth = audio.poly();\nconst roll = audio.pianoRoll({ z: 15, speed: 80 });\n\nconst notes = ['C4','D4','E4','G4','A4','C5'];\nsetInterval(() => {\n  const note = notes[Math.floor(Math.random() * notes.length)];\n  synth.play([note, 'G3'], '8n');\n}, 400);\naudio.start();",
        hint: "audio.pianoRoll() spawns a canvas overlay showing falling note blocks for every Instrument.play() call. opts: { z, opacity, speed (px/s), midiMin, midiMax }.",
      },
      {
        label: "audio.eqWidget",
        code: "const synth = audio.fm();\nconst eq = audio.eqWidget();\nsynth.chain(eq);\n// Drag sliders or call:\n// eq.low(-6).mid(3).high(-3)\n\nsetInterval(() => synth.play('A3', '4n'), 500);\naudio.start();",
        hint: "audio.eqWidget() spawns a floating 3-band EQ panel and returns a Tone-compatible node. Chain it: synth.chain(eq). Control programmatically: eq.low(dB), eq.mid(dB), eq.high(dB).",
      },
      {
        label: "file.waveform",
        code: "const file = audio.load('https://example.com/sound.mp3');\nawait file.ready;\nconst wv = file.waveform({ width: 640, height: 80 });\ndocument.getElementById('canvasWrapper')?.appendChild(wv);\nObject.assign(wv.style, { position:'absolute', bottom:'10px', left:'50%', transform:'translateX(-50%)' });\nfile.loop(true).play();",
        hint: "file.waveform(opts) → canvas with static waveform + live playhead. Click to seek. opts: { width, height, color, bg }.",
      },
    ],
  },
  {
    name: "Patterns",
    commands: [
      {
        label: "pat — melody",
        code: "const s = audio.fm();\npat('C4 E4 G4 B4', s).start();\naudio.bpm(120);\naudio.start();",
        hint: "Mini-notation melody — space-separated notes play evenly across one measure. Rests: ~ or .",
      },
      {
        label: "pat — drums",
        code: "const k = audio.kick();\npat('x . x . x . x x', k).start();\naudio.bpm(120);\naudio.start();",
        hint: "x = trigger, . or ~ = rest. Works with any synth; non-note values use default pitch C1.",
      },
      {
        label: "stack patterns",
        code: "const k = audio.kick();\nconst sn = audio.noise();\nconst s = audio.fm({ volume: -6 });\nstack(\n  pat('x . x .', k),\n  pat('. . x .', sn),\n  pat('C4 E4 G4 E4', s)\n).bpm(120).start();",
        hint: "stack(...pats) — layer multiple patterns, all synced. Call .bpm().start() on the result.",
      },
      {
        label: "groups [ ]",
        code: "const s = audio.pluck();\npat('C4 [E4 G4] B4 [C5 D5 E5]', s).start();\naudio.start();",
        hint: "[ ] groups share one time slot — [E4 G4] plays both notes in the time of one normal step.",
      },
      {
        label: "alternating < >",
        code: "const s = audio.fm();\npat('<C4 G3 F3> E4 G4', s).start();\naudio.start();",
        hint: "< > cycles through values each measure — C4 on cycle 0, G3 on cycle 1, F3 on cycle 2, repeat.",
      },
      {
        label: "repeat *N",
        code: "const s = audio.pluck();\npat('C4*4 ~ G4*2 E4', s).start();\naudio.start();",
        hint: "*N repeats a note N times inside its slot — C4*4 fires 4 rapid notes in the same space as one step.",
      },
      {
        label: "speed / slow",
        code: "const s = audio.fm();\npat('C4 E4 G4 B4', s).speed(2).start();\naudio.start();",
        hint: ".speed(n) plays n× faster. .slow(n) plays n× slower. Chain with other modifiers.",
      },
      {
        label: "euclid rhythms",
        code: "const k = audio.kick();\nconst hh = audio.metal({ volume: -10 });\nstack(\n  pat('x', k).euclid(3, 8),\n  pat('x', hh).euclid(5, 8)\n).bpm(130).start();",
        hint: ".euclid(k, n) — place k hits across n equal steps using Euclidean spacing. Classic polyrhythm.",
      },
      {
        label: "every N cycles",
        code: "const s = audio.fm();\npat('C4 E4 G4 B4', s)\n  .every(4, evts => [...evts].reverse())\n  .start();\naudio.start();",
        hint: ".every(n, fn) — apply fn to events every n cycles. fn gets [{value,time,dur}] and returns modified array.",
      },
      {
        label: "scale",
        code: "const notes = audio.scale('C4', 'minor'); // ['C4','D4','Eb4','F4','G4','Ab4','Bb4']\nconst s = audio.fm();\npat(notes.join(' '), s).speed(0.75).start();\naudio.bpm(110);\naudio.start();",
        hint: "audio.scale(root, name) — generate scale notes. Names: major, minor, dorian, phrygian, lydian, mixolydian, pentatonic, blues",
      },
      {
        label: "note from scale",
        code: "const sc = audio.scale('C4', 'pentatonic');\nconst s = audio.pluck();\nconst degrees = '0 2 4 2 1 4 0 3';\npat(degrees, (val, time, dur) => {\n  s.play(audio.note(sc, +val), dur, time);\n}).start();\naudio.start();",
        hint: "audio.note(scale, degree) — pick scale degree by index (wraps around). Combine with callback pat for melodic patterns by number.",
      },
      {
        label: "callback pat",
        code: "const k = audio.kick();\nconst s = audio.fm();\npat('C4 E4 [G4 B4] C5', (note, time, dur) => {\n  k.play('C1', dur, time);\n  s.play(note, dur * 1.5, time);\n}).start();\naudio.start();",
        hint: "Pass a function instead of instrument — receives (note, time, dur) for full control of multiple synths.",
      },
    ],
  },
  {
    name: "Canvas",
    commands: [
      {
        label: "get canvas",
        code: "const ctx = getCanvas(0).getContext('2d');\nctx.fillStyle = 'red';\nctx.fillRect(0, 0, 100, 100);",
        hint: "Get HTMLCanvasElement for z-index 0 — draw with 2D context",
      },
      {
        label: "get layer",
        code: "const layer = getLayer(0);",
        hint: "Get Layer object for z-index — apply blur, hue, opacity effects",
      },
      {
        label: "blur",
        code: "getLayer(0).blur(5);",
        hint: "Gaussian blur the layer (px)",
      },
      {
        label: "hue shift",
        code: "getLayer(0).hue(90);",
        hint: "Shift hue by degrees (0–360)",
      },
      {
        label: "brightness",
        code: "getLayer(0).brightness(1.5);",
        hint: "Adjust brightness (1 = normal, 2 = double)",
      },
      {
        label: "saturate",
        code: "getLayer(0).saturate(2);",
        hint: "Adjust saturation (1 = normal, 0 = grayscale)",
      },
      {
        label: "invert",
        code: "getLayer(0).invert(1);",
        hint: "Invert colors (0–1, 1 = full invert)",
      },
      {
        label: "opacity",
        code: "getLayer(0).opacity(0.5);",
        hint: "Layer opacity (0 = invisible, 1 = full)",
      },
      {
        label: "rotate",
        code: "getLayer(0).rotate(45);",
        hint: "Rotate entire layer in degrees",
      },
      {
        label: "scale",
        code: "getLayer(0).scale(1.5);",
        hint: "Scale layer (1 = normal, 2 = double)",
      },
      {
        label: "clip",
        code: "getLayer(0).clip('circle(50%)');",
        hint: "Clip layer to CSS clip-path shape",
      },
      {
        label: "reset effects",
        code: "getLayer(0).reset();",
        hint: "Remove all CSS effects from the layer",
      },
      {
        label: "blend mode",
        code: "getLayer(1).blendMode('screen');",
        hint: "CSS mix-blend-mode for layer compositing — 'multiply' 'screen' 'overlay' 'difference' 'lighten' 'darken' 'hard-light' 'soft-light' 'exclusion' 'color-burn'",
      },
      {
        label: "pixelate",
        code: "draw.pixelate(getCanvas(0), 8);",
        hint: "Render a blocky pixelated copy of any canvas onto the draw target — pixelate(source, blockSize, x?, y?, w?, h?)",
      },
      {
        label: "ASCII art",
        code: "const art = draw.toASCII(getCanvas(0), { cols: 80 });\nconst id = wm.spawn('ASCII', { type: 'html', html: '', w: 600, h: 400, onClose: stopRunning });\ndocument.getElementById(id)?.querySelector('.wm-body').appendChild(art.el);\nsetInterval(() => art.update(getCanvas(0)), 50);",
        hint: "Convert canvas to ASCII <pre> — toASCII(canvas, { cols, rows, charset, bg, color }) → { el, update(canvas) }",
      },
      {
        label: "edit image",
        code: "const img = editImage(await Media.image('https://example.com/photo.jpg'));\nimg.crop(100, 0, 800, 600).rotate(15);\ndraw.image(img.toCanvas(), 0, 0);",
        hint: "Non-destructive image pipeline — editImage(src).crop(x,y,w,h).rotate(deg).filter(cssStr).flipH().flipV().blend(other,'screen').toCanvas()",
      },
    ],
  },
  {
    name: "Pipeline",
    commands: [
      {
        label: "ASCII camera",
        code: "const cam = await Camera.open();\npipe(cam)\n  .ascii({ cols: 120, color: '#00ff41', bg: '#0d0208' })\n  .show('ASCII Cam', { w: 700, h: 500 });",
        hint: "pipe(source) starts a render pipeline. .ascii(opts) renders ASCII art to a canvas. .show(title, {w,h}) spawns a window.",
        tags: ["pipe", "ascii", "camera", "pipeline"],
      },
      {
        label: "ASCII + shader",
        code: "const cam = await Camera.open();\npipe(cam)\n  .ascii({ cols: 150, color: '#00ff41', bg: '#0d0208' })\n  .glshader(`\n    vec4 a = texture2D(uVideo, uv);\n    float l = dot(a.rgb, vec3(.299,.587,.114));\n    vec3 rain = .5+.5*cos(6.28*(uv.y+time*.4+vec3(0,.33,.67)));\n    gl_FragColor = vec4(rain*l, 1.);\n  `)\n  .show('ASCII Cam', { w: 700, h: 500 });",
        hint: "Chain ASCII then a GLSL color shader — one raf loop, auto-cleanup on reset. No captureWindow needed.",
        tags: ["pipe", "ascii", "glshader", "shader", "pipeline", "camera"],
      },
      {
        label: "camera → shader",
        code: "const cam = await Camera.open();\npipe(cam)\n  .glshader(`\n    vec4 c = texture2D(uVideo, uv);\n    float g = dot(c.rgb, vec3(.299,.587,.114));\n    gl_FragColor = vec4(g, g*0.5, 1.0-g, 1.0);\n  `)\n  .show('Camera Shader', { w: 700, h: 500 });",
        hint: "Direct camera → GLShader pipeline. uVideo samples the camera feed.",
        tags: ["pipe", "glshader", "shader", "camera", "pipeline"],
      },
      {
        label: "pixelate camera",
        code: "const cam = await Camera.open();\npipe(cam)\n  .pixelate({ blockSize: 20 })\n  .show('Pixelate', { w: 700, h: 500 });",
        hint: "Mosaic/pixelate stage — blockSize controls pixel block size.",
        tags: ["pipe", "pixelate", "camera", "pipeline"],
      },
      {
        label: "fx filter",
        code: "const cam = await Camera.open();\npipe(cam)\n  .fx('hue-rotate(120deg) saturate(2)')\n  .show('FX', { w: 700, h: 500 });",
        hint: ".fx(cssFilter) applies any CSS filter string — blur, hue-rotate, invert, saturate, sepia, etc.",
        tags: ["pipe", "fx", "filter", "camera", "pipeline"],
      },
      {
        label: "canvas → pipeline",
        code: "pipe(getCanvas(0))\n  .ascii({ cols: 80, color: '#ff6600' })\n  .show('Canvas ASCII', { w: 600, h: 400 });",
        hint: "Pass any canvas as source — pipe() accepts CameraStream, canvas, video, GLShader, Shader, or Layer.",
        tags: ["pipe", "ascii", "canvas", "pipeline"],
      },
      {
        label: "custom stage",
        code: "const cam = await Camera.open();\npipe(cam)\n  .use(src => {\n    const canvas = document.createElement('canvas');\n    canvas.width = 800; canvas.height = 600;\n    const ctx = canvas.getContext('2d');\n    return {\n      canvas,\n      read() {\n        ctx.filter = 'invert(1)';\n        ctx.drawImage(src, 0, 0, canvas.width, canvas.height);\n        ctx.filter = 'none';\n      }\n    };\n  })\n  .show('Custom Stage', { w: 700, h: 500 });",
        hint: ".use(factory) — custom pipeline stage. factory(srcDrawable) called once at start, returns { canvas, read() }. read() called every frame.",
        tags: ["pipe", "use", "custom", "stage", "pipeline", "extensible"],
      },
    ],
  },
  {
    name: "Vision",
    commands: [
      {
        label: "nearest object",
        code: "vision.nearest('person')",
        hint: "Highest-confidence detected object of label — {label, cx, cy, confidence} or null",
      },
      {
        label: "all objects",
        code: "vision.objects()",
        hint: "All detected objects — [{label, cx, cy, confidence}]",
      },
      {
        label: "any detected?",
        code: "vision.any('person')",
        hint: "True if any object of this label is currently detected",
      },
      {
        label: "gesture",
        code: "vision.gesture()",
        hint: "Current hand gesture — 'Thumb_Up', 'Open_Palm', 'Closed_Fist', 'Pointing_Up', 'Victory', 'ILoveYou', or null",
      },
      {
        label: "expression",
        code: "vision.expression()",
        hint: "Current face expression — 'smile', 'surprise', 'frown', 'mouth_open', 'neutral', or null",
      },
      {
        label: "face",
        code: "vision.face()",
        hint: "Detected face — {expression, cx, cy, landmarks} or null",
      },
      {
        label: "hands",
        code: "vision.hands()",
        hint: "All detected hands — [{gesture, cx, cy, confidence, landmarks}]",
      },
    ],
  },
  {
    name: "Control",
    commands: [
      {
        label: "set interval",
        code: "setInterval(() => {\n  \n}, 100);",
        hint: "Run code every N milliseconds",
      },
      {
        label: "set timeout",
        code: "setTimeout(() => {\n  \n}, 1000);",
        hint: "Run code once after N milliseconds",
      },
      {
        label: "on key",
        code: 'onKey("ArrowUp", (e) => {\n  \n});',
        hint: "Fire when a key is pressed — pass 'any' to match all keys",
      },
      {
        label: "random number",
        code: "randUni(0, 100)",
        hint: "Random number between lo and hi",
      },
      {
        label: "random color",
        code: "Color.random()",
        hint: "A random vivid HSL color string",
      },
      {
        label: "pause",
        code: "pause();",
        hint: "Pause program execution (freezes timers)",
      },
      {
        label: "resume",
        code: "resume();",
        hint: "Resume paused program execution",
      },
      {
        label: "stop",
        code: "stop();",
        hint: "Stop program execution and clean up",
      },
    ],
  },
  {
    name: "Events",
    commands: [
      {
        label: "on gesture",
        code: 'vision.onGesture("Thumb_Up", () => {\n  \n});',
        hint: "Fire once when a gesture is first detected — gestures: Thumb_Up, Thumb_Down, Open_Palm, Closed_Fist, Pointing_Up, Victory, ILoveYou",
      },
      {
        label: "on expression",
        code: 'vision.onExpression("smile", () => {\n  \n});',
        hint: "Fire once when a face expression is first detected — expressions: smile, surprise, frown, mouth_open",
      },
      {
        label: "on key",
        code: 'onKey("ArrowUp", (e) => {\n  \n});',
        hint: "Fire when a key is pressed — pass 'any' to match all keys",
      },
    ],
  },
  {
    name: "Camera & Mic",
    commands: [
      {
        label: "camera shader",
        code: "ShaderFX.camera('greyscale');",
        hint: "Toolbar camera shader. Effects: greyscale, invert, channel_swap, posterize, scanlines",
      },
      {
        label: "camera shader (specific camera)",
        code: "const cam = await Camera.open({ index: 0 });\nShaderFX.camera(cam, 'greyscale');",
        hint: "Apply shader to a specific Camera.open() stream — pass the stream as first arg",
      },
      {
        label: "camera shader (composable)",
        code: "const s = ShaderFX.cameraShader('greyscale');\ns.start();\n// later: s.stop(); s.opacity(0.5);",
        hint: "Camera shader you can control — stop, fade opacity, swap effects. Pass a CameraStream as first arg for multi-camera.",
      },
      {
        label: "microphone",
        code: "const mic = await audio.mic();\n// mic is live — connect to effects or analysis\nconst rev = audio.reverb(2);\nmic.connect(rev);",
        hint: "Open mic input — async, prompts browser permission. Connect to effects, meter, or analyser.",
      },
      {
        label: "mic → meter",
        code: "const mic = await audio.mic();\nconst meter = audio.meter();\nmic.connect(meter);\n\nsetInterval(() => {\n  const db = meter.getValue();\n  const amp = isFinite(db) ? Math.pow(10, db / 20) : 0;\n  console.log('amplitude:', amp.toFixed(3));\n}, 100);",
        hint: "Read mic amplitude each frame — db from meter.getValue(), convert to linear with Math.pow(10, db/20)",
      },
      {
        label: "mic → pitch detect",
        code: "const mic = await audio.mic();\nconst fft = audio.analyser(2048);\nmic.connect(fft);\n\nsetInterval(() => {\n  const bins = fft.getValue(); // Float32Array of dB\n  const sampleRate = 44100;\n  let maxI = 0;\n  for (let i = 1; i < bins.length; i++) if (bins[i] > bins[maxI]) maxI = i;\n  const hz = (maxI / bins.length) * (sampleRate / 2);\n  if (hz > 50 && hz < 2000) console.log(hz.toFixed(0) + ' Hz');\n}, 100);",
        hint: "Rough pitch detection from mic FFT — finds peak bin frequency. Works for clear tones, not polyphonic material.",
      },
      {
        label: "mic level (float)",
        code: "// audio.level → 0–1 RMS amplitude. Enable mic in toolbar first.\nsetInterval(() => {\n  console.log(audio.level.toFixed(3));\n}, 100);",
        hint: "audio.level — live mic amplitude 0–1 (RMS). Enable mic in toolbar. Poll or use audio.onLevel() for triggers.",
      },
      {
        label: "mic level trigger",
        code: "audio.onLevel(0.6, () => {\n  draw.bg('red'); // loud\n}, () => {\n  draw.bg('black'); // quiet\n});",
        hint: "audio.onLevel(threshold, onEnter, onExit?) — edge-triggered when mic amplitude crosses threshold (0–1). Enable mic in toolbar.",
      },
      {
        label: "voice command",
        code: "audio.onWord('red', () => draw.bg('red'));\naudio.onWord('blue', () => draw.bg('blue'));\naudio.onWord('clear', () => draw.clear());",
        hint: "audio.onWord(word, fn) — fires when that word is spoken. Uses Web Speech API (Chrome/Edge). Mic must be enabled.",
      },
      {
        label: "speech transcript",
        code: "audio.onSpeech((text) => {\n  console.log('heard:', text);\n  draw.text(text, 50, 50, { size: 24, color: 'white' });\n});",
        hint: "audio.onSpeech(fn) — fires with full transcript string on every recognized utterance.",
      },
      {
        label: "text to speech",
        code: "audio.say('hello world');",
        hint: "audio.say(text, opts?) — speak text via browser TTS. opts: { voice, rate (0.1–10), pitch (0–2), volume (0–1), lang }",
      },
      {
        label: "TTS with options",
        code: "// List available voices:\nconsole.log(audio.voices());\n\naudio.say('hello', { voice: 'Samantha', rate: 0.8, pitch: 1.2, volume: 1 });",
        hint: "audio.voices() → array of voice name strings. Pass a name as opts.voice to audio.say().",
      },
      {
        label: "video signal — camera",
        code: "// Enable camera in toolbar first\nconst sig = video.signal('camera', { x: 0.5, y: 0.5, radius: 0.1 });\n// sig.brightness 0–1 luminance  sig.r / .g / .b  sig.motion 0–1  sig.hue 0–360\n\n// .stream() — RAF push, no polling needed\nsig.stream(s => {\n  draw.clear();\n  draw.circle(800, 450, s.brightness * 400, `hsl(${s.hue}, 80%, 50%)`);\n});\n\naudio.start();",
        hint: "video.signal(source, opts) → live {brightness, r, g, b, motion, hue}. sig.stream(fn) fires fn every frame — no setInterval needed, cleaned up on stop.",
      },
      {
        label: "video signal — motion trigger",
        code: "// Enable camera in toolbar first\nconst sig = video.signal('camera', { x: 0.5, y: 0.5, radius: 0.3 });\nconst kick = audio.kick();\n\nlet wasStill = true;\nsetInterval(() => {\n  if (sig.motion > 0.15 && wasStill) {\n    kick.play('C1', '8n');\n    wasStill = false;\n  } else if (sig.motion < 0.05) {\n    wasStill = true;\n  }\n}, 33);\naudio.start();",
        hint: "sig.motion = RMS pixel diff between frames (0–1). Cheap motion detection without Vision API — wave hand to trigger.",
      },
      {
        label: "video signal → shader",
        code: "// Enable camera in toolbar first\nconst sig = video.signal('camera');\n\nconst s = new Shader(`\n  let bright = custom.x;  // camera brightness\n  let motion = custom.y;  // motion intensity\n  let hue    = custom.z;  // dominant hue 0–1\n  return vec4f(motion * 2.0, bright, hue, 1.0);\n`);\n\nsetInterval(() => s.set([sig.brightness, sig.motion, sig.hue / 360, 0]), 16);\ns.start();",
        hint: "Read video.signal() getters and push to shader.set() — or use audio.signal() + shader.bind() for audio sources. video.signal works on any canvas: 'camera', getCanvas(0), viz.canvas.",
      },
      {
        label: "video signal — color → note",
        code: "// Enable camera in toolbar first\nconst sig = video.signal('camera', { x: 0.5, y: 0.3, radius: 0.05 });\nconst scale = audio.scale('C3', 'pentatonic');\nconst synth = audio.pluck();\n\nsetInterval(() => {\n  const degree = Math.floor(sig.hue / 360 * scale.length);\n  synth.play(scale[degree], '16n');\n}, 200);\naudio.start();",
        hint: "Map camera hue → scale degree → note. Move a colored object in front of the camera to play different pitches.",
      },
      {
        label: "video.onMotion — trigger",
        code: "// Enable camera in toolbar first\nconst kick = audio.kick();\nconst snare = audio.noise();\n\nvideo.onMotion('camera', 0.12, () => {\n  kick.play('C1', '8n');\n}, () => {\n  // motion stopped\n});\naudio.start();",
        hint: "video.onMotion(source, threshold, onEnter, onExit?) — edge-triggered when motion crosses threshold 0–1. onExit fires when motion drops back below. Reuse an existing video.signal() object as source to share the sampling loop.",
      },
      {
        label: "video.onBrightness — trigger",
        code: "// Enable camera in toolbar first — cover/uncover camera to trigger\nconst synth = audio.fm();\n\nvideo.onBrightness('camera', 0.5,\n  () => synth.play('C4', '4n'),  // bright\n  () => synth.play('G3', '4n')   // dark\n);\naudio.start();",
        hint: "video.onBrightness(source, threshold, onEnter, onExit?) — fires when average brightness of sampled region crosses threshold. Like audio.onLevel but for camera or any canvas.",
      },
      {
        label: "video triggers — shared signal",
        code: "// Share one sampling loop, multiple triggers\nconst sig = video.signal('camera', { x: 0.5, y: 0.5, radius: 0.2 });\nconst kick  = audio.kick();\nconst synth = audio.fm();\n\nvideo.onMotion(sig, 0.1, () => kick.play('C1', '8n'));\nvideo.onBrightness(sig, 0.6,\n  () => synth.play('C5', '16n'),\n  () => synth.play('G3', '16n')\n);\naudio.start();",
        hint: "Pass an existing video.signal() object as source to onMotion/onBrightness — reuses the same pixel sampling loop instead of creating a new one per trigger.",
      },
      {
        label: "cam.flip — mirror camera",
        code: "const cam = await Camera.open();\ncam.flip(true);   // mirror horizontally\n// cam.flip(false) to undo\n// Or click the ↔ button in the toolbar when camera is on",
        hint: "cam.flip(bool) mirrors the Camera.open() video element horizontally. The toolbar ↔ button mirrors the main toolbar camera canvas.",
      },
    ],
  },
  {
    name: "Windows",
    commands: [
      {
        label: "layout",
        code: "wm.layout('split');",
        hint: "Switch to a named tiling layout — 'split' (toolkit + editor side by side)",
      },
      {
        label: "show",
        code: "wm.show('win-canvas');",
        hint: "Show a window by id — built-in ids: win-toolkit, win-editor, win-canvas, win-console, win-camera, win-mic",
      },
      {
        label: "hide",
        code: "wm.hide('win-canvas');",
        hint: "Hide a window (built-ins hide; spawned windows are removed from DOM)",
      },
      {
        label: "toggle",
        code: "wm.toggle('win-console');",
        hint: "Toggle a window's visibility",
      },
      {
        label: "focus",
        code: "wm.focus('win-editor');",
        hint: "Bring a window to front",
      },
      {
        label: "move",
        code: "wm.move('win-canvas', 200, 100);",
        hint: "Move a window — x, y in pixels from top-left of desktop",
      },
      {
        label: "resize",
        code: "wm.resize('win-canvas', 640, 480);",
        hint: "Resize a window — width, height in pixels",
      },
      {
        label: "maximize",
        code: "wm.maximize('win-canvas');",
        hint: "Maximize a window to fill the desktop",
      },
      {
        label: "restore",
        code: "wm.restore('win-canvas');",
        hint: "Restore a maximized window to its previous size",
      },
      {
        label: "spawn html",
        code: "const id = wm.spawn('Info', { type: 'html', html: '<h2>hello</h2>', onClose: stopRunning });\n// wm.close(id);",
        hint: "Spawn a floating window with arbitrary HTML content. onClose: fn → called when window is closed (e.g. stopRunning)",
      },
      {
        label: "spawn image",
        code: "const src = await wm.pickFile('photo');\nwm.spawn('photo', { type: 'image', src, w: 480, h: 360 });",
        hint: "Pick an image file once (cached by key), spawn it in a window",
      },
      {
        label: "spawn video",
        code: "const src = await wm.pickFile('clip');\nwm.spawn('video', { type: 'video', src, w: 640, h: 480, controls: true });",
        hint: "Pick a video file once (cached by key), spawn it in a window",
      },
      {
        label: "pickFile",
        code: "const url = await wm.pickFile('myFile');\n// url is a blob URL — reuse key to skip picker next time",
        hint: "Pick a file via browser picker — caches the handle by key, no re-prompt while permission active",
      },
      {
        label: "browse dir",
        code: "await wm.browse('myDir', (url, name) => {\n  wm.spawn(name, { type: 'image', src: url, w: 480, h: 360 });\n});",
        hint: "Open a directory picker and spawn a file browser window — click any file to get its blob URL",
      },
      {
        label: "spawn camera",
        code: "const id = wm.spawn('camera', { type: 'camera', w: 320, h: 240 });",
        hint: "Spawn a window mirroring the camera feed",
      },
      {
        label: "spawn canvas",
        code: "const id = wm.spawn('canvas', { type: 'canvas', z: 0, w: 640, h: 480 });",
        hint: "Spawn a window mirroring a canvas layer at z-index z",
      },
      {
        label: "spawn shader",
        code: "const s = new Shader(`...`).start();\nconst id = wm.spawn('FX', { type: 'shader', shader: s, w: 640, h: 480 });",
        hint: "Spawn a window mirroring a Shader's output canvas",
      },
      {
        label: "spawn visualizer",
        code: "wm.spawn('Visualizer', { type: 'viz', w: 400, h: 240 });",
        hint: "Spawn an audio visualizer window — pick source (master, mic, video, channel) and style (bars, wave, ring) from built-in controls",
      },
      {
        label: "apply shader to window",
        code: "// Apply a WebGPU shader directly inside any window — renders on top of its content\n// Auto-detects canvas/video source inside the window as video: input\nconst s = wm.applyShader('win-canvas-1', `\n  let col = textureSample(video, videoSampler, uv);\n  let grey = col.r * 0.299 + col.g * 0.587 + col.b * 0.114;\n  return vec4f(grey, grey * 0.8, grey * 0.6, 1.0);\n`);\n// s is a live Shader — s.set([...]), s.opacity(0.5), s.stop()",
        hint: "wm.applyShader(winId, wgslCode, opts?) — mounts a shader canvas inside the target window's body. Auto-detects video source (canvas, camera, video element). Returns the Shader. Pass video: explicitly in opts to override.",
      },
      {
        label: "apply shader to camera window",
        code: "// Enable camera in toolbar first\nconst s = wm.applyShader('win-camera', `\n  let col = textureSample(video, videoSampler, uv);\n  let inv = vec4f(1.0 - col.r, 1.0 - col.g, 1.0 - col.b, 1.0);\n  return mix(col, inv, abs(sin(time)));\n`);\n// Pulses between normal and inverted camera feed",
        hint: "wm.applyShader on the camera window auto-detects the camera canvas as the video source — no extra setup needed.",
      },
      {
        label: "list windows",
        code: "console.log(wm.list());",
        hint: "List all current window ids in the desktop",
      },
      {
        label: "spawn transparent",
        code: "const id = wm.spawn('Overlay', { type: 'html', html: '<p style=\"color:#fff\">Hi</p>', transparent: true, noChrome: true, w: 200, h: 80 });",
        hint: "Spawn a window transparent and chrome-free immediately — no need to click the ghost button afterwards",
      },
      {
        label: "setZ / setOpacity",
        code: "wm.setZ(id, 9999);       // raise window stacking order\nwm.setOpacity(id, 0.5); // 0 = invisible, 1 = opaque",
        hint: "Live-update window z-index and CSS opacity without re-spawning",
      },
      {
        label: "sync video",
        code: "// Sync button in video window titlebar syncs all other video windows to same currentTime\n// Or call from code:\nconst vid = document.querySelector('#win-spawn-1 video');\nconst t = vid?.currentTime ?? 0;\ndocument.querySelectorAll('.wm-body video').forEach(v => { if (v !== vid) v.currentTime = t; });",
        hint: "Use the ⟳ button in video window titlebar to sync playback time with all other video windows",
      },
    ],
  },
  {
    name: "Desktop",
    commands: [
      {
        label: "desktop.files()",
        code: "// List all files currently on the desktop\nconsole.log(desktop.files());\n// Each: { id, name, type, url, x, y }\n// type: 'image' | 'video' | 'audio' | 'code' | 'file'",
        hint: "desktop.files() → array of { id, name, type, url, x, y }. Drop files from OS onto the IDE desktop to create icons.",
      },
      {
        label: "desktop.onFile — shader",
        code: "// Auto-load any dropped image or video as shader texture\ndesktop.onFile(f => {\n  if (f.type !== 'image' && f.type !== 'video') return;\n  const el = f.type === 'image'\n    ? Object.assign(new Image(), { src: f.url })\n    : Object.assign(document.createElement('video'), { src: f.url, loop: true, muted: true });\n  if (f.type === 'video') el.play();\n  new Shader(({ uv, col }) => [col.r, col.g, col.b, col.a], { video: el }).start();\n});",
        hint: "desktop.onFile(fn) — fires whenever a file is dropped or added. fn receives { id, name, type, url, el }. Cleared on reset.",
      },
      {
        label: "desktop.onFile — audio",
        code: "// Play any audio file dropped onto desktop\ndesktop.onFile(f => {\n  if (f.type !== 'audio') return;\n  const a = new Audio(f.url);\n  a.play();\n});",
        hint: "Use desktop.onFile to auto-handle specific file types. type is 'image' | 'video' | 'audio' | 'code' | 'file'.",
      },
      {
        label: "desktop.onFile — video signal",
        code: "// Route any dropped video into the video signal bus\ndesktop.onFile(f => {\n  if (f.type !== 'video') return;\n  const v = Object.assign(document.createElement('video'), { src: f.url, loop: true, muted: true });\n  v.play();\n  const sig = video.signal(v);\n  sig.stream(s => console.log('brightness:', s.brightness.toFixed(3)));\n});",
        hint: "Dropped videos become video.signal() sources — feed into shaders, draw, or audio triggers.",
      },
      {
        label: "desktop.add",
        code: "// Add an icon programmatically (e.g. from a fetch'd image)\ndesktop.add('https://example.com/photo.jpg', { name: 'photo.jpg', x: 100, y: 100 });",
        hint: "desktop.add(url, { name, type, x, y }) — create a file icon without drag-drop. type auto-detected from name if omitted.",
      },
      {
        label: "desktop.add — styled",
        code: "desktop.add(url, {\n  name: 'photo.jpg',\n  x: 100, y: 100,\n  rotation: 15,        // tilt in degrees\n  tint: 180,           // hue-rotate in degrees (thumbnail only)\n  scale: 1.3,          // scale factor\n  animate: 'spin',     // 'spin' | 'bounce' | 'pulse' | CSS animation string\n  labelPosition: 'above', // 'above' | 'below' (default)\n  labelColor: '#ff0',  // label text color\n});",
        hint: "Visual opts for desktop.add(): rotation (deg), tint (hue-rotate deg on thumb), scale, animate ('spin'/'bounce'/'pulse'), labelPosition ('above'/'below'), labelColor",
      },
      {
        label: "desktop.clear",
        code: "desktop.clear(); // remove all icons",
        hint: "desktop.clear() removes all file icons from the desktop.",
      },
    ],
  },
  {
    name: "Sensors",
    commands: [
      {
        label: "mouse signal",
        code: "const ms = sensors.mouse();\nms.stream(s => {\n  draw.clear();\n  draw.circle(s.x * 800, s.y * 450, 20, 'white');\n});",
        hint: "sensors.mouse() → { x, y (0–1), vx, vy, speed, buttons, left, right, middle }. .stream(fn) — RAF push. .onMove(threshold, onEnter, onExit?). .onButton(btn, onDown, onUp?).",
      },
      {
        label: "mouse → shader",
        code: "const ms = sensors.mouse();\nconst s = new Shader(({ uv, time, custom }) => {\n  // custom.x = mouse.x, custom.y = mouse.y via .set()\n  const d = length(uv - vec2(custom.x, custom.y));\n  return [1.0 - smoothstep(0.0, 0.1, d), uv.y, uv.x, 1.0];\n});\nms.stream(m => s.set([m.x, m.y, 0, 0]));\ns.start();",
        hint: "Pipe mouse position into shader custom uniform each frame via .stream().",
      },
      {
        label: "mouse onMove trigger",
        code: "const ms = sensors.mouse();\nms.onMove(0.005,\n  s => console.log('moving', s.speed.toFixed(4)),\n  s => console.log('stopped')\n);",
        hint: "Edge-trigger: fires onEnter when movement speed >= threshold (normalized units/frame), onExit when it drops below.",
      },
      {
        label: "keyboard signal",
        code: "const kb = sensors.keyboard();\nkb.stream(k => {\n  if (k.is('ArrowLeft'))  draw.rect(0, 0, 100, 100, 'red');\n  if (k.is('ArrowRight')) draw.rect(700, 0, 100, 100, 'blue');\n  if (k.is(' '))          draw.clear();\n});\n// kb.held — Set of held keys   kb.last — last key pressed",
        hint: "sensors.keyboard() → { held (Set), last, is(key), any(...keys) }. .stream(fn) RAF. .onKey(key, onDown, onUp?) — key names: 'a', 'ArrowLeft', ' ', 'Enter', '*' for any.",
      },
      {
        label: "keyboard onKey",
        code: "const kb = sensors.keyboard();\nkb.onKey(' ', () => draw.clear());\nkb.onKey('ArrowUp',   () => console.log('up'));\nkb.onKey('ArrowDown', () => console.log('down'));",
        hint: "kb.onKey(key, onDown, onUp?) — edge trigger, cleaned up on reset. Use '*' to match any key.",
      },
      {
        label: "gamepad signal",
        code: "// Connect a gamepad first (press any button to activate)\nconst gp = sensors.gamepad(0); // index 0 = first controller\ngp.stream(g => {\n  if (!g.connected) return;\n  const x = g.axis(0); // left stick X  -1..1\n  const y = g.axis(1); // left stick Y  -1..1\n  draw.clear();\n  draw.circle(400 + x * 200, 225 + y * 200, 30, 'white');\n});",
        hint: "sensors.gamepad(index) → { connected, axes[], buttons[], axis(i), button(i), pressed(i) }. .onButton(i, onDown, onUp?). .onAxis(i, threshold, onEnter, onExit?).",
      },
      {
        label: "gamepad onButton",
        code: "const gp = sensors.gamepad(0);\ngp.onButton(0, g => audio.say('A pressed'));\ngp.onButton(1, g => audio.say('B pressed'));\n// Standard mapping: 0=A, 1=B, 2=X, 3=Y, 4=LB, 5=RB",
        hint: "Edge-trigger on controller button. Standard gamepad button mapping: 0=A/Cross, 1=B/Circle, 2=X/Square, 3=Y/Triangle, 4=LB, 5=RB, 6=LT, 7=RT.",
      },
      {
        label: "motion signal",
        code: "// Mobile or laptop with accelerometer\n// iOS: call sensors.requestMotion() from a button click first\nconst mot = sensors.motion();\nmot.stream(m => {\n  draw.clear();\n  draw.circle(400 + m.gamma * 4, 225 - m.beta * 4, 20, 'cyan');\n  // m.ax/ay/az  acceleration m/s²  (incl. gravity)\n  // m.alpha/beta/gamma  orientation degrees\n});",
        hint: "sensors.motion() → { ax, ay, az (m/s²), gx, gy, gz (deg/s rotation), alpha (compass 0–360), beta (tilt -180..180), gamma (tilt -90..90), magnitude }. .onShake(threshold, fn). .onTilt(axis, threshold, fn).",
      },
      {
        label: "motion onShake",
        code: "const mot = sensors.motion();\nmot.onShake(20,\n  m => { draw.clear(); draw.bg('#f00'); },\n  m => draw.bg('#000')\n);",
        hint: "Fires when total acceleration magnitude >= threshold m/s². 15 = moderate shake, 25 = hard shake.",
      },
      {
        label: "geolocation signal",
        code: "const geo = sensors.geo();\ngeo.stream(g => {\n  if (!g.ready) return;\n  console.log(`${g.lat.toFixed(5)}, ${g.lon.toFixed(5)} ±${g.accuracy|0}m`);\n  // g.speed m/s   g.heading degrees from north\n});",
        hint: "sensors.geo({ highAccuracy: false }) → { lat, lon, altitude, accuracy, speed, heading, ready, error }. Browser asks for permission on first call.",
      },
      {
        label: "network signal",
        code: "const net = sensors.network();\nconsole.log(net.online, net.type, net.downlink + 'Mbps');\nnet.onChange(n => {\n  console.log(n.online ? 'back online' : 'offline', n.type);\n});",
        hint: "sensors.network() → { online, type ('4g'|'3g'|'wifi'|'ethernet'|…), downlink (Mbps), rtt (ms), saveData }. .onChange(fn) fires on online/offline/type change. Chrome/Edge only for type/downlink/rtt.",
      },
      {
        label: "battery signal",
        code: "// Returns a Promise — use await or .then()\nconst bat = await sensors.battery();\nconsole.log(`${(bat.level * 100)|0}% ${bat.charging ? 'charging' : 'discharging'}`);\nbat.onChange(b => console.log(b.level, b.charging));",
        hint: "sensors.battery() → Promise → { level (0–1), charging, timeToFull (s), timeToEmpty (s) }. .onChange(fn) on level/charging change. Chrome/Edge only; returns stub on unsupported browsers.",
      },
      {
        label: "sensor gauge — motion",
        code: "wm.spawn('Motion', { type: 'sensor', source: 'motion', w: 480, h: 200 });",
        hint: "wm.spawn sensor type — live bar chart for ax/ay/az accelerometer and alpha/beta/gamma orientation. Use toolbar Motion button or spawn in code.",
        tags: ["sensor", "gauge", "motion", "accelerometer"],
      },
      {
        label: "sensor gauge — gamepad",
        code: "// Connect gamepad first (press any button to activate)\nwm.spawn('Gamepad', { type: 'sensor', source: 'gamepad', w: 380, h: 200 });",
        hint: "wm.spawn sensor type — live dial gauges for axes 0–3 and button state indicators.",
        tags: ["sensor", "gauge", "gamepad", "controller"],
      },
      {
        label: "sensor gauge — geo",
        code: "wm.spawn('Geolocation', { type: 'sensor', source: 'geo', w: 280, h: 200 });",
        hint: "wm.spawn sensor type — live lat/lon/alt/speed/heading readout. Browser asks for location permission.",
        tags: ["sensor", "gauge", "geo", "gps", "location"],
      },
      {
        label: "sensor gauge — battery",
        code: "wm.spawn('Battery', { type: 'sensor', source: 'battery', w: 220, h: 160 });",
        hint: "wm.spawn sensor type — live battery level indicator with charging status.",
        tags: ["sensor", "gauge", "battery"],
      },
    ],
  },
  {
    name: "PIXI",
    commands: [
      {
        label: "why PIXI vs Shader",
        code: "// PIXI (WebGL) — use for: sprites, scene graph, particles, hit-testing, text rendering, filters on objects\n// Shader/GLShader — use for: full-screen pixel effects, procedural textures, camera FX\n// They layer: PIXI canvas (z=25) sits between draw (z=0) and Shader (z=30)\n\n// Quick example — bouncing sprite\nconst sprite = new PIXI.Graphics();\nsprite.beginFill(0xff6600);\nsprite.drawCircle(0, 0, 40);\nsprite.endFill();\nsprite.x = pixi.screen.width / 2;\nsprite.y = pixi.screen.height / 2;\nStage.addChild(sprite);\n\nlet vx = 4, vy = 3;\npixi.tick(() => {\n  sprite.x += vx;\n  sprite.y += vy;\n  if (sprite.x < 0 || sprite.x > pixi.screen.width)  vx *= -1;\n  if (sprite.y < 0 || sprite.y > pixi.screen.height) vy *= -1;\n});",
        hint: "PIXI (WebGL): scene graph / sprites / particles / per-object effects. GLShader/Shader: full-screen GPU effects. They layer cleanly — PIXI at z=25, Shader at z=30.",
      },
      {
        label: "sprite from URL",
        code: "const sprite = PIXI.Sprite.from('https://example.com/hero.png');\nsprite.anchor.set(0.5);\nsprite.x = pixi.screen.width / 2;\nsprite.y = pixi.screen.height / 2;\nStage.addChild(sprite);\n\npixi.tick(delta => {\n  sprite.rotation += 0.02;\n});",
        hint: "PIXI.Sprite.from(url) — load and display an image. anchor.set(0.5) centers the origin. pixi.tick(fn) — cleaned up on Stop.",
      },
      {
        label: "graphics shapes",
        code: "const g = new PIXI.Graphics();\ng.beginFill(0xff6600);\ng.drawRoundedRect(-60, -40, 120, 80, 15);\ng.endFill();\ng.lineStyle(4, 0xffffff);\ng.drawCircle(0, 0, 30);\ng.x = pixi.screen.width / 2;\ng.y = pixi.screen.height / 2;\nStage.addChild(g);\n\npixi.tick(() => { g.rotation += 0.01; });",
        hint: "PIXI.Graphics — immediate-mode vector drawing with scene graph positioning. Shapes: drawRect, drawCircle, drawRoundedRect, drawPolygon, drawEllipse, lineTo/moveTo.",
      },
      {
        label: "PIXI text",
        code: "const style = new PIXI.TextStyle({\n  fontFamily: 'Arial', fontSize: 48,\n  fill: '#ffffff', fontWeight: 'bold',\n  dropShadow: true, dropShadowDistance: 4,\n});\nconst label = new PIXI.Text('hello pixi', style);\nlabel.anchor.set(0.5);\nlabel.x = pixi.screen.width / 2;\nlabel.y = pixi.screen.height / 2;\nStage.addChild(label);\n\npixi.tick(t => { label.text = `t = ${pixi.ticker.lastTime.toFixed(0)}ms`; });",
        hint: "PIXI.Text + PIXI.TextStyle — rich text with shadows, stroke, font. Better than draw.text() for animating, filtering, or hit-testing text.",
      },
      {
        label: "container + children",
        code: "const group = new PIXI.Container();\nfor (let i = 0; i < 8; i++) {\n  const circle = new PIXI.Graphics();\n  const angle = (i / 8) * Math.PI * 2;\n  circle.beginFill(0x4488ff);\n  circle.drawCircle(Math.cos(angle) * 120, Math.sin(angle) * 120, 20);\n  circle.endFill();\n  group.addChild(circle);\n}\ngroup.x = pixi.screen.width / 2;\ngroup.y = pixi.screen.height / 2;\nStage.addChild(group);\n\npixi.tick(() => { group.rotation += 0.01; });",
        hint: "PIXI.Container — group sprites/graphics and transform them together. All children inherit parent transform.",
      },
      {
        label: "blur filter",
        code: "const sprite = PIXI.Sprite.from('https://example.com/photo.jpg');\nsprite.width  = pixi.screen.width;\nsprite.height = pixi.screen.height;\nconst blur = new PIXI.filters.BlurFilter();\nblur.blur = 10;\nsprite.filters = [blur];\nStage.addChild(sprite);\n\n// Animate blur based on mouse\nconst ms = sensors.mouse();\nms.stream(m => { blur.blur = m.x * 40; });",
        hint: "PIXI.filters.BlurFilter — apply to any DisplayObject. Other built-ins: ColorMatrixFilter, AlphaFilter, DisplacementFilter. Multiple filters: sprite.filters = [f1, f2].",
      },
      {
        label: "particle burst",
        code: "const particles = new PIXI.Container();\nStage.addChild(particles);\n\nfunction burst(x, y) {\n  for (let i = 0; i < 30; i++) {\n    const p = new PIXI.Graphics();\n    p.beginFill(Math.random() * 0xffffff);\n    p.drawCircle(0, 0, 4 + Math.random() * 8);\n    p.endFill();\n    p.x = x; p.y = y;\n    p.vx = (Math.random() - 0.5) * 12;\n    p.vy = (Math.random() - 0.5) * 12;\n    p.life = 1.0;\n    particles.addChild(p);\n  }\n}\n\ndocument.addEventListener('click', e => burst(e.clientX, e.clientY));\n\npixi.tick(delta => {\n  for (let i = particles.children.length - 1; i >= 0; i--) {\n    const p = particles.children[i];\n    p.x += p.vx; p.y += p.vy; p.vy += 0.4;\n    p.life -= 0.02;\n    p.alpha = p.life;\n    if (p.life <= 0) particles.removeChildAt(i);\n  }\n});",
        hint: "Manual particle system — click to burst. PIXI scene graph makes per-particle transform and alpha trivial. For 10k+ particles use ParticleContainer instead.",
      },
      {
        label: "audio reactive sprite",
        code: "const g = new PIXI.Graphics();\ng.x = pixi.screen.width / 2;\ng.y = pixi.screen.height / 2;\nStage.addChild(g);\n\nconst synth = audio.synth();\nconst sig = audio.signal(audio.master);\naudio.start();\n\npixi.tick(() => {\n  const level = sig.value; // 0–1 RMS\n  g.clear();\n  g.beginFill(0x4488ff);\n  g.drawCircle(0, 0, 20 + level * 200);\n  g.endFill();\n  if (Math.random() < 0.02) synth.play('C4', '16n');\n});",
        hint: "Combine PIXI ticker with audio.signal() — read .value, .bass, .mid, .high each frame to drive visual properties.",
      },
      {
        label: "hit testing / click",
        code: "const btn = new PIXI.Graphics();\nbtn.beginFill(0x4488ff);\nbtn.drawRoundedRect(0, 0, 200, 60, 12);\nbtn.endFill();\nbtn.x = pixi.screen.width / 2 - 100;\nbtn.y = pixi.screen.height / 2 - 30;\nbtn.interactive = true;\nbtn.cursor = 'pointer';\nbtn.on('pointerdown', () => draw.bg(Color.random()));\nStage.addChild(btn);\n\nconst label = new PIXI.Text('Click me', { fill: '#fff', fontSize: 28 });\nlabel.anchor.set(0.5);\nlabel.x = 100; label.y = 30;\nbtn.addChild(label);",
        hint: "interactive = true + cursor = 'pointer' enables hit-testing. Events: pointerdown, pointerup, pointerover, pointerout, click. Works for any DisplayObject.",
      },
      {
        label: "PIXI + WGSL shader layer",
        code: "// PIXI sprites at z=25, WGSL shader at z=30 — composited cleanly\nconst g = new PIXI.Graphics();\ng.beginFill(0xffffff);\ng.drawCircle(0, 0, 80);\ng.endFill();\ng.x = pixi.screen.width / 2;\ng.y = pixi.screen.height / 2;\nStage.addChild(g);\n\n// Shader overlays on top with glow\nconst s = new Shader(`\n  let d = length(uv - vec2f(0.5));\n  let glow = pow(max(0.0, 0.3 - d), 3.0) * 8.0;\n  return vec4f(0.2, 0.5, 1.0, glow);\n`);\ns.start();\n\npixi.tick(t => { g.rotation += 0.01; });",
        hint: "PIXI (WebGL, z=25) and Shader (WebGPU, z=30) stack on separate canvases — combine scene graph objects with fullscreen GPU effects.",
      },
    ],
  },
  {
    name: "GLShader",
    commands: [
      {
        label: "why GLShader vs Shader",
        code: "// GLShader  — WebGL/GLSL  — works in ALL browsers (Chrome, Firefox, Safari, mobile)\n// Shader     — WebGPU/WGSL — Chrome 113+, Safari 18+, Edge 113+ only\n//\n// Same API: new GLShader(body, opts), .start(), .stop(), .set(), .bind(), .opacity(), .z()\n// GLSL has a massive training corpus — LLMs generate GLSL more fluently than WGSL\n// ShaderToy shaders (void mainImage) paste in directly with zero changes\n\nconst s = new GLShader(`\n  vec2 uv = gl_FragCoord.xy / uResolution;\n  float t = sin(uTime + uv.x * 10.0) * 0.5 + 0.5;\n  gl_FragColor = vec4(uv.x, t, uv.y, 1.0);\n`);\ns.start();",
        hint: "GLShader (WebGL/GLSL): universal browser support, huge training corpus. Shader (WebGPU/WGSL): Chrome/Edge/Safari 18+ only, compute shaders, better GPU pipeline. Same .start()/.stop()/.set() API.",
      },
      {
        label: "hello GLShader",
        code: "// Uniforms pre-declared: uResolution (vec2), uMouse (vec2 0-1), uTime (float), uCustom (vec4)\n// Pre-declared in body: uv (vec2 0-1), time, mouse, custom\nconst s = new GLShader(`\n  float r = sin(uv.x * 10.0 + uTime) * 0.5 + 0.5;\n  float g = cos(uv.y * 8.0  - uTime) * 0.5 + 0.5;\n  gl_FragColor = vec4(r, g, 0.5, 1.0);\n`);\ns.start();",
        hint: "Write the fragment body — uv, time, mouse, custom pre-declared. Set gl_FragColor to output color. Same opts as Shader: { z, opacity, video }.",
      },
      {
        label: "GLShader preset",
        code: "// GLSL_PRESETS: gradient, plasma, waves, circles, noise\nconst s = new GLShader(GLSL_PRESETS.plasma);\ns.start();",
        hint: "GLSL_PRESETS — same set as SHADER_PRESETS but GLSL/WebGL. Each is a fragment body string.",
      },
      {
        label: "ShaderToy paste-in",
        code: "// Paste ShaderToy code directly — void mainImage auto-detected and wrapped\nconst s = new GLShader(`\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  vec2 uv = fragCoord / uResolution;\n  vec3 col = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0,2,4));\n  fragColor = vec4(col, 1.0);\n}\n`);\ns.start();",
        hint: "GLShader detects void mainImage(out vec4, in vec2) and wraps it automatically. Paste ShaderToy code with no edits needed.",
      },
      {
        label: "full GLSL program",
        code: "// Include void main() to take full control — no auto-wrapping\nconst s = new GLShader(`\nprecision highp float;\nuniform float uTime;\nvoid main() {\n  vec2 uv = gl_FragCoord.xy / vec2(1600.0, 900.0);\n  gl_FragColor = vec4(uv, sin(uTime)*0.5+0.5, 1.0);\n}\n`);\ns.start();",
        hint: "If fragSrc contains void main() it's used as-is (full GLSL program). Declare your own uniforms — uResolution/uTime/uMouse/uCustom are not injected.",
      },
      {
        label: "video / camera input",
        code: "// uniform sampler2D uVideo auto-declared when video: is set\n// col = texture2D(uVideo, uv)  in body mode\nconst cam = new Camera();\nawait cam.open();\nconst s = new GLShader(`\n  vec4 col = texture2D(uVideo, uv);\n  float grey = dot(col.rgb, vec3(0.299, 0.587, 0.114));\n  gl_FragColor = vec4(grey, grey * 0.8, grey * 0.6, 1.0);\n`, { video: cam });\ns.start();",
        hint: "Pass { video: cam } in opts — uVideo sampler2D declared, col (texture2D result) pre-assigned in body. Sources: Camera instance, HTMLVideoElement, HTMLCanvasElement.",
      },
      {
        label: "custom uniform",
        code: "const s = new GLShader(`\n  float r = sin(uv.x * 6.28 + uTime * uCustom.x) * 0.5 + 0.5;\n  gl_FragColor = vec4(r, uCustom.y, uCustom.z, 1.0);\n`);\ns.set([2.0, 0.3, 0.8, 0.0]); // speed, g, b, unused\ns.start();\n\n// Drive with audio:\nconst sig = audio.signal(audio.master);\naudio.start();\ns.bind(sig); // fills custom = [rms, bass, mid, high] each frame",
        hint: "s.set([x,y,z,w]) or s.set(index, value) — same as Shader.set(). s.bind(audioSignal) auto-fills uCustom = [rms, bass, mid, high] each frame.",
      },
      {
        label: "GLShader + PIXI layer",
        code: "// GLShader full-screen (WebGL), PIXI sprites on top\nconst s = new GLShader(GLSL_PRESETS.plasma);\ns.start();\n\nconst label = new PIXI.Text('GLSL + PIXI', new PIXI.TextStyle({\n  fontSize: 64, fill: '#fff', fontWeight: 'bold',\n  dropShadow: true, dropShadowDistance: 6,\n}));\nlabel.anchor.set(0.5);\nlabel.x = pixi.screen.width / 2;\nlabel.y = pixi.screen.height / 2;\nStage.addChild(label);\n\npixi.tick(t => { label.rotation = Math.sin(pixi.ticker.lastTime / 1000) * 0.2; });",
        hint: "GLShader (z=30) + PIXI (z=25) layer cleanly. Use GLShader for full-screen procedural backgrounds, PIXI for text/sprites/interactions on top.",
      },
    ],
  },
];


/**
 * Add snippet entries to the toolkit API drawer, creating a new category if needed.
 * Called by api-registry.js when registerAPI is used with ext.toolkit.
 * @param {string} categoryName
 * @param {Array<{label: string, code: string, hint: string}>} entries
 */
export function addToolkitEntries(categoryName, entries) {
  const existing = TOOLKIT_CATEGORIES.find(c => c.name === categoryName);
  if (existing) {
    existing.commands.push(...entries);
  } else {
    TOOLKIT_CATEGORIES.push({ name: categoryName, commands: entries });
  }
}
