# ADR 022 — Piano Widget

**Status:** Accepted  
**Date:** 2026-06-26

## Context

CreateOS has a Drumpad widget for rhythmic/percussive live coding. There is no polyphonic
melodic instrument widget. Users want to play and sequence pitched notes, visualize what's
being played, and drive canvas visuals reactively from note events — use cases Drumpad
cannot cover.

## Decisions

### 1. Widget class: `Piano` / `audio.piano(opts)`

Exposed as both `window.Piano` (class) and `audio.piano(opts)` (factory), matching the
Drumpad dual-exposure pattern. Uses the same `mountWidgetShell` chassis (ADR 007).

### 2. Sound: PolySynth default, configurable

Default synth is `Tone.PolySynth(Tone.FMSynth)` — polyphonic, offline-capable, rich timbre.
The `synth` constructor option accepts any Tone.js polyphonic node. Named presets (see §5)
bundle a synth + effects chain and override the default entirely.

### 3. Layout: keyboard → sequencer → transport

Top-to-bottom hierarchy mirrors Drumpad (instrument first, sequencer second, transport last):

```
┌─────────────────────────────┐
│  [Piano Keys — 2 octaves]   │
├─────────────────────────────┤
│  Step: [1][2]…[16]          │
│  Notes in step: C4 E4 G4    │
├─────────────────────────────┤
│  ▶ Play  ■ Stop  BPM [120]  │
│  Dur [8n▾]  Oct [4▾]  </>   │
└─────────────────────────────┘
```

### 4. Keyboard: 2-octave default, configurable

Constructor option `octaves` (default 2) sets visible range starting from `baseOctave`
(default 4). No horizontal scroll — resize the window.

Computer keyboard mapping: `a s d f g h j k` = white keys, `w e t y u` = black keys
(standard piano keyboard layout). `z`/`x` shift octave down/up.

### 5. Sequencer: chord-per-step

16 steps, each step holds a `Set<note>` (chord). Click a step to select it; click piano
keys to toggle notes in/out of that step. 16 steps matches Drumpad so BPM sync is natural.
Global duration selector (whole/half/quarter/eighth/sixteenth, default `'8n'`) applies to
all sequencer steps. Live play uses true sustain (`triggerAttack`/`triggerRelease` on
pointer/key down/up); sequencer uses fixed duration.

### 6. Visualization: key highlights + event hooks

Keys highlight on play (mouse, keyboard, sequencer). No canvas visualization baked into the
widget — canvas-side visuals come from the event/signal API (user code drives them). This
avoids duplicating `PianoRollViz` and keeps the creative coding use case open.

### 7. Preset registry: `Piano.define(name, descriptor)`

```js
Piano.define('my-sound', {
  synth: { type: 'FM', opts: { ... } },   // or type: 'AM' | 'basic' | 'pluck'
  effects: [
    { type: 'reverb', decay: 2 },
    { type: 'chorus', frequency: 1.5 },
  ],
})
```

Registry is global (`Piano._presets` map). Built-in presets shipped:

| Name | Synth | Effects |
|------|-------|---------|
| `electric` | FMSynth | light reverb |
| `grand` | FMSynth (bright) | long reverb + slight chorus |
| `organ` | AMSynth | rotary chorus |
| `pluck` | PluckSynth | short delay |
| `pad` | PolySynth(Synth) | heavy reverb, long attack |
| `bass` | Synth (low) | compressor |

### 8. Fx panel: preset dropdown + per-effect toggles

Transport bar has a preset `<select>`. An "Fx" button opens a mini panel with one row per
active effect: toggle checkbox + single wet/mix knob. Deep param editing stays in code via
`Piano.define()`.

### 9. Event / signal API

Mirrors Drumpad's WidgetEvents pattern:

```js
piano.onNote(fn)          // fn({note, midi, velocity, source, step})
piano.onKey('C4', fn)     // scoped to one note
piano.onStep(fn)          // fn({step, notes: ['C4','E4','G4']})
piano.signal('C4', opts)  // decaying 0–1 pulse; omit note for any-note
```

`source`: `'mouse'` | `'kbd'` | `'seq'`

## Consequences

- Piano and Drumpad share chassis (ADR 007) and WidgetEvents but are fully independent
  instances — no shared transport state, each has its own `Tone.Sequence`.
- `cleanupPianos()` mirrors `cleanupDrumpads()` — clears hooks on reset, windows survive.
- Synth voices are NOT tracked by `cleanupAudio()` — survive resets, disposed on window
  close only (same rule as Drumpad).
- `Piano.define()` registrations survive resets (module-level map).
- Add `window.Piano` to CLAUDE.md globals table when implemented.
