# Audio & Pattern API

Live coding with Tone.js. Press **?** in the IDE to see this as an in-app quick reference.

---

## Quick Start

```js
// Melody
const s = audio.fm();
pat("C4 E4 G4 B4", s).start();
audio.bpm(120);
audio.start();

// Drums + melody stacked
const kick = audio.kick();
const snare = audio.noise();
stack(
  pat("x . x .", kick),
  pat(". . x .", snare),
  pat("C4 E4 G4 E4", s)
).bpm(130).start();
```

---

## Pattern Syntax (Mini-notation)

| Syntax | Meaning |
|--------|---------|
| `"C4 E4 G4"` | Space-separated — equally spaced across one measure |
| `"~ . x"` | `~` or `.` = rest / silence; `x` = generic trigger |
| `"C4 [E4 G4]"` | `[ ]` group — E4 G4 share C4's time slot (double speed) |
| `"<C4 G3> E4"` | `< >` alternate each cycle — C4 on cycle 0, G3 on cycle 1 |
| `"C4*3 G4"` | `*N` repeat N times inside the slot |
| `"C4! E4"` | `!N` replicate N times (default 2); `C4!` = `C4 C4` |
| `"C4@2 E4"` | `@N` weight — C4 takes 2× duration relative to E4 |
| `"C4? E4"` | `?` degrade — 50% chance to drop the event; `?0.3` sets probability |
| `"[C4, E4, G4]"` | `,` polyphony — events sound simultaneously in that slot |
| `"{C4 E4 G4}%4"` | `{}%N` polymeter — N steps/cycle cycling through inner values |
| `"0..7"` | range — expands to `0 1 2 3 4 5 6 7` |

### Pattern API

`pat(str, instrument?)` → `Pattern`. All transforms return new Patterns (immutable).

```js
// Basic
pat("C4 E4 G4", synth).start()         // create + schedule
pat("bd sd hh", (val, t, dur) => { })  // callback form — full control
stack(pat1, pat2).bpm(140).start()      // layer patterns

// Transforms (chain before .start())
.fast(2)                // 2× faster (= .speed(2))
.slow(2)                // 2× slower
.rev()                  // reverse event order each cycle
.add(7)                 // transpose all notes +7 semitones
.gain(0.6)              // scale event velocity (0–1, chainable)
.pan(0.2)               // stereo pan 0 (left) – 1 (right)
.note(scaleArr)         // map degree numbers → notes in scale array

.euclid(3, 8)           // 3 hits across 8 steps (Bresenham)
.euclid(5, 8, 2)        // with rotation offset 2
.every(4, p => p.rev()) // apply transform every 4 cycles
.off(0.125, p => p.add(12))   // play original + time-shifted+transformed copy
.jux(p => p.rev())      // pan original left + fn(pat) right

.sometimesBy(0.3, p => p.fast(2))  // apply with probability 0.3
.sometimes(p => p.rev())           // prob 0.5
.often(p => p.add(12))             // prob 0.75
.rarely(p => p.slow(2))            // prob 0.25

.degrade()              // randomly drop ~50% of events per cycle
.degradeBy(0.3)         // drop with prob 0.3

.bpm(140)               // set global BPM (affects transport)
.start(inst?)           // begin scheduling; inst overrides pat(str, inst)
.stop()                 // stop loop
```

### Composing patterns

```js
const kick  = pat("x . x .", audio.kick());
const snare = pat(". . x .", audio.synth());
const hat   = pat("x*4",     audio.metal());

// Polymeter: kick grid vs synth grid
const bass  = pat("{C2 G2 Bb2 F2}%4", audio.synth());

// Scale-mapped melody (0..7 → C minor)
const scale = audio.scale('C4', 'minor');
const mel   = pat("0..7", (deg, t, dur) => {
  audio.synth().play(audio.note(scale, +deg), dur, t);
});

stack(kick, snare, hat, bass, mel).bpm(120).start();
audio.start();
```

---

## Synths

