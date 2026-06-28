import * as Tone from "tone";
import { AudioViz, SpectrogramCanvas, PianoRollViz, EQWidget, _noteHooks } from "./viz.js";
import { Drumpad } from "./drumpad.js";
import { Piano } from "./piano.js";
import { onReset } from '../runtime/reset-registry.js';
import { notify, registerCommand } from '../events/index.js';
import { acquireMicRunScoped } from './media-lease.js';
import { readAnalyser } from './analyser-read.js';

const _nativeSetInterval = window.setInterval.bind(window);
const _nativeClearInterval = window.clearInterval.bind(window);
const _nativeSetTimeout = window.setTimeout.bind(window);

const _tracked = [];
const _cleanupFns = [];
const _patternRegistry = new Map(); // patId → Pattern instance
let _patIdCounter = 0;
let _masterFftSignal = null;
let _micLeased = false; // guard: acquire toolbar mic lease once per run
let _recognition = null;
const _wordHandlers = new Map();
const _speechHandlers = [];
const _wordStreamHandlers = [];
let _utteranceId = 0;

// ── Beat ticker ───────────────────────────────────────────────────────────────
// Fires beat:tick / beat:bar / beat:phrase whenever the Tone.js transport runs.
// Reset and re-scheduled on every cleanupAudio() since cancel() wipes schedules.
let _beatCounter = 0;
let _beatScheduleId = null;
function _setupBeatSchedule() {
  _beatCounter = 0;
  // scheduleRepeat may not exist in test environments (Tone mock doesn't implement it)
  if (typeof Tone.getTransport?.().scheduleRepeat !== 'function') return;
  _beatScheduleId = Tone.getTransport().scheduleRepeat(() => {
    const bpm  = Tone.getTransport().bpm.value;
    const bar  = Math.floor(_beatCounter / 4);
    const beat = _beatCounter % 4;
    const time = Tone.now();
    notify('beat:tick', { bpm, bar, beat, time });
    if (beat === 0)                notify('beat:bar',    { bpm, bar, time });
    if (_beatCounter % 16 === 0)   notify('beat:phrase', { bpm, phrase: Math.floor(_beatCounter / 16), time });
    _beatCounter++;
  }, '4n');
}
_setupBeatSchedule();

function track(d) {
  _tracked.push(d);
  return d;
}

// ── Audio signal helpers ──────────────────────────────────────────────────────

// Wrap a Tone node with an internal Analyser; pass through AnalyserNode/Tone.Analyser/string.
function _makeAnalyser(source, bins) {
  if (!source || source === 'mic') {
    if (source === 'mic') _ensureMicLeased();
    return source;
  }
  if (typeof source.getValue === 'function') return source; // Tone.Analyser
  if (source.frequencyBinCount) return source;              // Web Audio AnalyserNode
  // Tone instrument/effect — connect a new Analyser
  const a = new Tone.Analyser('fft', bins);
  track(a);
  try { (source._ ?? source).connect(a); } catch (_) {}
  return a;
}

function _ensureRecognition() {
  if (_recognition) return _recognition;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { console.warn('Web Speech API not supported in this browser'); return null; }
  const r = new SR();
  r.continuous = true;
  r.interimResults = true;
  r.onresult = (e) => {
    const res = e.results[e.resultIndex];
    const isFinal = res.isFinal;
    const text = res[0].transcript.trim().toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);

    if (isFinal) {
      // existing final-utterance behaviour
      notify('audio:speech', { text });
      _speechHandlers.forEach(fn => fn(text));
      words.forEach(word => {
        const handlers = _wordHandlers.get(word);
        if (handlers) { notify('audio:word', { word }); handlers.forEach(fn => fn()); }
      });
    }

    // word stream — fires for both interim and final
    const eventName = isFinal ? 'audio:word:final' : 'audio:word:interim';
    const uid = isFinal ? ++_utteranceId : _utteranceId;
    words.forEach((word, wordIndex) => {
      const payload = { word, utteranceId: uid, wordIndex, final: isFinal };
      notify(eventName, payload);
      _wordStreamHandlers.forEach(fn => fn(payload));
    });
  };
  r.onerror = (e) => { if (e.error !== 'no-speech') console.warn('Speech recognition error:', e.error); };
  r.onend = () => { if (_recognition === r) { try { r.start(); } catch (_) {} } };
  try { r.start(); } catch (e) { console.warn('Speech recognition failed to start:', e.message); return null; }
  _recognition = r;
  return r;
}

// Acquire the toolbar mic lease once per run (idempotent within a run via _micLeased guard).
function _ensureMicLeased() {
  if (_micLeased) return;
  _micLeased = true;
  acquireMicRunScoped();
}

