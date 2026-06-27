# ADR 028 — Declarative Object Lifecycle (decay + animate)

**Status**: Accepted  
**Date**: 2026-06-27

## Context

Creating a temporary animated object (e.g. a karaoke word that fades and self-removes) requires three separate calls: create the object, start a tween updating its properties, then remove it when done. The object and its animation are not co-located, and the cleanup handle must be passed around.

## Decision

### `opacity` on TextLayer handle

`setStyle({ opacity: n })` sets `div.style.opacity` directly. This adds a numeric opacity property independent of the color string, making it tweenable without color parsing.

### `decay: ms` in `wm.addText` opts

```js
wm.addText('win-canvas', word, x, y, { fontSize: 48, color: '...', decay: 6000 })
```

Fades opacity 1→0 over `ms` milliseconds then calls `handle.remove()`. Internally expands to a `tween` call on the handle. Covers the dominant "temporary text object" pattern (word rain, karaoke, notifications) in one line with no external handle.

### `animate` in `wm.addText` opts

```js
wm.addText('win-canvas', word, x, y, {
  fontSize: 48,
  animate: { fontSize: [24, 96], rotation: [0, 45], duration: 500, easing: t => 1-(1-t)**3 }
})
```

Tweens any numeric TextLayer handle properties that map to `setStyle` (`fontSize`, `rotation`, `kerning`, `opacity`) from `[from, to]` at creation. Position (`x`/`y`) excluded — `moveTo` requires both coordinates simultaneously; position animation uses standalone `tween`. `duration` (ms) required. `easing` optional (linear default). `onDone` optional callback. Returns the same handle — cancel via `handle.cancelAnimate()` if needed.

`decay` and `animate` are composable — both can appear in the same opts object.

### Scope

Creation-time lifecycle config applies to `wm.addText` only. `Shader`/`GLShader` deferred — animation must wait for `.start()` which makes constructor-level opts ambiguous. `Layer` has no creation API (`getLayer(z)` returns existing) — use standalone `tween()`.

## Why `opacity` not color-alpha

Color on TextLayer handles is a CSS string (`hsl(...)`, `#fff`). Parsing and lerping it requires a color library or bespoke HSL math. `div.style.opacity` is a numeric CSS property that composites correctly without any string manipulation. The visual result is identical for the fade use case.

## Consequences

- Common temporal-text patterns become single-call, zero-handle expressions.
- `wm.addText` opts grow three new fields (`decay`, `animate`, opacity in `setStyle`).
- `decay` and `animate` both use the harness-tracked `tween()` internally — they pause/clean on reset automatically.
- TextLayer `opacity` is now a first-class animatable property alongside `fontSize`, `rotation`, etc.