```js
audio.synth(opts)   // basic oscillator
audio.poly(opts)    // polyphonic — play(['C4','E4','G4'], '4n')
audio.fm(opts)      // FM synthesis — rich/metallic tones
audio.am(opts)      // AM synthesis
audio.pluck(opts)   // Karplus-Strong plucked string
audio.kick(opts)    // membrane synth — kick / tom drums
audio.metal(opts)   // metallic — hi-hats, cymbals (no note arg)
audio.noise(opts)   // white noise (no note arg)

s.play(note, dur, time?) // trigger — dur: '8n' '4n' '1n' or seconds
s.attack(note)           // note on
s.release()              // note off
s.volume(-6)             // volume in dB
s.connect(fx)            // route to one effect
s.chain(fx1, fx2)        // route through effects in series → output
```

`opts` are Tone.js synth options, e.g. `{ oscillator: { type: 'sawtooth' }, volume: -6 }`.

---

## Effects

Connect with `s.connect(fx)` or `s.chain(fx1, fx2)`.

```js
audio.reverb(decay)              // reverb — decay in seconds (default 1.5)
audio.delay(time, feedback)      // echo — time sec, feedback 0–1
audio.distort(amount)            // distortion 0–1
audio.chorus(freq, delay, depth) // chorus
audio.filter(type, freq, Q)      // filter — type: 'lowpass' 'highpass' 'bandpass' 'notch'
audio.autoFilter(rate)           // LFO-swept filter — rate in Hz
audio.vibrato(freq, depth)       // pitch wobble
audio.tremolo(freq, depth)       // volume wobble
audio.phaser(rate, octaves)      // phase shifting
audio.wah(baseFreq)              // auto-wah
audio.pitchShift(semitones)      // shift pitch up/down without changing tempo
audio.compressor(threshold, ratio) // dynamic range control
audio.eq(low, mid, high)         // 3-band EQ in dB
```

---

## Scales & Harmony

```js
audio.scale('C4', 'minor')
// → ['C4','D4','Eb4','F4','G4','Ab4','Bb4']

// Available scale names:
// major  minor  dorian  phrygian  lydian  mixolydian  locrian
// pentatonic  blues  chromatic

audio.note(scaleArr, degree)  // pick note by scale degree (wraps)

// Pattern from scale:
const sc = audio.scale('D4', 'pentatonic');
pat(sc.join(' '), audio.pluck()).start();

// Degree-based melody:
const sc = audio.scale('C4', 'minor');
pat("0 2 4 2 1 3 5 4", (val, time, dur) => {
  s.play(audio.note(sc, +val), dur, time);
}).start();
```

---

## Modulation

```js
// LFO connected to synth parameter
const s = audio.fm();
const lfo = audio.lfo(2, 200, 2000);   // freq=2Hz, range 200–2000
lfo.connect(s._.frequency);             // modulate pitch

// Available signal targets on a synth:
// s._.frequency     — pitch
// s._.volume        — amplitude
// s._.detune        — detune in cents (FMSynth, Synth)
// s._.harmonicity   — FM harmonicity ratio
```

---

## Microphone

```js
const mic = await audio.mic();  // prompts browser permission on first call

// Route mic to effects
const rev = audio.reverb(2);
mic.connect(rev);

// Route mic to analysis
const meter = audio.meter();
mic.connect(meter);
setInterval(() => {
  const db = meter.getValue();
  const amp = isFinite(db) ? Math.pow(10, db / 20) : 0;
  // amp drives visuals...
}, 16);

// Pitch estimation via FFT
const fft = audio.analyser(2048);
mic.connect(fft);
setInterval(() => {
  const bins = fft.getValue();          // Float32Array of dB values
  let maxI = 0;
  bins.forEach((v, i) => { if (v > bins[maxI]) maxI = i; });
  const hz = maxI * 24000 / bins.length; // approximate frequency
  console.log(hz + ' Hz');
}, 100);
```

`audio.mic()` is async — `await` it. The browser will prompt for microphone permission. The source is tracked and closed automatically on Stop/Reset.

### Mic signal bus

Enable the mic in the toolbar, then read the live level without routing a mic node:

