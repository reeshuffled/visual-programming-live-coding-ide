import * as Tone from "tone";

const _tracked = [];

function track(d) {
  _tracked.push(d);
  return d;
}

export function cleanupAudio() {
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  _tracked.forEach((d) => {
    try { d.dispose(); } catch (_) {}
  });
  _tracked.length = 0;
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
    this._.disconnect();
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

  // ── Analysis ─────────────────────────────────────────────────────────────
  // Usage: const m = audio.meter(); synth.chain(m); — meter sits in the signal chain
  meter() {
    return track(new Tone.Meter());
  }
  analyser(bins = 32) {
    return track(new Tone.Analyser("fft", bins));
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