export function cleanupAudio() {
  _patternRegistry.clear();
  _patIdCounter = 0;
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  _beatScheduleId = null;
  _setupBeatSchedule(); // re-register after cancel() wipes scheduled events

  // _cleanupFns: RAF/interval cancels and AudioFile state teardown — immediate.
  const toCleanup = _cleanupFns.splice(0);
  toCleanup.forEach(f => { try { f(); } catch (_) {} });

  // Tone nodes: fade first to prevent click/pop on oscillator disconnect,
  // then dispose. Splice atomically so a new run doesn't get caught in this.
  const toDispose = _tracked.splice(0);
  try { Tone.getDestination().volume.rampTo(-80, 0.08); } catch (_) {}
  _nativeSetTimeout(() => {
    toDispose.forEach(d => { try { d.dispose(); } catch (_) {} });
    try { Tone.getDestination().volume.rampTo(0, 0.05); } catch (_) {}
  }, 100);

  _masterFftSignal = null;
  _micLeased = false; // allow re-acquire on next run
  _noteHooks.length = 0;
  if (_recognition) {
    _recognition.onend = null;
    try { _recognition.stop(); } catch (_) {}
    _recognition = null;
  }
  _wordHandlers.clear();
  _speechHandlers.length = 0;
  _wordStreamHandlers.length = 0;
  try { speechSynthesis.cancel(); } catch (_) {}
}

export function startAudio() {
  return Tone.start();
}

// ── Deep Strudel — Pattern algebra ────────────────────────────────────────
//
// Pattern: (cycleNum) → [{value, time, dur, gain?, pan?}]
// All time/dur values are normalized to [0,1] within one cycle.
// Transforms return new Patterns (immutable). .start(inst?) kicks off scheduling.
//
// Mini-notation:
//   spaces=steps   []=group   <>=alternate   *N=repeat   !=N replicate   @N=weight
//   ?=degrade(0.5)   ,=simultaneous   {}%N=polymeter   0..7=range   ~/.=rest

// ── Tokenizer ─────────────────────────────────────────────────────────────