```js
// audio.level — live 0–1 RMS float, always available once mic is on
setInterval(() => {
  draw.clear().bg('#111');
  draw.rect(100, 400, audio.level * 800, 20, 'cyan');
}, 16);

// audio.onLevel(threshold, onEnter, onExit?) — edge-trigger
// fires onEnter when level crosses threshold upward, onExit when it drops below
audio.onLevel(0.6, () => draw.bg('red'), () => draw.bg('black'));

// Feed into a shader via custom uniform
const shader = new Shader(`
  let pulse = custom.x;
  let d = distance(uv, vec2f(0.5));
  return vec4f(vec3f(pulse - d * 2.0), 1.0);
`);
shader.start();
setInterval(() => shader.set(audio.level), 16);
```

These follow the same signal bus pattern as `sensors.*` and `video.signal` — any live 0–1 value can drive a shader uniform, a filter frequency, a draw parameter, or anything else. See [sensors.md](sensors.md) for the full comparison.

### Speech recognition

```js
// Fire on a specific word (Chrome/Edge only)
audio.onWord('boom', () => draw.bg('red'));

// Receive every recognized phrase
audio.onSpeech(phrase => { console.log(phrase); });
```

Continuous recognition; auto-restarts on silence. Stops on reset.

### Speech synthesis

```js
audio.say('hello world');
audio.say('hello', {
  voice: 'Google UK English Female',  // voice name from audio.voices()
  rate:  1.2,    // 0.1 – 10
  pitch: 0.8,    // 0 – 2
  volume: 1.0,   // 0 – 1
  lang: 'en-GB',
});

audio.voices()   // → array of available SpeechSynthesisVoice objects
```

Cancelled on reset.

---

## Analysis (Audio → Visual)

The key insight: don't draw audio — use audio *as a control signal* for an unrelated visual system.

```js
// Meter — RMS amplitude
const meter = audio.meter();
const s = audio.fm();
s.chain(meter);            // synth → meter → speakers

setInterval(() => {
  const db = meter.getValue();                   // -Infinity to 0 dB
  const amp = isFinite(db) ? Math.pow(10, db / 20) : 0; // 0..1 linear
  // use amp to drive: gravity, blur, shader uniform, particle force...
}, 16);

// FFT analyser
const fft = audio.analyser(32);    // 32 frequency bins
s.chain(fft);
const bins = fft.getValue();       // Float32Array of dB values
```

### Audio→Visual Patterns

**Beat as state machine trigger** — each callback fires at musical time:
```js
const kick = audio.kick();
let caState = initCA();

pat("x . x . x . x x", (note, time, dur) => {
  kick.play("C1", dur, time);
  caState = stepCA(caState);   // advance CA on every kick
  draw(caState);
}).start();
```

**Note value selects visual mode** — the `note` string is structured data:
```js
const palettes = { C4: ["#f00","#f60"], E4: ["#0ff","#06f"], G4: ["#fff","#888"] };
pat("C4 E4 G4 E4", (note, time, dur) => {
  s.play(note, dur, time);
  currentPalette = palettes[note];  // note → visual state
}).start();
```

**Amplitude as physics force**:
```js
setInterval(() => {
  const amp = Math.pow(10, meter.getValue() / 20);
  balls.forEach(b => { b.vy += amp * 0.005; }); // loud = stronger gravity
}, 16);
```

**Pitch mapped to shader parameter**:
```js
pat("C3 E3 G3 Bb3", (note, time, dur) => {
  s.play(note, dur, time);
  const hz = audio.freq(note);          // frequency in Hz
  const norm = (hz - 130) / 800;        // normalize to 0..1
  shader.set(1, norm);                  // → hue, warp, any visual param
}).start();
```

### Master FFT signal — `audio.fft`

Taps `Tone.Destination` (the master output). No `chain()` needed — it sees everything.

```js
audio.fft.value    // current dominant frequency bin (number)
audio.fft.bass     // low-band energy 0–1
audio.fft.mid      // mid-band energy 0–1
audio.fft.high     // high-band energy 0–1
audio.fft.fft      // Float32Array of all bins (raw)
audio.fft.stream(fn)  // RAF push: fn({ value, bass, mid, high, fft })
```

