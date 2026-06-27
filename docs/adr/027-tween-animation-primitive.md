# ADR 027 — Tween Animation Primitive

**Status**: Accepted  
**Date**: 2026-06-27

## Context

User code that animates properties over time (fading, easing, decay) requires a timer loop plus a cleanup step when the animation ends. Every such script re-implements the same pattern: `setInterval` to update a value, `clearInterval` + cleanup callback when done. This came up concretely in the karaoke word-decay script (`setInterval` updating TextLayer handle alpha, `handle.remove()` at the end).

`tick(ms)` is the existing interval primitive but has no concept of a bounded duration or a normalized progress value — it fires indefinitely until cancelled.

## Decision

Add `tween(duration, fn, opts?)` to `event-selector.js`, exported to `window`.

```js
const cancel = tween(duration, fn, { easing, onDone })
```

- `duration` — milliseconds
- `fn(t)` — called each frame with `t` in [0, 1] (linear progress). Return value ignored.
- `opts.easing` — optional function `(t) => t`. Default: identity (linear). User supplies any curve: `t => 1-(1-t)**3`, etc.
- `opts.onDone` — optional callback fired once when `t` reaches 1, after the final `fn(1)` call.
- Returns a cancel handle (zero-arg function). Calling it stops the animation before completion; `onDone` does NOT fire on cancel.

Uses `window.setInterval` at 16ms (the harness-patched version) so tweens participate in pause/resume and are auto-cleared on reset — same contract as `tick()`.

## Why setInterval, not requestAnimationFrame

`requestAnimationFrame` is not tracked or patched by the harness. rAF callbacks would survive a reset and fire against stale DOM state. The patched `setInterval` pauses with the timer-manager and is cleared on `stopRunning()`. The 16ms interval matches display refresh rate well enough for creative use cases; the smoothness difference from vsync-locked rAF is not perceptible in this context.

## Consequences

- Animated decay, fade-in, and property interpolation become one-liners in user scripts.
- `window.tween` is public API — the name and signature are now a commitment.
- No built-in easing library: users compose their own curves. This keeps the primitive minimal and avoids a string-based easing enum.
- `onDone` does not fire on cancel — consistent with how `clearInterval` discards pending callbacks.