function _tokenizeMini(str) {
  // Expand integer ranges: 0..7 → "0 1 2 3 4 5 6 7"
  str = str.replace(/(-?\d+)\.\.(-?\d+)/g, (_, a, b) => {
    const lo = +a, hi = +b, step = lo <= hi ? 1 : -1;
    const out = [];
    for (let i = lo; step > 0 ? i <= hi : i >= hi; i += step) out.push(i);
    return out.join(' ');
  });
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    if (/\s/.test(str[i])) { i++; continue; }
    const ch = str[i];
    if ('[]<>{},'.includes(ch)) {
      tokens.push(ch);
      i++;
      // After }, check for %N polymeter step count
      if (ch === '}' && str[i] === '%') {
        i++;
        let j = i;
        while (j < str.length && /\d/.test(str[j])) j++;
        tokens.push('%' + str.slice(i, j));
        i = j;
      }
    } else {
      let j = i;
      while (j < str.length && !/[\s\[\]<>{},]/.test(str[j])) j++;
      tokens.push(str.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

// ── Parser ────────────────────────────────────────────────────────────────

function _parseMiniTokens(tokens) {
  let pos = 0;

  function parseItems(end) {
    const raw = [];
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (end !== null && t === end) break;
      if (end === null && (t === ']' || t === '>' || t === '}' || t?.startsWith('%'))) break;

      if (t === '[') {
        pos++;
        raw.push({ type: 'group', items: parseItems(']') });
        if (tokens[pos] === ']') pos++;
      } else if (t === '<') {
        pos++;
        raw.push({ type: 'alt', items: parseItems('>') });
        if (tokens[pos] === '>') pos++;
      } else if (t === '{') {
        pos++;
        const sub = parseItems('}');
        if (tokens[pos] === '}') pos++;
        let steps = 4;
        if (tokens[pos]?.startsWith('%')) { steps = +tokens[pos].slice(1) || 4; pos++; }
        raw.push({ type: 'polymeter', items: sub, steps });
      } else if (t === ',') {
        pos++;
        raw.push({ type: '_sep' });
      } else {
        pos++;
        let val = t, repeat = 1, weight = 1, degrade = false;
        // *N repeat
        const rm = val.match(/\*(\d+)$/); if (rm) { repeat = +rm[1]; val = val.slice(0, -rm[0].length); }
        // !N replicate (default 2)
        const im = val.match(/!(\d*)$/);  if (im) { repeat = +im[1] || 2; val = val.slice(0, -im[0].length); }
        // @N weight (duration multiplier)
        const wm = val.match(/@(\d*\.?\d+)$/); if (wm) { weight = +wm[1]; val = val.slice(0, -wm[0].length); }
        // ? degrade (optional probability)
        const dm = val.match(/\?(\d*\.?\d*)$/); if (dm) { degrade = dm[1] ? +dm[1] : 0.5; val = val.slice(0, -dm[0].length); }
        raw.push({ type: 'atom', value: val, repeat, weight, degrade });
      }
    }
    // Convert _sep markers to poly groups
    if (raw.some(r => r.type === '_sep')) {
      const groups = [];
      let cur = [];
      for (const r of raw) {
        if (r.type === '_sep') { groups.push(cur); cur = []; } else cur.push(r);
      }
      groups.push(cur);
      return groups.length > 1 ? [{ type: 'poly', groups }] : groups[0] ?? [];
    }
    return raw;
  }

  return parseItems(null);
}

// ── Flatten (normalized [0,1] events) ────────────────────────────────────

function _itemWeight(it) {
  return it.type === 'atom' ? it.weight * it.repeat : 1;
}

function _atomValues(items) {
  const vals = [];
  for (const it of items) {
    if (it.type === 'atom' && it.value !== '~' && it.value !== '.') {
      for (let r = 0; r < it.repeat; r++) vals.push(it.value);
    } else if (it.type === 'group' || it.type === 'alt') {
      vals.push(..._atomValues(it.items));
    } else if (it.type === 'poly') {
      for (const g of it.groups) vals.push(..._atomValues(g));
    }
  }
  return vals;
}

function _flattenPat(items, cycleNum) {
  const total = items.reduce((s, it) => s + _itemWeight(it), 0);
  if (total === 0) return [];
  const events = [];
  let off = 0;
  for (const it of items) {
    const slot = _itemWeight(it) / total;
    if (it.type === 'atom') {
      const aDur = slot / it.repeat;
      if (it.value !== '~' && it.value !== '.') {
        for (let r = 0; r < it.repeat; r++) {
          if (!it.degrade || Math.random() >= it.degrade)
            events.push({ value: it.value, time: off + r * aDur, dur: aDur });
        }
      }
      off += slot;
    } else if (it.type === 'group') {
      _flattenPat(it.items, cycleNum)
        .forEach(e => events.push({ ...e, time: e.time * slot + off, dur: e.dur * slot }));
      off += slot;
    } else if (it.type === 'alt') {
      if (it.items.length) {
        const chosen = it.items[cycleNum % it.items.length];
        _flattenPat([chosen], cycleNum)
          .forEach(e => events.push({ ...e, time: e.time * slot + off, dur: e.dur * slot }));
      }
      off += slot;
    } else if (it.type === 'poly') {
      // All groups sound simultaneously in this slot
      for (const grp of it.groups) {
        _flattenPat(grp, cycleNum)
          .forEach(e => events.push({ ...e, time: e.time * slot + off, dur: e.dur * slot }));
      }
      off += slot;
    } else if (it.type === 'polymeter') {
      // N steps per cycle cycling through inner items
      const vals = _atomValues(it.items);
      if (vals.length) {
        const stepDur = slot / it.steps;
        for (let s = 0; s < it.steps; s++) {
          const idx = (cycleNum * it.steps + s) % vals.length;
          events.push({ value: vals[idx], time: off + s * stepDur, dur: stepDur });
        }
      }
      off += slot;
    }
  }
  return events;
}

// ── Pattern class ─────────────────────────────────────────────────────────

function _pp(q) { return new Pattern(q); }

function _xpNote(val, n) {
  if (!/^[A-Ga-g]/.test(val)) return val;
  try { return _midiToNote(Tone.Frequency(val).toMidi() + n); } catch (_) { return val; }
}

function _firePat(inst, value, time, dur, gain, patId) {
  if (patId) {
    notify(`${patId}:hit`, { value, velocity: gain ?? 1, dur });
    notify(`${patId}:${value}`, { velocity: gain ?? 1, dur });
  }
  if (!inst) return;
  if (inst instanceof Instrument) {
    const inner = inst._;
    const noNote = inner instanceof Tone.NoiseSynth || inner instanceof Tone.MetalSynth;
    const vel = gain !== undefined ? Math.max(0, Math.min(1, gain)) : undefined;
    if (noNote) {
      inner.triggerAttackRelease(dur, time, vel);
      notify('audio:note-play', { note: null, duration: dur, patId });
    } else {
      const note = /^[A-G]/i.test(value) ? value : 'C4';
      inner.triggerAttackRelease(note, dur, time, vel);
      notify('audio:note-play', { note, duration: dur, patId });
    }
  } else if (typeof inst === 'function') {
    inst(value, time, dur);
  }
}

export class Pattern {
  constructor(q) {
    this._q  = q;
    this._cn = 0;
    this._loop = null;
    this._inst = null;
    this._ct   = '1m';
  }

  // ── Transforms (return new Pattern) ─────────────────────────────────────

  fast(n)  { return _pp(c => this._q(c).map(e => ({ ...e, time: e.time / n, dur: e.dur / n }))); }
  slow(n)  { return this.fast(1 / n); }
  speed(n) { return this.fast(n); }
  rev()    { return _pp(c => this._q(c).map(e => ({ ...e, time: 1 - e.time - e.dur })).sort((a, b) => a.time - b.time)); }

  add(n)    { return _pp(c => this._q(c).map(e => ({ ...e, value: _xpNote(e.value, n) }))); }
  gain(v)   { return _pp(c => this._q(c).map(e => ({ ...e, gain: (e.gain ?? 1) * v }))); }
  pan(v)    { return _pp(c => this._q(c).map(e => ({ ...e, pan: v }))); }

  note(scale) {
    return _pp(c => this._q(c).map(e => {
      const d = +e.value;
      return { ...e, value: !isNaN(d) ? (scale[((d % scale.length) + scale.length) % scale.length] ?? e.value) : e.value };
    }));
  }

  off(t, fn) {
    return _pp(c => [
      ...this._q(c),
      ...fn(this)._q(c).map(e => ({ ...e, time: (e.time + t + 1) % 1 })),
    ].sort((a, b) => a.time - b.time));
  }

  jux(fn) {
    return _pp(c => [...this.pan(0)._q(c), ...fn(this).pan(1)._q(c)]);
  }

  every(n, fn) { return _pp(c => c % n === 0 ? fn(this)._q(c) : this._q(c)); }

  sometimesBy(p, fn) {
    return _pp(c => {
      const base = this._q(c), mod = fn(this)._q(c);
      return base.map((e, i) => Math.random() < p ? (mod[i] ?? e) : e);
    });
  }
  sometimes(fn) { return this.sometimesBy(0.5, fn); }
  often(fn)     { return this.sometimesBy(0.75, fn); }
  rarely(fn)    { return this.sometimesBy(0.25, fn); }

  degrade()    { return _pp(c => this._q(c).filter(() => Math.random() > 0.5)); }
  degradeBy(p) { return _pp(c => this._q(c).filter(() => Math.random() > p)); }

  // ── Learner-friendly aliases ─────────────────────────────────────────────
  reverse()         { return this.rev(); }
  transpose(n)      { return this.add(n); }
  offset(t, fn)     { return this.off(t, fn); }
  mirror(fn)        { return this.jux(fn); }
  dropout()         { return this.degrade(); }
  dropoutBy(p)      { return this.degradeBy(p); }
  volume(v)         { return this.gain(v); }

  euclid(k, n, rot = 0) {
    return _pp(c => {
      const gate = _euclidRhythm(k, n);
      const r = [...gate.slice(rot), ...gate.slice(0, rot)];
      const evs = this._q(c);
      const dur = 1 / n;
      return r.map((on, i) => on
        ? { value: evs[i % Math.max(evs.length, 1)]?.value ?? 'x', time: i * dur, dur }
        : null
      ).filter(Boolean);
    });
  }

  rhythm(k, n, rot = 0) { return this.euclid(k, n, rot); }

  bpm(v) { Tone.getTransport().bpm.value = v; return this; }

  // ── Scheduling ───────────────────────────────────────────────────────────

  start(instOrOpts) {
    let inst, id;
    if (instOrOpts !== null && instOrOpts !== undefined &&
        typeof instOrOpts === 'object' && ('id' in instOrOpts || 'inst' in instOrOpts)) {
      id = instOrOpts.id;
      inst = instOrOpts.inst;
    } else {
      inst = instOrOpts;
    }
    if (inst !== undefined) this._inst = inst;
    this._id = id ?? `pat-${++_patIdCounter}`;
    _patternRegistry.set(this._id, this);
    this._cn = 0;
    const patId = this._id;
    const getCyc = () => Tone.Time(this._ct).toSeconds();
    const loop = track(new Tone.Loop((t) => {
      const cs = getCyc();
      this._q(this._cn++).forEach(({ value, time: tt, dur, gain }) => {
        _firePat(this._inst, value, t + tt * cs, dur * cs, gain, patId);
      });
    }, getCyc()));
    loop.start(0);
    this._loop = loop;
    notify('pattern:started', { id: this._id });
    return this;
  }

  stop() {
    if (this._loop) { this._loop.stop(); this._loop = null; }
    if (this._id) _patternRegistry.delete(this._id);
    notify('pattern:stopped', { id: this._id });
    return this;
  }
}

// Distribute k hits across n steps (Bresenham/Euclidean)
function _euclidRhythm(k, n) {
  const result = Array(n).fill(false);
  for (let i = 0; i < k; i++) result[Math.floor((i * n) / k)] = true;
  return result;
}

// ── Scale helpers ─────────────────────────────────────────────────────────

const _SCALES = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  phrygian:   [0, 1, 3, 5, 7, 8, 10],
  lydian:     [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian:    [0, 1, 3, 5, 6, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues:      [0, 3, 5, 6, 7, 10],
  chromatic:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const _NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function _midiToNote(midi) {
  const oct = Math.floor(midi / 12) - 1;
  return _NOTE_NAMES[((midi % 12) + 12) % 12] + oct;
}

// ── Instrument wrapper ────────────────────────────────────────────────────

class Instrument {
  constructor(inner) {
    this._ = track(inner);
  }
  play(...args) {
    this._.triggerAttackRelease(...args);
    if (_noteHooks.length > 0) {
      const [note, dur] = args;
      for (const h of _noteHooks) { try { h({ note, dur, type: 'play' }); } catch (_) {} }
    }
    return this;
  }
  attack(...args) {
    this._.triggerAttack(...args);
    return this;
  }
  release(...args) {
    this._.triggerRelease(...args);
    return this;
  }
  volume(db) {
    this._.volume.value = db;
    return this;
  }
  connect(node) {
    this._.connect(node);
    return this;
  }
  chain(...nodes) {
    this._.disconnect();
    this._.chain(...nodes, Tone.getDestination());
    return this;
  }
}

function _makeSignal(analyser, bins) {
  let _cached = null, _cacheTime = -1;
  const getFft = () => {
    const now = performance.now();
    if (now - _cacheTime > 8) {
      _cached = readAnalyser(analyser, bins);
      _cacheTime = now;
    }
    return _cached ?? new Float32Array(bins);
  };
  const avg = (f, s, e) => { let sum = 0; for (let i = s; i < e; i++) sum += f[i]; return sum / (e - s) || 0; };
  const sig = {
    get fft()   { return getFft(); },
    get value() { return avg(getFft(), 0, bins); },
    get bass()  { return avg(getFft(), 0, Math.floor(bins * 0.1)); },
    get mid()   { return avg(getFft(), Math.floor(bins * 0.1), Math.floor(bins * 0.5)); },
    get high()  { return avg(getFft(), Math.floor(bins * 0.5), bins); },
    stream(fn) {
      let rafId;
      const frame = () => { fn(sig); rafId = requestAnimationFrame(frame); };
      rafId = requestAnimationFrame(frame);
      _cleanupFns.push(() => cancelAnimationFrame(rafId));
      return sig;
    },
  };
  return sig;
}

// ── AudioFile ─────────────────────────────────────────────────────────────
// Returned by audio.load() and audio.upload(). Full playback + FX chain API.

class AudioFile {
  constructor(url) {
    this._url = url;
    this._player = new Tone.Player({ url });
    this._fxChain = [];
    this._playOffset = 0;
    this._startedAt = 0;
    this._playing = false;
    this._paused = false;
    this._onTimeCallbacks = [];
    this._pollId = null;
    this.ready = this._player.loaded;
    this._reconnect();
    _cleanupFns.push(() => this._dispose());
  }

  _reconnect() {
    try { this._player.disconnect(); } catch (_) {}
    if (this._fxChain.length) {
      this._player.chain(...this._fxChain, Tone.getDestination());
    } else {
      this._player.toDestination();
    }
  }

  play(offset) {
    if (this._playing) {
      try { this._player.stop(); } catch (_) {}
    }
    this._playOffset = offset !== undefined ? offset : (this._paused ? this._playOffset : 0);
    this._startedAt = Tone.now();
    this._playing = true;
    this._paused = false;
    this._reconnect();
    try { this._player.start(Tone.now(), this._playOffset); } catch (_) {}
    this._startPoll();
    return this;
  }

  pause() {
    if (!this._playing) return this;
    this._playOffset = this.currentTime;
    try { this._player.stop(); } catch (_) {}
    this._playing = false;
    this._paused = true;
    this._stopPoll();
    return this;
  }

  stop() {
    try { this._player.stop(); } catch (_) {}
    this._playing = false;
    this._paused = false;
    this._playOffset = 0;
    this._stopPoll();
    // reset onTime fired flags so they fire again on next play
    for (const cb of this._onTimeCallbacks) cb.fired = false;
    return this;
  }

  seek(t) {
    const wasPlaying = this._playing;
    if (wasPlaying) try { this._player.stop(); } catch (_) {}
    this._playOffset = t;
    if (wasPlaying) {
      this._startedAt = Tone.now();
      try { this._player.start(Tone.now(), this._playOffset); } catch (_) {}
    }
    return this;
  }

  get currentTime() {
    if (!this._playing) return this._playOffset;
    const elapsed = Tone.now() - this._startedAt;
    const dur = this.duration;
    return dur > 0 ? Math.min(this._playOffset + elapsed, dur) : this._playOffset + elapsed;
  }

  get duration() {
    return this._player.buffer?.duration ?? 0;
  }

  get state() {
    if (this._playing) return 'started';
    if (this._paused) return 'paused';
    return 'stopped';
  }

  loop(enabled = true) {
    this._player.loop = enabled;
    return this;
  }

  volume(db) {
    this._player.volume.value = db;
    return this;
  }

  connect(node) {
    this._fxChain = [node];
    this._reconnect();
    return this;
  }

  chain(...nodes) {
    this._fxChain = nodes;
    this._reconnect();
    return this;
  }

  filter(type = 'lowpass', freq = 1000, Q = 1) {
    this._fxChain.push(track(new Tone.Filter({ type, frequency: freq, Q })));
    this._reconnect();
    return this;
  }

  reverb(decay = 1.5) {
    this._fxChain.push(track(new Tone.Reverb({ decay })));
    this._reconnect();
    return this;
  }

  eq(low = 0, mid = 0, high = 0) {
    this._fxChain.push(track(new Tone.EQ3(low, mid, high)));
    this._reconnect();
    return this;
  }

  delay(time = 0.25, feedback = 0.5) {
    this._fxChain.push(track(new Tone.FeedbackDelay(time, feedback)));
    this._reconnect();
    return this;
  }

  pitchShift(semitones = 0) {
    this._fxChain.push(track(new Tone.PitchShift(semitones)));
    this._reconnect();
    return this;
  }

  distort(amount = 0.4) {
    this._fxChain.push(track(new Tone.Distortion(amount)));
    this._reconnect();
    return this;
  }

  // Returns a live signal object ({ value, bass, mid, high, fft }) from this file's output.
  signal(bins = 256) {
    const analyser = _makeAnalyser(this._player, bins);
    return _makeSignal(analyser, bins);
  }

  // Canvas showing waveform + live playhead. Click to seek.
  // Returns an HTMLCanvasElement; append to DOM or pass to wm.spawn as html content.
  waveform({ width = 512, height = 64, color = '#4ade80', bg = '#111' } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    let offscreen = null;

    this.ready.then(() => {
      const buffer = this._player.buffer;
      if (!buffer || typeof buffer.getChannelData !== 'function') return;
      const data = buffer.getChannelData(0);
      offscreen = document.createElement('canvas');
      offscreen.width = width; offscreen.height = height;
      const oc = offscreen.getContext('2d');
      oc.fillStyle = bg;
      oc.fillRect(0, 0, width, height);
      oc.strokeStyle = color;
      oc.lineWidth = 1;
      oc.beginPath();
      const step = Math.ceil(data.length / width);
      for (let x = 0; x < width; x++) {
        let max = 0;
        for (let i = 0; i < step; i++) {
          const v = Math.abs(data[x * step + i] ?? 0);
          if (v > max) max = v;
        }
        const h = max * height * 0.9;
        const mid = height / 2;
        oc.moveTo(x + 0.5, mid - h / 2);
        oc.lineTo(x + 0.5, mid + h / 2);
      }
      oc.stroke();
    }).catch(() => {});

    let rafId;
    const draw = () => {
      if (offscreen) ctx.drawImage(offscreen, 0, 0);
      else { ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height); }
      if (this.duration > 0) {
        const x = Math.floor((this.currentTime / this.duration) * width);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(x, 0, 2, height);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '10px monospace';
        ctx.fillText(this.currentTime.toFixed(1) + 's', Math.min(x + 4, width - 30), height - 4);
      }
      rafId = requestAnimationFrame(draw);
    };
    draw();
    _cleanupFns.push(() => cancelAnimationFrame(rafId));

    canvas.style.cursor = 'pointer';
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0) this.seek(((e.clientX - r.left) / r.width) * this.duration);
    });

    return canvas;
  }

  // Fires fn once when playback position reaches t (seconds). Resets on stop().
  onTime(t, fn) {
    this._onTimeCallbacks.push({ t, fn, fired: false });
    if (this._playing) this._startPoll();
    return this;
  }

  _startPoll() {
    if (this._pollId) return;
    this._pollId = _nativeSetInterval(() => this._tick(), 50);
  }

  _stopPoll() {
    if (this._pollId) { _nativeClearInterval(this._pollId); this._pollId = null; }
  }

  // Called per-poll-tick; also callable directly in tests.
  _tick() {
    if (!this._playing) return;
    const ct = this.currentTime;
    for (const cb of this._onTimeCallbacks) {
      if (!cb.fired && ct >= cb.t) { cb.fired = true; cb.fn(ct); }
    }
  }

  _dispose() {
    this._stopPoll();
    this._playing = false;
    this._paused  = false;
    this._onTimeCallbacks = [];
    try { this._player.dispose(); } catch (_) {}
  }
}

