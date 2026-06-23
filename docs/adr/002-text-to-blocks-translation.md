# ADR 002: Text-to-Blocks Translation

**Status:** Decided — partial implementation planned  
**Date:** 2026-06-22

---

## Why this is hard

Blocks-to-text is easy: each block has an explicit generator function that emits a JS string. The mapping is injective and complete by construction.

Text-to-blocks is the reverse: parse arbitrary JS source and reconstruct a Blockly workspace. This is a **decompilation problem**, and decompilation is hard for the same reasons compilers are lossy.

### 1. Many JS forms map to one block

A single Blockly block can be written as any of these in JS:

```js
// All equivalent to shader_camera_effect{EFFECT:'greyscale'}
new Shader(`\n${body}\n`, { video: window.__ar_video }).start();
const s = new Shader(body, { video: window.__ar_video }); s.start();
(new Shader(body, {video: window.__ar_video})).start()
```

A pattern matcher must handle every valid surface form. Missing one silently drops a block.

### 2. Literals vs expressions

Blocks only accept literal field values or other block outputs wired to input slots. JS allows arbitrary expressions anywhere:

```js
draw.rect(x * 2, getY(), width - 10, h, hslColor(time));
```

`x * 2` is a `math_arithmetic` block. `getY()` has no block equivalent. `hslColor(time)` is a custom function call. The translator must decide: generate nested expression blocks, or drop the argument and substitute the block's default?

### 3. Variables and scope

Blockly has a global variable system distinct from JS `const`/`let`/`var`. A JS variable might be:

- A value used once in-place → inline in the parent block
- A value stored and reused → Blockly Variables block
- A closure over outer scope → untranslatable in Blockly's model
- A function parameter → Blockly has no equivalent without Procedures blocks

```js
const reverb = audio.reverb(2);
const synth = audio.synth();
synth.connect(reverb);  // synth and reverb must exist as Blockly variables
```

### 4. Control flow nesting

```js
setInterval(() => {
  draw.bg('#111');
  draw.circle(x, y, 50, 'red');
}, 100);
```

The lambda body must become child blocks of the `ctrl_interval` block. The translator must correctly handle arbitrary nesting depth, closures that capture outer variables, and early returns.

### 5. WGSL body matching

Camera/video shader presets are identified by their WGSL body string matching a `CAMERA_PRESETS` entry. But:

- Whitespace and indentation may differ
- Comments may be present
- User may have made minor edits to a preset body

Exact string match fails on any formatting difference. Fuzzy match is prone to false positives on custom shaders that happen to look similar to a preset.

### 6. Information that doesn't exist in blocks

Some JS code has no block equivalent — it was written in text because blocks can't express it:

```js
// Full custom WGSL with multiple texture bindings
const s = new Shader(`@fragment fn fs(...) { ... }`)
// Complex audio chains
mic.connect(filter).connect(analyser).connect(meter)
// Arbitrary math on canvas context
const ctx = getCanvas(0).getContext('2d');
ctx.save();
ctx.transform(a, b, c, d, e, f);
```

These must be silently dropped or flagged — there is no faithful block representation.

### 7. Multiple valid block interpretations

The same JS can map to multiple block shapes:

```js
draw.rect(0, 0, 1600, 900, '#000');
```

Is this `canvas_fill_rect` (fill the whole canvas) or `draw_bg` (semantic background)? Both generate the same JS. The translator must pick one arbitrarily or introduce ambiguity.

---

## What's feasible

For short live-coding programs (5–20 lines, API-call heavy, minimal closures), a **pattern-based translator** can cover ~80% of real user programs:

1. Parse with Esprima (already in codebase via `live-patch.js`)
2. Walk ExpressionStatement nodes, match against known call signatures
3. Emit Blockly JSON for matched patterns
4. Log unmatched lines as warnings; don't drop silently

What cannot round-trip, ever:
- Custom WGSL bodies (no block for arbitrary WGSL)
- `getCanvas(0).getContext('2d')` direct ctx access
- Complex closures and variable captures
- Chained method calls across multiple statements

## Decision

Build the best-effort translator in `js/js-to-blocks.js`. Cover the core API calls: `draw.*`, `new Shader(preset)`, `setInterval/setTimeout`, `onKey`, `audio.*`, `vision.on*`, `Media.video`. Emit a console warning for each skipped line. Do not attempt to translate custom WGSL, complex expressions, or raw canvas context calls.

Users who have written untranslatable code will see their translated blocks plus a warning list — this is better than either a crash or silent data loss.