Use `audio.fft.bass` to drive a shader uniform without chaining any analyser manually:

```js
const s = new GLShader(`
  float b = custom.x;
  vec3 col = vec3(b, 0., 1. - b);
  gl_FragColor = vec4(col, 1.);
`).start();
setInterval(() => s.set(0, audio.fft.bass), 16);
```

---

## Audio Files — `audio.load()` / `audio.upload()`

Load audio from URL or user file-picker. Returns `AudioFile`.

```js
const f = await audio.load('https://example.com/beat.mp3');
const f = await audio.upload();   // opens file picker
```

### Playback

```js
f.play(offset?)   // offset in seconds (default 0)
f.pause()
f.stop()
f.seek(seconds)
f.loop(true)
f.volume(-6)      // dB

f.currentTime     // live getter (seconds)
f.duration        // total length (seconds)
f.state           // 'started' | 'stopped' | 'paused'
await f.ready     // resolves when buffer loaded
```

### FX chain (chainable, return `this`)

```js
f.filter('lowpass', 800, 1)
 .reverb(2.5)
 .eq(-3, 0, 6)
 .delay(0.25, 0.4)
 .pitchShift(7)
 .distort(0.3)
```

### Time callbacks

```js
f.onTime(4.2, () => { /* fires when playback reaches 4.2s */ });
```

### Waveform canvas

```js
const wf = f.waveform({ width: 600, height: 80, color: '#0ff', bg: '#000' });
// wf is an HTMLCanvasElement — live playhead updates on each frame
document.body.appendChild(wf);
// or pass to draw:
draw.image(wf, 0, 800);
```

### Live FFT signal from a file

```js
const sig = f.signal(32);    // 32 frequency bins
sig.bass / sig.mid / sig.high   // energy bands 0–1
sig.stream(fn)
```

---

## Audio Visualizers

### Spectrogram — `audio.spectrogram(source, opts)`

Scrolling frequency×time heatmap.

```js
const sg = audio.spectrogram(source, {
  palette: 'rainbow',   // 'rainbow' | 'thermal' | 'cool' | 'mono'
  width:   800,
  height:  256,
});
// sg.canvas → live HTMLCanvasElement
wm.spawn('Spectrogram', { type: 'canvas', canvas: sg.canvas, w: 800, h: 256 });
// or:
draw.image(sg.canvas, 0, 0);
```

### Piano roll — `audio.pianoRoll(opts)`

Falling-note overlay. Auto-hooks `Instrument.play()` — no manual wiring.

```js
const roll = audio.pianoRoll({
  z:        5,        // layer z-index
  opacity:  0.85,
  speed:    120,      // px/s fall rate
  midiMin:  36,       // C2
  midiMax:  96,       // C6
});
```

### EQ widget — `audio.eqWidget(opts)`

Floating 3-band EQ panel. Tone-compatible — use `.chain()` like any Tone node.

```js
const eq = audio.eqWidget({ x: 100, y: 100 });
eq.low(-3).mid(2).high(-1)   // chainable setters (dB)
synth.chain(eq)               // Tone-compatible
```

---

## Transport

```js
audio.bpm(120)    // set tempo
audio.start()     // start transport clock (needed for pat/loop/sequence)
audio.stop()      // stop transport
audio.volume(-6)  // master output volume in dB
audio.now()       // current audio time in seconds
audio.freq('C4')  // note name → frequency in Hz
```

---

## Legacy Scheduling

Low-level scheduling if you don't want mini-notation:

```js
// Sequence — steps through array
const seq = audio.sequence(['C4','E4','G4'], '8n', (note, time) => {
  s.play(note, '8n', time);
});
seq.start(0);
audio.start();

// Loop — fires callback every interval
const l = audio.loop(time => {
  s.play('C4', '8n', time);
}, '4n');
l.start(0);
audio.start();
```

---

## Cleanup

Everything created via `audio.*` is automatically tracked and disposed when you press **Stop** or **Reset**. You don't need to call `.dispose()` manually.
