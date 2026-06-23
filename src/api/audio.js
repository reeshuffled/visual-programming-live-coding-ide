import * as Tone from "tone";
import { AudioViz } from "./viz.js";

const _nativeSetInterval = window.setInterval.bind(window);
const _nativeClearInterval = window.clearInterval.bind(window);

const _tracked = [];
const _cleanupFns = [];
let _recognition = null;
const _wordHandlers = new Map();
const _speechHandlers = [];

function track(d) {
  _tracked.push(d);
  return d;
}

// ── Audio signal helpers ──────────────────────────────────────────────────────

// Normalize any audio source to a Float32Array[0..1] of length `bins`.
// src: 'mic' | Web Audio AnalyserNode | Tone.Analyser
function _readFft(src, bins) {
  const node = src === 'mic' ? window.__ar_mic_analyser : src;
  if (!node) return new Float32Array(bins);
  const out = new Float32Array(bins);
  if (typeof node.getValue === 'function') {
    // Tone.Analyser — dB values (-Infinity..0)
    const raw = node.getValue();
    const step = raw.length / bins;
    for (let i = 0; i < bins; i++) {
      const db = raw[Math.floor(i * step)];
      out[i] = isFinite(db) ? Math.max(0, (db + 80) / 80) : 0;
    }
  } else if (node.frequencyBinCount) {
    // Web Audio AnalyserNode
    const data = new Uint8Array(node.frequencyBinCount);
    node.getByteFrequencyData(data);
    const step = data.length / bins;
    for (let i = 0; i < bins; i++) out[i] = data[Math.floor(i * step)] / 255;
  }
  return out;
}

// Wrap a Tone node with an internal Analyser; pass through AnalyserNode/Tone.Analyser/string.
function _makeAnalyser(source, bins) {
  if (!source || source === 'mic') return source;
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
  r.interimResults = false;
  r.onresult = (e) => {
    const transcript = Array.from(e.results)
      .slice(e.resultIndex)
      .filter(res => res.isFinal)
      .map(res => res[0].transcript.trim().toLowerCase())
      .join(' ');
    if (!transcript) return;
    _speechHandlers.forEach(fn => fn(transcript));
    transcript.split(/\s+/).forEach(word => {
      const handlers = _wordHandlers.get(word);
      if (handlers) handlers.forEach(fn => fn());
    });
  };
  r.onerror = (e) => { if (e.error !== 'no-speech') console.warn('Speech recognition error:', e.error); };
  r.onend = () => { if (_recognition === r) { try { r.start(); } catch (_) {} } };
  try { r.start(); } catch (e) { console.warn('Speech recognition failed to start:', e.message); return null; }
  _recognition = r;
  return r;
}

export function cleanupAudio() {
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  _tracked.forEach((d) => {
    try { d.dispose(); } catch (_) {}
  });
  _tracked.length = 0;
  _cleanupFns.forEach(f => { try { f(); } catch (_) {} });
  _cleanupFns.length = 0;
  if (_recognition) {
    _recognition.onend = null;
    try { _recognition.stop(); } catch (_) {}
    _recognition = null;
  }
  _wordHandlers.clear();
  _speechHandlers.length = 0;
  try { speechSynthesis.cancel(); } catch (_) {}
}

export function startAudio() {
  return Tone.start();
}

// ── Mini-notation parser ──────────────────────────────────────────────────