// ── AudioAPI ──────────────────────────────────────────────────────────────

class AudioAPI {
  // ── Transport ────────────────────────────────────────────────────────────
  bpm(value) {
    Tone.getTransport().bpm.value = value;
    notify('audio:bpm-change', { bpm: value });
    return this;
  }
  start(time) {
    Tone.getTransport().start(time);
    notify('audio:start', { bpm: Tone.getTransport().bpm.value });
    return this;
  }
  stop() {
    Tone.getTransport().stop();
    notify('audio:stop', {});
    return this;
  }

  // ── Synths ───────────────────────────────────────────────────────────────
  synth(opts = {}) { return new Instrument(new Tone.Synth(opts).toDestination()); }
  poly(opts = {})  { return new Instrument(new Tone.PolySynth(Tone.Synth, opts).toDestination()); }
  fm(opts = {})    { return new Instrument(new Tone.FMSynth(opts).toDestination()); }
  am(opts = {})    { return new Instrument(new Tone.AMSynth(opts).toDestination()); }
  pluck(opts = {}) { return new Instrument(new Tone.PluckSynth(opts).toDestination()); }
  metal(opts = {}) { return new Instrument(new Tone.MetalSynth(opts).toDestination()); }
  noise(opts = {}) { return new Instrument(new Tone.NoiseSynth(opts).toDestination()); }
  kick(opts = {})  { return new Instrument(new Tone.MembraneSynth(opts).toDestination()); }

