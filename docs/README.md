# Visual Live Coding IDE — Docs

Press **?** in the IDE for the in-app audio quick reference.

## APIs

| Doc | What it covers |
|-----|---------------|
| [audio.md](audio.md) | Synths, effects, patterns, scales, microphone, audio→visual |
| [shader.md](shader.md) | WebGPU fragment shaders, uniforms, WGSL |
| [canvas.md](canvas.md) | Canvas 2D drawing, layers, CSS effects |
| [media.md](media.md) | Images, video layers |
| [vision.md](vision.md) | Object detection, gesture, face expression |
| [control.md](control.md) | Timers, keyboard, color, utilities |
| [windows.md](windows.md) | Spawn, tile, show/hide, move/resize IDE windows from code |

## Z-order

`draw.at(z)` / `getCanvas(z)` take a logical z, mapped to CSS z-index as `20 + z` (negative stays negative). Media and Shader use CSS z-index directly.

| Logical z | CSS z-index | Contents |
|-----------|-------------|----------|
| negative  | negative    | Behind camera feed |
| 0         | 20          | Main canvas — `draw`, `getCanvas(0)` |
| 1–4       | 21–24       | Safe range for additional user layers |
| 5+        | 25+         | Overlaps Media (CSS 25) and Shader (CSS 30) defaults |
| —         | 25          | Media default (`Media.image`, `Media.video`) |
| —         | 30          | Shader default (`new Shader(...)`) |

## Global Functions

```js
draw               // Fluent 2D drawing API — draw.rect/circle/text/line/etc (see canvas.md)
getCanvas(z?)      // HTMLCanvasElement at logical z (default 0)
getLayer(z?)       // Layer object with CSS effects API
pat(str, synth)    // Create audio pattern (mini-notation)
stack(p1, p2, …)  // Layer multiple patterns
onKey(key, fn)     // Keyboard handler
randUni(lo, hi)    // Random float in range
Color.random()     // Random vivid HSL color string
Color.invert(str)  // Invert a CSS color string
stop()             // Stop execution
pause()            // Pause timers
resume()           // Resume timers
wm.show/hide/toggle/focus/maximize/restore(id)  // control IDE windows (see windows.md)
wm.move(id, x, y) / wm.resize(id, w, h)        // position windows in px
wm.layout(name)                                 // switch tiling layout
wm.spawn(title, opts)                           // create floating window → id
wm.pickFile(key)                                // file picker → blob URL (async, cached by key)
wm.list()                                       // list all window ids
```