function _tokenizeMini(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    if (/\s/.test(str[i])) { i++; continue; }
    if ("[]<>".includes(str[i])) { tokens.push(str[i++]); }
    else {
      let j = i;
      while (j < str.length && !/[\s\[\]<>]/.test(str[j])) j++;
      tokens.push(str.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

function _parseMiniTokens(tokens) {
  let pos = 0;
  function parseItems(end) {
    const items = [];
    while (pos < tokens.length && tokens[pos] !== end) {
      const t = tokens[pos];
      if (t === "[") { pos++; items.push({ type: "group", items: parseItems("]") }); pos++; }
      else if (t === "<") { pos++; items.push({ type: "alt", items: parseItems(">") }); pos++; }
      else {
        pos++;
        const repM = t.match(/\*(\d+)$/);
        const val = t.replace(/\*\d+$/, "");
        items.push({ type: "atom", value: val, repeat: repM ? +repM[1] : 1 });
      }
    }
    return items;
  }
  return parseItems(null);
}

function _flattenMini(items, totalDur, cycleNum) {
  const slots = items.reduce((s, it) => s + (it.type === "atom" ? it.repeat : 1), 0);
  if (slots === 0) return [];
  const slotDur = totalDur / slots;
  const events = [];
  let offset = 0;
  for (const it of items) {
    if (it.type === "atom") {
      if (it.value !== "~" && it.value !== ".") {
        for (let r = 0; r < it.repeat; r++) {
          events.push({ value: it.value, time: offset + r * slotDur, dur: slotDur });
        }
      }
      offset += slotDur * it.repeat;
    } else if (it.type === "group") {
      _flattenMini(it.items, slotDur, cycleNum)
        .forEach((e) => events.push({ ...e, time: e.time + offset }));
      offset += slotDur;
    } else if (it.type === "alt") {
      const chosen = it.items[cycleNum % it.items.length];
      if (chosen) {
        _flattenMini([chosen], slotDur, cycleNum)
          .forEach((e) => events.push({ ...e, time: e.time + offset }));
      }
      offset += slotDur;
    }
  }
  return events;
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

// ── AudioAPI ──────────────────────────────────────────────────────────────

class AudioAPI {
  // ── Transport ────────────────────────────────────────────────────────────
  bpm(value) {
    Tone.getTransport().bpm.value = value;
    return this;
  }
  start(time) {
    Tone.getTransport().start(time);
    return this;
  }
  stop() {
    Tone.getTransport().stop();
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

  // Live RMS amplitude 0–1 from the harness mic AnalyserNode. Returns 0 if mic is off.
  get level() {
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
      const above = this.level >= threshold;
      if (above && !wasAbove) { wasAbove = true; onEnter(); }
      else if (!above && wasAbove) { wasAbove = false; if (onExit) onExit(); }
    }, 50);
    _cleanupFns.push(() => _nativeClearInterval(id));
  }

  // ── Speech ───────────────────────────────────────────────────────────────
  // Fires fn when the spoken word matches. Uses Web Speech API (Chrome/Edge only).
  onWord(word, fn) {
    const key = word.toLowerCase();
    if (!_wordHandlers.has(key)) _wordHandlers.set(key, []);
    _wordHandlers.get(key).push(fn);
    _ensureRecognition();
  }

  // Fires fn with full transcript string on every recognized utterance.
  onSpeech(fn) {
    _speechHandlers.push(fn);
    _ensureRecognition();
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
  }

  // Returns list of available TTS voice names for use with audio.say({ voice: '...' }).
  voices() {
    return speechSynthesis.getVoices().map(v => v.name);
  }

  // ── Analysis ─────────────────────────────────────────────────────────────
  // Usage: const m = audio.meter(); synth.chain(m); — meter sits in the signal chain
  get micCanvas() { return window.__ar_mic_viz ?? null; }

  viz(source, opts = {}) { return new AudioViz(source, opts); }

  meter() {
    return track(new Tone.Meter());
  }
  analyser(bins = 32) {
    return track(new Tone.Analyser("fft", bins));
  }

  // Live signal object from any audio source (Tone node, Tone.Analyser, 'mic', or Web Audio AnalyserNode).
  // Returns { value, fft, bass, mid, high } — all lazy getters, safe to call every frame.
  signal(source, bins = 256) {
    const analyser = _makeAnalyser(source, bins);
    let _cached = null, _cacheTime = -1;
    const getFft = () => {
      const now = performance.now();
      if (now - _cacheTime > 8) {
        _cached = _readFft(analyser ?? source, bins);
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
      // RAF-driven push — fn(sig) called every frame, cleaned up on reset
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
      const fft = _readFft(analyser ?? source, bins);
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

  // ── Pattern scheduling ───────────────────────────────────────────────────
  pat(str, instrument, opts = {}) {
    const parsed = _parseMiniTokens(_tokenizeMini(str));
    const cycleTime = opts.cycle ?? "1m";
    let _speed = 1, _slow = 1;
    let _euclidK = null, _euclidN = null;
    let _everyN = null, _everyFn = null;
    let _loop = null, _cycleNum = 0;

    const fire = (value, time, dur) => {
      if (!instrument) return;
      if (instrument instanceof Instrument) {
        const inner = instrument._;
        const noNote = inner instanceof Tone.NoiseSynth || inner instanceof Tone.MetalSynth;
        if (noNote) inner.triggerAttackRelease(dur, time);
        else inner.triggerAttackRelease(/^[A-G]/.test(value) ? value : "C1", dur, time);
      } else if (typeof instrument === "function") {
        instrument(value, time, dur);
      }
    };

    const api = {
      speed(n)       { _speed = n; return api; },
      slow(n)        { _slow = n; return api; },
      euclid(k, n)   { _euclidK = k; _euclidN = n; return api; },
      every(n, fn)   { _everyN = n; _everyFn = fn; return api; },
      start() {
        const cycleSecs = (Tone.Time(cycleTime).toSeconds() / _speed) * _slow;
        _loop = track(new Tone.Loop((time) => {
          let events = _flattenMini(parsed, cycleSecs, _cycleNum);
          if (_euclidK !== null) {
            const gate = _euclidRhythm(_euclidK, _euclidN);
            const stepDur = cycleSecs / _euclidN;
            const vals = events.length ? events.map((e) => e.value) : ["x"];
            events = gate
              .map((on, i) => on ? { value: vals[i % vals.length], time: i * stepDur, dur: stepDur } : null)
              .filter(Boolean);
          }
          if (_everyN && _everyFn && _cycleNum % _everyN === 0) {
            events = _everyFn(events, _cycleNum) ?? events;
          }
          events.forEach(({ value, time: t, dur }) => fire(value, time + t, dur));
          _cycleNum++;
        }, cycleSecs));
        _loop.start(0);
        return api;
      },
      stop() { _loop?.stop(); return api; },
    };
    return api;
  }

  stack(...pats) {
    return {
      bpm(v) { Tone.getTransport().bpm.value = v; return this; },
      start() { pats.forEach((p) => p.start()); Tone.getTransport().start(); return this; },
      stop()  { pats.forEach((p) => p.stop());  Tone.getTransport().stop();  return this; },
    };
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