  // ── Effects ──────────────────────────────────────────────────────────────
  reverb(decay = 1.5) {
    return track(new Tone.Reverb({ decay }).toDestination());
  }
  delay(time = 0.25, feedback = 0.5) {
    return track(new Tone.FeedbackDelay(time, feedback).toDestination());
  }
  distort(amount = 0.4) {
    return track(new Tone.Distortion(amount).toDestination());
  }
  chorus(freq = 1.5, delay = 3.5, depth = 0.7) {
    const c = track(new Tone.Chorus(freq, delay, depth).toDestination());
    c.start();
    return c;
  }
  filter(type = "lowpass", freq = 1000, Q = 1) {
    return track(new Tone.Filter({ type, frequency: freq, Q }).toDestination());
  }
  autoFilter(rate = 1) {
    const f = track(new Tone.AutoFilter(rate).toDestination());
    f.start();
    return f;
  }
  vibrato(freq = 5, depth = 0.1) {
    return track(new Tone.Vibrato(freq, depth).toDestination());
  }
  tremolo(freq = 10, depth = 0.5) {
    const t = track(new Tone.Tremolo(freq, depth).toDestination());
    t.start();
    return t;
  }
  compressor(threshold = -24, ratio = 12) {
    return track(new Tone.Compressor(threshold, ratio).toDestination());
  }
  eq(low = 0, mid = 0, high = 0) {
    return track(new Tone.EQ3(low, mid, high).toDestination());
  }
  pitchShift(pitch = 0) {
    return track(new Tone.PitchShift(pitch).toDestination());
  }
  phaser(rate = 0.5, octaves = 3) {
    return track(new Tone.Phaser({ frequency: rate, octaves }).toDestination());
  }
  wah(baseFreq = 350) {
    return track(new Tone.AutoWah(baseFreq, 6, -30).toDestination());
  }

