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
        label: "capture window shader",
        code: "const s = new Shader(`\n  let col = textureSample(video, videoSampler, uv);\n  return vec4f(col.rgb, 1.0);\n`, { video: captureWindow('.CodeMirror') });\ns.start();",
        hint: "Capture any DOM element as a live shader texture — pass a CSS selector or element. canvas/video elements pass through directly.",
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
        code: "const p = audio.player('https://example.com/sound.mp3');\nawait p.load();\np.start();",
        hint: "Load and play an audio file URL",
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
        hint: "Quick camera effect — camera must be on. Effects: greyscale, invert, channel_swap, posterize, scanlines",
      },
      {
        label: "camera shader (composable)",
        code: "const s = ShaderFX.cameraShader('greyscale');\ns.start();\n// later: s.stop(); s.opacity(0.5);",
        hint: "Camera shader you can control — stop, fade opacity, swap effects",
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
        code: "const id = wm.spawn('Info', { type: 'html', html: '<h2>hello</h2>' });\n// wm.close(id);",
        hint: "Spawn a floating window with arbitrary HTML content",
      },
      {
        label: "spawn image",
        code: "const src = await wm.pickFile('photo');\nwm.spawn('Photo', { type: 'image', src, w: 480, h: 360 });",
        hint: "Pick an image file once (cached by key), spawn it in a window",
      },
      {
        label: "spawn video",
        code: "const src = await wm.pickFile('clip');\nwm.spawn('Video', { type: 'video', src, w: 640, h: 480, controls: true });",
        hint: "Pick a video file once (cached by key), spawn it in a window",
      },
      {
        label: "pickFile",
        code: "const url = await wm.pickFile('myFile');\n// url is a blob URL — reuse key to skip picker next time",
        hint: "Pick a file via browser picker — caches the handle by key, no re-prompt while permission active",
      },
      {
        label: "spawn camera",
        code: "const id = wm.spawn('Cam', { type: 'camera', w: 320, h: 240 });",
        hint: "Spawn a window mirroring the camera feed",
      },
      {
        label: "spawn canvas",
        code: "const id = wm.spawn('Canvas', { type: 'canvas', z: 0, w: 640, h: 480 });",
        hint: "Spawn a window mirroring a canvas layer at z-index z",
      },
      {
        label: "spawn shader",
        code: "const s = new Shader(`...`).start();\nconst id = wm.spawn('FX', { type: 'shader', shader: s, w: 640, h: 480 });",
        hint: "Spawn a window mirroring a Shader's output canvas",
      },
      {
        label: "list windows",
        code: "console.log(wm.list());",
        hint: "List all current window ids in the desktop",
      },
    ],
  },
];
