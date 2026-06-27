# ADR 029 — route().tap() — Window-Scoped Event Side-Effects on Frame Routes

**Status**: Accepted  
**Date**: 2026-06-27

## Context

A frame route (`route(Source.camera).show(...)`) and a discrete route (`route('audio:word:interim').to(fn)`) are typically written as two separate expressions. But in live creative use cases (karaoke word rain, beat-reactive overlays, gesture-triggered text) the two are semantically coupled: "while this camera stream is showing, react to these events in that same window."

Writing them separately requires:
1. Capturing `winId` from `route().show()` (or the `pipe:show` bus event)
2. Ensuring the window has TextLayer support (currently only canvas/shader/camera type windows)
3. A second `route()`/`on()` call that must be manually cleaned up or is reset-scoped

The two concerns — visual stream + event side-effect — share a lifecycle but have no language to express that.

## Decision

Add `.tap(event, fn)` to frame routes only.

```js
route(Source.camera)
  .tap('audio:word:interim', ({ word }, winId) =>
    wm.addText(winId, word, x, y, { decay: 6000 })
  )
  .show('Karaoke', { w: 800, h: 450 });
```

### Semantics

- **Frame routes only.** `.tap()` on a discrete or continuous route throws — there is no window context.
- **`fn(payload, winId)`** — second arg is the route's shown window id. Resolved after `.show()` is called; subscriptions are started there, so `winId` is always valid when `fn` fires.
- **Lifecycle-bound.** Subscriptions are unsubscribed when the route is destroyed (window closed, `reset()`, route `.stop()`). Not merely reset-scoped — they live as long as the route lives.
- **Auto-grant TextLayer.** `wm.addText` is updated to auto-graft a TextLayer onto any window that lacks one, using the window body as container. This makes `wm.addText(winId, ...)` work on pipe/route-spawned windows without requiring canvas-type spawn.
- **Multiple taps allowed.** Each `.tap()` call appends to a list; all start on `.show()`.
- **Returns `this`.** Fully chainable — `.tap().tap().show()` works.

### Why frame-only

A discrete/continuous route has no window. Tapping another event onto it has no output context — the `winId` second arg would be null and the pattern would be misleading. Frame routes are the only routes with a display window to bind to.

### Why lifecycle-bound, not reset-scoped

Reset-scoped subscriptions (`clearRunScoped`) clean up when code re-runs. But a route's window can be closed mid-session without a reset — in that case the subscription should also die. Binding to route destroy (which fires on window close via `onClose`) is more precise.

### Auto-grant TextLayer rationale

Pipe/route-spawned windows are type `html` — `_addPaintOverlay` (which installs TextLayer) is not called. Rather than change the spawn type (which would add unwanted brush/capture UI), `wm.addText` auto-grafts a minimal TextLayer on first call. The body element is used as the container; `position:relative` is set. This is lazy and correct — TextLayer is sized from `clientWidth/Height` at first `_ensureTextLayer()` call, which is deferred until the window is in the DOM.

## Consequences

- Karaoke / word-rain / event-overlay patterns become single-expression.
- `.tap()` is public API on Route — removing or renaming it is a breaking change.
- `wm.addText` now silently grafts TextLayer onto any window — previously it warned and returned null. Code relying on the null return as a sentinel needs updating (none known).
- Tap subscriptions outlive reset if the route window stays open — intentional, but means taps keep firing across multiple code re-runs until the window is closed.