  // ── Modulation ───────────────────────────────────────────────────────────
  lfo(freq = 1, min = 0, max = 1) {
    const l = track(new Tone.LFO(freq, min, max));
    l.start();
    return l;
  }

  // ── Microphone ───────────────────────────────────────────────────────────
  // Returns a started Tone.UserMedia. Connect to effects/analysis with .connect().
  // Requires browser mic permission — user will be prompted on first call.
  async mic() {
    const m = track(new Tone.UserMedia());
    await m.open();
    return m;
  }

  // Live RMS amplitude 0–1 from the harness mic AnalyserNode. Auto-acquires mic on first call.
  get level() {
    _ensureMicLeased();
    const analyser = window.__ar_mic_analyser;
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }

  // Edge-triggered amplitude callback. onExit optional (fires when level drops below threshold).
  onLevel(threshold, onEnter, onExit) {
    let wasAbove = false;
    const id = _nativeSetInterval(() => {
      const _lvl = this.level;
      const above = _lvl >= threshold;
      if (above && !wasAbove) {
        wasAbove = true;
        notify('audio:level', { level: _lvl });
        onEnter();
      } else if (!above && wasAbove) {
        wasAbove = false;
        if (onExit) onExit();
      }
    }, 50);
    _cleanupFns.push(() => _nativeClearInterval(id));
    return this;
  }

