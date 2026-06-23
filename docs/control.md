# Control & Utilities

Timers, keyboard, mouse, colors, execution control.

---

## Timers

Standard web APIs — all are tracked and cleaned up automatically on Stop/Reset.

```js
setInterval(fn, ms)       // repeat fn every ms milliseconds
clearInterval(id)         // cancel interval

setTimeout(fn, ms)        // run fn once after ms milliseconds
clearTimeout(id)          // cancel timeout
```

### Example — animation loop

```js
draw.bg('#111');
let t = 0;

setInterval(() => {
  draw.clear().bg('#111');
  draw.circle(800 + Math.cos(t) * 300, 450 + Math.sin(t) * 200, 30, 'cyan');
  t += 0.04;
}, 16); // ~60fps
```

---

## Keyboard

For most cases, prefer `sensors.keyboard()` — it gives live held-key state and cleaner edge triggers (see [sensors.md](sensors.md)):

```js
const kb = sensors.keyboard();
kb.onKey('ArrowUp', () => y -= 10);
setInterval(() => { if (kb.is('w')) y -= 5; }, 16);
```

`onKey` (global shorthand) still works for simple one-shot handlers:

```js
onKey('ArrowUp', (e) => { /* fires on keydown */ });
onKey('any', (e) => { console.log(e.key); }); // any key
```

Common key names: `'ArrowUp'` `'ArrowDown'` `'ArrowLeft'` `'ArrowRight'` `' '` (space) `'Enter'` `'Escape'` `'a'`–`'z'`

---

## Mouse

For most cases, prefer `sensors.mouse()` — normalized coords, velocity, and button edge triggers (see [sensors.md](sensors.md)):

```js
const m = sensors.mouse();
m.stream(s => draw.circle(s.x * 1600, s.y * 900, 10, 'white'));
m.onButton(0, () => draw.bg('red'), () => draw.bg('black'));
```

Use raw DOM events when you need canvas-relative pixel coords or click targets:

```js
document.addEventListener('mousemove', (e) => {
  // e.clientX, e.clientY — viewport coords
});

// Canvas-relative coords
const canvas = getCanvas();
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * canvas.width;
  const y = (e.clientY - rect.top) / rect.height * canvas.height;
  draw.circle(x, y, 10, 'white');
});
```

---

## Color

```js
Color.random()        // random vivid HSL color — 'hsl(217, 75%, 58%)'
Color.invert(str)     // invert any CSS color — 'red' → 'rgb(0, 255, 255)'
```

### Color strings

Any CSS color works anywhere a color is expected:

```js
'red'
'#ff6600'
'rgb(255, 100, 0)'
'rgba(255, 100, 0, 0.5)'
`hsl(${hue}, 80%, 60%)`
`hsla(${hue}, 80%, 60%, 0.8)`
```

---

## Random

```js
randUni(lo, hi)       // random float in [lo, hi)
Math.random()         // 0–1
Math.floor(Math.random() * n)  // random int 0 to n-1
```

---

## Execution Control

```js
pause()    // freeze all timers and intervals (resumable)
resume()   // unfreeze — timers pick up from where they paused
stop()     // stop everything and clean up (same as pressing Stop)
```

---

## Console

```js
console.log(value)    // appears in the IDE console panel
console.error(msg)    // appears in red
console.clear()       // clear the console
clearConsole()        // same as console.clear()
```

---

## Examples

### WASD movement

```js
draw.bg('#111');
let x = 800, y = 450;

onKey('any', (e) => {
  if (e.key === 'w') y -= 10;
  if (e.key === 's') y += 10;
  if (e.key === 'a') x -= 10;
  if (e.key === 'd') x += 10;
});

setInterval(() => {
  draw.alpha(0.1).bg('#111').alpha(1);
  draw.circle(x, y, 20, Color.random());
}, 16);
```

### Click to spawn particles

```js
draw.bg('#000');
const particles = [];

getCanvas().addEventListener('click', (e) => {
  const rect = getCanvas().getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * 1600;
  const y = (e.clientY - rect.top) / rect.height * 900;
  for (let i = 0; i < 10; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 1,
      hue: Math.random() * 360,
    });
  }
});

setInterval(() => {
  draw.alpha(0.15).bg('#000').alpha(1);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.life -= 0.02;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    draw.alpha(p.life).circle(p.x, p.y, 6, `hsl(${p.hue}, 90%, 65%)`).alpha(1);
  }
}, 16);
```

### Timed sequence

```js
const s = audio.fm();

setTimeout(() => {
  s.play('C4', '4n');
  setTimeout(() => {
    s.play('E4', '4n');
    setTimeout(() => {
      s.play('G4', '2n');
    }, 500);
  }, 500);
}, 1000);
```

---

## Global Constants

```js
draw.width   // 1600
draw.height  // 900
getCanvas().width   // 1600
getCanvas().height  // 900
```
