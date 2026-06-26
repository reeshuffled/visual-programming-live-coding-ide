# ADR 013 — Global Reactive Event Bus

**Status:** Accepted  
**Date:** 2026-06-26

## Context

createos is a browser live-coding environment. Previously, reacting to subsystem events
required per-subsystem callbacks: `vision.onGesture`, `midi.onNote`, `sensors.mouse().onMove`,
`audio.onWord`. There was no global event bus, no composable subscription modifiers, and no
way to programmatically cause subsystem actions from user code without calling API methods
directly.

## Decision

Add a single global event bus exposing three user-facing globals (`on`, `emit`, `any`) plus a
full instrumentation layer across all 11 subsystems.

### Architecture

```
src/events/
  bus.js            singleton: emit, notify(private), subscribe(private),
                    registerCommand(internal), clearRunScoped; self-registers onReset()
  event-selector.js EventSelector class (every/after/within/when/do) + on() / any()
  system-events.js  SYSTEM_EVENTS catalog [{ name, detail, payload, commandable }]
  index.js          re-exports public + internal APIs
```

### emit() / notify() split

The central invariant preventing double-notification and infinite loops:

- **`emit(event, data)`** — if a command handler is registered, calls it. Does NOT then fire
  subscribers. Method bodies call `notify()` to announce completion to subscribers.
  If no handler: fires subscribers directly (notification-only events).

- **`notify(event, data)`** — direct subscriber fire, bypasses command handlers. Used
  exclusively inside subsystem method bodies to emit lifecycle events.

This means: `emit('wm:spawn', opts)` → command handler runs `wm.spawn()` → `wm.spawn()` body
calls `notify('wm:spawn', result)` → subscribers notified once. Two entries, one notification.

### Why not fire subscribers after command handler returns?

Originally considered, rejected: if method bodies also call `notify()`, subscribers would fire
twice per emit+command. The split is the clean solution.

### Session-scoped teardown

Subscriptions created while `window.__ar_active_editor_id != null` (i.e., during a user code
run) are tagged `runScoped = true`. `clearRunScoped()` wipes them on every reset, preventing
stacking across re-runs. This reuses the exact same tag already used by `app.js` for
`addEventListener` patching — no new concept.

`clearRunScoped()` is called from:
1. `stopRunning()` in `editor-instance.js` (explicit stop)
2. The bus's own `onReset` handler (fires during `runResetHandlers()` in `reset()`/`_softReset()`)

System command handlers (registered at module load by subsystems) are never tagged run-scoped
and survive resets — they live in `_commandHandlers` which is never cleared.

### Why session:reset / session:stop are NOT commandable

Making `session:reset` commandable would create a re-entry loop:
`emit('session:reset')` → command handler → `inst.reset()` → `runResetHandlers()` →
bus's own `onReset` handler → `_fire('session:reset')` → subscribers → (loop).

These events are fired directly from editor-instance.js lifecycle methods as pure notifications.

### EventSelector

`on('event').every(n).after(e).within(ms).when(pred).do(fn)` — chainable modifier chain.
`.do(fn)` commits and returns a stop handle. `any(...events)` returns a selector with
multiple events; `.do()` subscribes to each, all sharing the same modifier state.

`within(ms)` is dual-mode:
- Standalone: gates on time since last `fn` call (rate-limiter)
- With `after(e)`: gates on time since after-event fired

### CodeMirror completion

`src/editor/event-completion.js` — esprima-based (not Lezer/CM6 syntaxTree). Detects cursor
inside first string arg of `on()/any()`, returns SYSTEM_EVENTS as keywords plus any
`emit('x')` / `on('x')` / `any('x')` strings from the document as user-defined events.

## Consequences

**Good:**
- Single string-keyed bus covers all subsystem lifecycle events
- `emit('wm:spawn', opts)` causes a spawn — user code drives the app through events
- `on('beat:tick').every(4).do(fn)` composable without per-subsystem API knowledge
- Run-scoped teardown prevents listener accumulation across re-runs
- Completion source makes the event catalog self-documenting inside the editor

**Trade-offs:**
- Two notification entry points (`emit` for external, `notify` for internal) require discipline;
  method bodies must not call `emit()` (would re-enter command handler)
- Beat scheduling (`beat:tick/bar/phrase`) depends on `Tone.getTransport().scheduleRepeat`
  which is wiped by `cleanupAudio()`'s `cancel()` call — `_setupBeatSchedule()` must be
  re-called after `cancel()` (done in `cleanupAudio()`)
- GLShader instances register in the shared `_shaderRegistry` (via `registerShaderInstance()`)
  exported from `shader.js` — avoids a separate shared module at the cost of one cross-import