  // ── Speech ───────────────────────────────────────────────────────────────
  // Fires fn when the spoken word matches. Uses Web Speech API (Chrome/Edge only).
  onWord(word, fn) {
    const key = word.toLowerCase();
    if (!_wordHandlers.has(key)) _wordHandlers.set(key, []);
    _wordHandlers.get(key).push(fn);
    _ensureRecognition();
    return this;
  }

  // Fires fn with full transcript string on every recognized utterance.
  onSpeech(fn) {
    _speechHandlers.push(fn);
    _ensureRecognition();
    return this;
  }

  // Fires fn({ word, utteranceId, wordIndex, final }) for every interim and final word.
  onWordStream(fn) {
    _wordStreamHandlers.push(fn);
    _ensureRecognition();
    return this;
  }

  // Speak text via browser TTS. opts: { voice, rate (0.1–10), pitch (0–2), volume (0–1), lang }
  say(text, opts = {}) {
    const utt = new SpeechSynthesisUtterance(text);
    if (opts.rate   !== undefined) utt.rate   = opts.rate;
    if (opts.pitch  !== undefined) utt.pitch  = opts.pitch;
    if (opts.volume !== undefined) utt.volume = opts.volume;
    if (opts.lang   !== undefined) utt.lang   = opts.lang;
    if (opts.voice  !== undefined) {
      const v = speechSynthesis.getVoices().find(v => v.name === opts.voice);
      if (v) utt.voice = v;
    }
    speechSynthesis.speak(utt);
    notify('audio:say', { text });
    return this;
  }

  // Returns list of available TTS voice names for use with audio.say({ voice: '...' }).
  voices() {
    return speechSynthesis.getVoices().map(v => v.name);
  }

  // ── Analysis ─────────────────────────────────────────────────────────────
  // Usage: const m = audio.meter(); synth.chain(m); — meter sits in the signal chain
  get micCanvas() { return window.__ar_mic_viz ?? null; }

  viz(source, opts = {}) { return new AudioViz(source, opts); }

  // Master-output FFT signal (lazy, auto-connected to Tone.Destination).
  // Signal contract: { value, fft, bass, mid, high, stream(fn) }
  get fft() {
    if (!_masterFftSignal) {
      const analyser = new Tone.Analyser('fft', 256);
      track(analyser);
      try { Tone.getDestination().connect(analyser); } catch (_) {}
      _masterFftSignal = _makeSignal(analyser, 256);
      _cleanupFns.push(() => {
        try { Tone.getDestination().disconnect(analyser); } catch (_) {}
        _masterFftSignal = null;
      });
    }
    return _masterFftSignal;
  }

  // Scrolling spectrogram canvas. source: Tone node | 'mic' | signal object.
  spectrogram(source, opts = {}) { return new SpectrogramCanvas(source, opts); }

  // Piano roll overlay — shows falling note blocks for all Instrument.play() calls.
  pianoRoll(opts = {}) {
    const roll = new PianoRollViz(opts);
    roll.start();
    return roll;
  }

  // Floating 3-band EQ panel. Returns a Tone-compatible node for .chain().
  eqWidget(opts = {}) { return new EQWidget(opts); }

  // 8-pad drum machine with step sequencer.
  drumpad(opts = {}) { return new Drumpad(opts); }
  // Polyphonic piano widget with chord sequencer and synth presets.
  piano(opts = {})   { return new Piano(opts); }

  meter() {
    return track(new Tone.Meter());
  }
  analyser(bins = 32) {
    return track(new Tone.Analyser("fft", bins));
  }

