# Canvas API

Two drawing APIs: `draw` (fluent, opinionated) and raw `getCanvas()` (full 2D context access). Layer system for z-ordering and CSS effects.

---

## draw — Fluent Drawing API

`draw` is a global targeting z=0. All methods are chainable.

```js
draw.bg('#111')
    .circle(800, 450, 100, '#ff0')
    .rect(100, 100, 200, 50, 'red')
    .text('hello', 400, 300, 32, '#fff');
```

### Background & Clear

```js
draw.bg('#111')       // fill entire canvas with color
draw.clear()          // clear to transparent
```

### Filled Shapes

```js
draw.rect(x, y, w, h, color)
draw.circle(x, y, r, color)
draw.arc(x, y, r, startRad, endRad, color)
draw.poly([[x1,y1],[x2,y2],[x3,y3]], color)  // filled polygon
```

### Stroked Shapes

```js
draw.rectStroke(x, y, w, h, color, thickness)
draw.ring(x, y, r, color, thickness)           // stroked circle
draw.arcStroke(x, y, r, startRad, endRad, color, thickness)
draw.line(x1, y1, x2, y2, color, thickness)
draw.polyStroke([[x1,y1],[x2,y2]], color, thickness, closed)
```

### Text

```js
draw.text(str, x, y, size, color)
draw.text(str, x, y, size, color, { font: 'monospace', align: 'center', baseline: 'middle' })
// align: 'left' | 'center' | 'right'
// baseline: 'alphabetic' | 'middle' | 'top' | 'bottom'
```

### Images

```js
const img = await Media.image('https://example.com/photo.jpg');
draw.image(img, x, y)           // natural size
draw.image(img, x, y, w, h)     // stretched to w×h
```

### Transform

```js
draw.translate(x, y)
draw.rotate(radians)
draw.scale(x, y)          // scale(2) or scale(2, 0.5)
draw.resetTransform()     // identity matrix

// Always push/pop around transforms
draw.push()
  .translate(800, 450)
  .rotate(Math.PI / 4)
  .rect(-50, -50, 100, 100, 'cyan')
  .pop();
```

### Compositing & Alpha

```js
draw.alpha(0.5)                    // global opacity
draw.blend('screen')               // composite mode
// modes: 'source-over' 'screen' 'multiply' 'overlay' 'lighter' 'difference' etc.
draw.push().alpha(0.3).circle(400, 400, 50, '#f00').pop();
```

### State

```js
draw.push()   // save transform, alpha, blend mode
draw.pop()    // restore
draw.reset()  // reset transform, alpha, blend, shadow, lineWidth
```

### Multi-layer

```js
draw.at(1).bg('#000')          // draw to z=1 layer
draw.at(2).circle(400, 300, 80, '#f0f')  // draw to z=2 layer

// draw.at(z) returns the same DrawTarget interface
const bg = draw.at(-1);     // behind camera
const fg = draw.at(5);      // above main canvas
```

### Size

```js
draw.width   // canvas width in pixels (1600)
draw.height  // canvas height in pixels (900)
```

---

## getCanvas — Raw 2D Context

Direct access to the HTMLCanvasElement:

```js
const canvas = getCanvas(0);          // z=0 (default)
const ctx = canvas.getContext('2d');

ctx.fillStyle = 'red';
ctx.fillRect(100, 100, 200, 200);

// Draw with alpha trail
ctx.fillStyle = 'rgba(0,0,0,0.1)';
ctx.fillRect(0, 0, canvas.width, canvas.height);
```

Use `getCanvas()` when you need features not in `draw`: gradients, bezier paths, pixel manipulation, patterns, shadows, `createImageData`, etc.

---

## getLayer — CSS Effects

`getLayer(z)` returns a Layer object that applies CSS filters and transforms to the entire canvas at that z-index.

```js
const layer = getLayer(0);

// Filters (combine freely)
layer.blur(5)            // Gaussian blur in px
layer.hue(90)            // hue-rotate in degrees
layer.brightness(1.5)    // 1 = normal, 2 = double
layer.saturate(2)        // 1 = normal, 0 = grayscale
layer.invert(1)          // 0–1, 1 = full invert
layer.filter('sepia(0.5) contrast(1.2)')  // raw CSS filter string

// Opacity
layer.opacity(0.7)

// Transforms
layer.rotate(45)         // degrees
layer.rotateX(30)        // 3D flip X
layer.rotateY(30)        // 3D flip Y
layer.scale(1.5)         // uniform scale
layer.scale(2, 0.5)      // x, y scale
layer.perspective(800)   // perspective depth for rotateX/Y

// Clip
layer.clip('circle(50%)')
layer.clip('polygon(50% 0%, 100% 100%, 0% 100%)')

// Remove all effects
layer.reset()
```

All Layer methods return `this` — chainable:
```js
getLayer(0).blur(2).brightness(1.3).hue(45);
```

---

## Z-order Reference

`draw.at(z)` / `getCanvas(z)` take a **logical z** mapped to CSS z-index as `20 + z`. Media and Shader set CSS z-index directly.

| Logical z | CSS z-index | Default use |
|-----------|-------------|-------------|
| negative  | negative    | Behind camera feed |
| 0         | 20          | Main canvas — `draw`, `getCanvas()` |
| 1–4       | 21–24       | Safe user layers (`draw.at(1)` etc.) |
| 5+        | 25+         | Collides with Media (CSS 25) / Shader (CSS 30) defaults |
| —         | 25          | Media layers (`Media.image`, `Media.video`) |
| —         | 30          | Shader layers (`new Shader(...)`) |

---

## Examples

### Animated particle system

```js
draw.bg('#0a0a0a');

let particles = Array.from({length: 60}, () => ({
  x: Math.random() * 1600,
  y: Math.random() * 900,
  vx: (Math.random() - 0.5) * 3,
  vy: (Math.random() - 0.5) * 3,
  r: 2 + Math.random() * 6,
  hue: Math.random() * 360,
}));

setInterval(() => {
  draw.alpha(0.08).bg('#000').alpha(1);
  particles.forEach(p => {
    p.x = (p.x + p.vx + 1600) % 1600;
    p.y = (p.y + p.vy + 900) % 900;
    draw.circle(p.x, p.y, p.r, `hsl(${p.hue}, 80%, 60%)`);
  });
}, 16);
```

### Beat-reactive with layer blur

```js
draw.bg('#111');

const kick = audio.kick();
const meter = audio.meter();
kick.chain(meter);

setInterval(() => {
  const amp = Math.pow(10, (meter.getValue() || -Infinity) / 20);
  draw.clear()
      .circle(800, 450, 100 + amp * 200, `hsl(${Date.now() / 20 % 360}, 80%, 60%)`);
  getLayer(0).blur(amp * 8);
}, 16);

pat('x . x . x x . x', kick).start();
audio.bpm(130); audio.start();
```

### Two-layer compositing

```js
// Background on layer 0
draw.at(0).bg('#000');

// Foreground on layer 1 with screen blend
const fg = draw.at(1);
getLayer(1).opacity(0.8);

let t = 0;
setInterval(() => {
  t += 0.02;
  draw.at(0).alpha(0.05).bg('#000').alpha(1);
  fg.clear();
  for (let i = 0; i < 5; i++) {
    const x = 800 + Math.cos(t + i * 1.26) * 300;
    const y = 450 + Math.sin(t * 0.7 + i * 1.1) * 200;
    fg.circle(x, y, 40, `hsl(${i * 72 + t * 30}, 90%, 65%)`);
  }
}, 16);
```
