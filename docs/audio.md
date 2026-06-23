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

### Pattern API

```js
pat(str, synth)          // create pattern
pat(str, (note, time, dur) => {}) // callback form — full control

.speed(2)                // 2× faster
.slow(2)                 // 2× slower
.euclid(3, 8)            // 3 hits across 8 equal steps (Euclidean)
.every(4, evts => [...evts].reverse()) // transform every 4 cycles
.start()                 // begin looping (also call audio.start())
.stop()                  // stop loop

stack(pat1, pat2, ...)   // layer patterns; .bpm(120).start()
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