  // Live signal object from any audio source (Tone node, Tone.Analyser, 'mic', or Web Audio AnalyserNode).
  // Returns { value, fft, bass, mid, high } — all lazy getters, safe to call every frame.
  signal(source, bins = 256) {
    return _makeSignal(_makeAnalyser(source, bins), bins);
  }

  // Live bins×1 canvas where R channel = FFT magnitude 0–1. Feed into Shader as video:.
  // Use uv.x in the shader to address frequency bins (0=bass, 1=treble).
  fftCanvas(source, bins = 256) {
    const analyser = _makeAnalyser(source, bins);
    const canvas = document.createElement('canvas');
    canvas.width = bins;
    canvas.height = 1;
    const ctx2d = canvas.getContext('2d');
    const img = ctx2d.createImageData(bins, 1);
    let rafId;
    const frame = () => {
      const fft = readAnalyser(analyser ?? source, bins);
      for (let i = 0; i < bins; i++) {
        const v = Math.round(Math.min(1, fft[i]) * 255);
        img.data[i * 4]     = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      ctx2d.putImageData(img, 0, 0);
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    _cleanupFns.push(() => cancelAnimationFrame(rafId));
    return canvas;
  }

  // ── Players ──────────────────────────────────────────────────────────────
  player(url) { return track(new Tone.Player(url).toDestination()); }
  sampler(urls, onload) { return track(new Tone.Sampler({ urls, onload }).toDestination()); }

  // Returns an AudioFile: full playback API with FX chaining.
  // await file.ready before calling play() to ensure the buffer is loaded.
  load(url) {
    return new AudioFile(url);
  }

  // Opens a file picker. Resolves to an AudioFile, or null if cancelled.
  async upload() {
    const url = await new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      const cleanup = () => { try { document.body.removeChild(input); } catch (_) {} };
      input.addEventListener('change', () => {
        cleanup();
        const file = input.files[0];
        resolve(file ? URL.createObjectURL(file) : null);
      });
      input.addEventListener('cancel', () => { cleanup(); resolve(null); });
      input.click();
    });
    return url ? this.load(url) : null;
  }

  // ── Pattern scheduling ───────────────────────────────────────────────────

  // pat(str, instrument?, opts?) → Pattern
  // Transforms: .fast(n) .slow(n) .rev() .add(n) .gain(v) .pan(v) .note(scale)
  //             .off(t,fn) .jux(fn) .every(n,fn) .sometimesBy(p,fn) .sometimes/often/rarely(fn)
  //             .degrade() .degradeBy(p) .euclid(k,n,rot?) .bpm(v)
  // Scheduling: .start(inst?) .stop()
  pat(str, instrument, opts = {}) {
    const parsed = _parseMiniTokens(_tokenizeMini(str));
    const p = new Pattern(c => _flattenPat(parsed, c));
    p._ct   = opts.cycle ?? '1m';
    p._inst = instrument !== undefined ? instrument : null;
    return p;
  }

  pattern(str, instrument, opts = {}) { return this.pat(str, instrument, opts); }

  chord(notes, instrument, opts = {}) {
    const str = Array.isArray(notes) ? notes.join(',') : notes;
    return this.pat(str, instrument, opts);
  }

  stack(...pats) {
    const sp = {
      bpm(v)  { Tone.getTransport().bpm.value = v; return sp; },
      start() { pats.forEach(p => p.start()); Tone.getTransport().start(); return sp; },
      stop()  { pats.forEach(p => p.stop());  Tone.getTransport().stop();  return sp; },
    };
    return sp;
  }

  // ── Legacy scheduling ────────────────────────────────────────────────────
  sequence(notes, subdivision, callback) {
    return track(new Tone.Sequence((time, note) => callback(note, time), notes, subdivision));
  }
  loop(fn, interval) {
    return track(new Tone.Loop((time) => fn(time), interval));
  }

  // ── Scale helpers ────────────────────────────────────────────────────────
  scale(root, name) {
    const intervals = _SCALES[name] ?? _SCALES.major;
    const rootMidi = Tone.Frequency(root).toMidi();
    return intervals.map((i) => _midiToNote(rootMidi + i));
  }
  note(scaleNotes, degree) {
    return scaleNotes[((degree % scaleNotes.length) + scaleNotes.length) % scaleNotes.length];
  }

  // ── Utilities ────────────────────────────────────────────────────────────
  volume(db) {
    Tone.getDestination().volume.value = db;
    return this;
  }
  now() { return Tone.now(); }
  freq(note) { return Tone.Frequency(note).toFrequency(); }
  get Tone() { return Tone; }
}

export const audio = new AudioAPI();

// Register teardown with the reset registry (ADR 008).
onReset(cleanupAudio);

// ── Event bus command handlers ─────────────────────────────────────────────
registerCommand('audio:start',      ({ bpm } = {}) => { if (bpm !== undefined) audio.bpm(bpm); audio.start(); });
registerCommand('audio:stop',       ()              => { audio.stop(); });
registerCommand('audio:bpm-change', ({ bpm })       => { if (bpm !== undefined) audio.bpm(bpm); });
registerCommand('pattern:stop',     ({ id })        => _patternRegistry.get(id)?.stop());
registerCommand('pattern:start',    ({ id })        => _patternRegistry.get(id)?.start());
