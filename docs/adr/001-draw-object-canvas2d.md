# ADR 001: Custom `draw` Object on Canvas2D (not PIXI.js)

**Status:** Decided  
**Date:** 2026-06-22

## Decision

Build a thin `draw` convenience object backed by the native Canvas2D API. Do not adopt PIXI.js or another scene-graph renderer.

## Context

The IDE exposes raw Canvas2D today:

```js
const ctx = getCanvas(0).getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, 100, 100);
```

Users write boilerplate (`fillStyle`, `beginPath`, `save`/`restore`) on every run. The natural fix is a higher-level `draw` object. Two options were considered: adopt PIXI.js, or build a thin wrapper ourselves.

## Why not PIXI.js

PIXI is a scene-graph renderer. Its model is `new Graphics()`, `.addChild()`, `.destroy()`. That is an **anti-pattern for live coding**, where user code re-runs from scratch on every edit. Users would need to manage object lifecycle — which breaks the core IDE idiom of "just write expressions."

Additional friction:

- **Bundle cost** — PIXI v8 ~600 KB; current bundle is 659 KB. Doubling size for drawing convenience is not justified.
- **Layer system conflict** — the IDE composites output via CSS z-indexed `<canvas>` elements (`getCanvas(z)`, `getLayer(z)`). PIXI owns its own canvas and can't participate in this stack without hacks.
- **Shader interop** — `Shader` (WebGPU) pre-warms a GPU device at startup. PIXI v8 inits its own separate WebGPU instance. They cannot share a device; two adapters in one page is wasteful.
- **Timer/hot-reload integration** — `freezeTimers`/`restoreTimers` suspends all user-code RAF loops on pause. PIXI's internal ticker does not plug into this.
- **Error quality** — PIXI errors surface as WebGL/WGSL stack traces. We can give contextual messages ("rect: x must be a number, got string") from a layer we own.
- **Blockly codegen** — block generators emit function-call expressions. `draw.rect(x,y,w,h,color)` maps cleanly to a block. PIXI's object model does not.

## Why Canvas2D is sufficient

Live coding rarely hits Canvas2D's performance ceiling. Bottleneck is typically the JavaScript re-run, not rasterisation. For GPU-heavy work (10 000+ shapes, particle fields, procedural patterns), the `Shader` class (WebGPU/WGSL) is already the right tool.

## What the `draw` object provides

Stateless immediate-mode API — no `new`, no `.addChild()`, no cleanup:

```js
draw.bg('#111')
draw.circle(mouse.x, mouse.y, 50, 'red')
draw.rect(100, 100, 200, 80, 'blue')
draw.text('hello', 400, 300, 32, 'white')
draw.line(0, 0, 400, 400, 'lime', 2)
draw.push(); draw.alpha(0.5); draw.rect(100, 100, 200, 80, 'blue'); draw.pop()
```

Internally: thin wrappers over `CanvasRenderingContext2D`, auto-routing to `getCanvas(z)`, respecting the existing layer system.

## Upgrade path

If users demonstrably need 10 000+ shapes per frame, a WebGPU backend can be added under the same `draw` API surface: pre-compile rect/circle/line pipelines at startup, batch vertex buffers, flush on `draw.flush()`, share the `Shader` class's GPU device. Text falls back to Canvas2D texture blit. Estimated ~500 lines. The API surface stays identical; the backend swaps.

This upgrade is deferred until evidence of a real perf ceiling. The Canvas2D path ships first (~200 lines) because it covers the realistic live-coding workload with zero infrastructure cost.

## Consequences

- `draw` object added as a global in user code alongside `audio`, `Shader`, `Media`, `vision`
- Raw `getCanvas(z).getContext('2d')` remains available — `draw` is additive, not a replacement
- API drawer (toolkit snippets) updated with `draw.*` entries
- Blockly canvas blocks: pending update to emit `draw.*` calls instead of raw `getContext('2d')`
- Future: WebGPU batch backend is a drop-in swap if needed
