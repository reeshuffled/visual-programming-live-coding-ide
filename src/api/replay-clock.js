// replay-clock.js — schedules timestamped action lists back onto the harness
// clock (ADR 031). The shared scheduler under both per-widget `.replay(actions)`
// and the cross-widget `window.timeline()`.
//
// An "op" is `{ at, fn }` — `at` is ms from playback start, `fn` is the call that
// re-applies one recorded action. A ReplayClock fires every op via the PATCHED
// `window.setTimeout` (so it pauses with __ar_paused and is torn down by the
// harness — same deliberate exception as tick()/Route timeline) and holds a
// liveOutput keep-alive while playing so the run stays alive. Modeled on
// route.js `_runTimeline`.
//
// Clocks are run-scoped: tagged with the active editor id at construction and
// stopped by cleanupReplayClocks() on reset (only matching-owner clocks, so
// resetting editor B does not kill editor A's replay — same rule as route.js).

import { onReset } from '../runtime/reset-registry.js';
import { liveOutput } from '../runtime/keep-alive.js';

const _clocks = new Set();

// ops: [{ at:ms, fn:()=>void }]. Returns a handle with .stop().
export function scheduleReplay(ops, { loop = false, label = 'replay' } = {}) {
  return new ReplayClock(ops, { loop, label }).start();
}

// Helper for a single-track replay: maps each `{t,...}` action to an op that
// applies it via `applyFn`. `offset` shifts the whole take (timeline tracks).
export function replayActions(applyFn, actions, { loop = false, offset = 0, label = 'replay' } = {}) {
  const ops = (actions || []).map(a => ({ at: offset + (a.t || 0), fn: () => applyFn(a) }));
  return scheduleReplay(ops, { loop, label });
}

class ReplayClock {
  constructor(ops, { loop, label }) {
    this._ops    = [...ops].sort((a, b) => a.at - b.at);
    this._loop   = loop;
    this._label  = label;
    this._timers = [];
    this._live   = null;
    this._destroyed = false;
    this._ownerEditorId = window.__ar_active_editor_id ?? null;
    this._duration = this._ops.length ? this._ops[this._ops.length - 1].at : 0;
  }

  start() {
    if (this._destroyed) return this;
    _clocks.add(this);
    this._live = liveOutput(this);
    this._scheduleCycle();
    return this;
  }

  _scheduleCycle() {
    for (const op of this._ops) {
      const id = window.setTimeout(() => {
        if (this._destroyed) return;
        try { op.fn(); } catch (e) { console.error('[replay] action failed:', e); }
      }, Math.max(0, op.at));
      this._timers.push(id);
    }
    // End marker: loop wrap, or release keep-alive when the take finishes. Only
    // loop when there is real duration, else a 0-length take spins a tight loop.
    const endId = window.setTimeout(() => {
      if (this._destroyed) return;
      if (this._loop && this._duration > 0) {
        this._timers = [];
        this._scheduleCycle();
      } else {
        this.stop();
      }
    }, this._duration + 1);
    this._timers.push(endId);
  }

  stop() {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const id of this._timers) window.clearTimeout(id);
    this._timers = [];
    this._live?.release();
    this._live = null;
    _clocks.delete(this);
  }
}

// Test/inspection helper.
export function _activeReplayCount() { return _clocks.size; }

function cleanupReplayClocks(editorId) {
  for (const c of [..._clocks]) {
    if (editorId == null || c._ownerEditorId == null || c._ownerEditorId === editorId) {
      c.stop();
    }
  }
}
onReset(cleanupReplayClocks);
