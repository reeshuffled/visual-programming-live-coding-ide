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

### `tick(ms)` — composable interval

`tick(ms)` returns a full event-selector with modifier support. Preferred over raw `setInterval` when you want filter chains or event interlocking.

```js
tick(16).do(() => {        // ~60fps loop
  draw.clear();
  draw.circle(x, y, 10, 'cyan');
});

tick(500).every(4).do(fn);                   // every 2s (4 × 500ms)
tick(100).after('audio:start').do(fn);       // only after transport starts
tick(100).when(() => x > 0).do(fn);          // predicate guard
```

`tick()` respects pause/resume and auto-cleans on Stop (uses the patched `setInterval`).

### Animation loop example

```js
draw.bg('#111');
let t = 0;

tick(16).do(() => {
  draw.clear().bg('#111');
  draw.circle(800 + Math.cos(t) * 300, 450 + Math.sin(t) * 200, 30, 'cyan');
  t += 0.04;
});
```

---

## Keyboard

Key events are on the bus as `window:key:down` / `window:key:up`.

### Dispatch by key name

Pass an object to `.when()` to dispatch to handlers for each key. Keys that aren't in the map are ignored.

```js
on('window:key:down').when({
  ArrowUp:    () => y -= 10,
  ArrowDown:  () => y += 10,
  ArrowLeft:  () => x -= 10,
  ArrowRight: () => x += 10,
  ' ':        () => draw.clear(),  // space bar
});
```

### Edge-trigger on a single key

```js
on('window:key:down').when(d => d.key === 'Enter').do(() => {
  audio.say('go');
});
```

### Held-key polling with `hold()`

`hold('window:key:down')` returns a live **Set** of currently held key names. Use inside `tick()` for smooth movement.

```js
const keys = hold('window:key:down');
let x = 800, y = 450;

tick(16).do(() => {
  if (keys.has('w') || keys.has('ArrowUp'))    y -= 5;
  if (keys.has('s') || keys.has('ArrowDown'))  y += 5;
  if (keys.has('a') || keys.has('ArrowLeft'))  x -= 5;
  if (keys.has('d') || keys.has('ArrowRight')) x += 5;
  draw.clear().bg('#111');
  draw.circle(x, y, 20, 'cyan');
});
```

### Key payload

```
window:key:down  { key, code, repeat, winId }
window:key:up    { key, code, winId }
```

`winId` — id of the focused WM window, or `null` if focus is elsewhere (e.g. the editor). To exclude editor typing: `.when(d => d.winId !== 'win-editor')`.

### Per-window scoped keys

```js
on('wm:win-1:key:down').when({ ' ': () => nextFrame() });
// payload: { key, code, repeat }  (no winId — it's implicit in the topic)
```

Common key names: `'ArrowUp'` `'ArrowDown'` `'ArrowLeft'` `'ArrowRight'` `' '` (space) `'Enter'` `'Escape'` `'a'`–`'z'` `'0'`–`'9'` `'Shift'` `'Control'`

---

## Mouse

Mouse events are on the bus as `window:mouse:*`.

### Clicks

```js
on('window:mouse:click').do(({ button, x, y, winId }) => {
  if (button === 0) draw.circle(x, y, 8, 'white'); // left click
});
```

### Live mouse position

`hold('window:mouse:move')` returns a live `{ x, y, winId }` object — always current, no polling needed.

```js
const mouse = hold('window:mouse:move');

tick(16).do(() => {
  draw.clear().bg('#111');
  draw.circle(mouse.x, mouse.y, 20, 'white');
});
```

The mouse:move source is **lazy** — the DOM listener starts only when something subscribes.

### Mouse → shader

```js
const mouse = hold('window:mouse:move');
const s = new Shader(({ uv, custom }) => {
  const d = length(uv - vec2(custom.x, custom.y));
  return [1.0 - smoothstep(0.0, 0.05, d), 0.0, 0.0, 1.0];
});
tick(16).do(() => s.set([mouse.x / draw.width, mouse.y / draw.height, 0, 0]));
s.start();
```

### Mouse payload

```
window:mouse:down  { button, x, y, winId }   // button: 0=left 1=mid 2=right
window:mouse:up    { button, x, y, winId }
window:mouse:click { button, x, y, winId }
window:mouse:move  { x, y, winId }           // x,y in viewport pixels
```

### Per-window scoped mouse

```js
on('wm:win-1:mouse:click').do(({ button, x, y }) => {
  console.log('clicked', x, y); // x,y relative to window body
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

### WASD movement (dispatch + tick)

```js
on('window:key:down').when({
  w: () => y -= 10,
  s: () => y += 10,
  a: () => x -= 10,
  d: () => x += 10,
});

let x = 800, y = 450;
tick(16).do(() => {
  draw.alpha(0.1).bg('#111').alpha(1);
  draw.circle(x, y, 20, Color.random());
});
```

### Smooth movement (held-key polling)

```js
const keys = hold('window:key:down');
let x = 800, y = 450;

tick(16).do(() => {
  if (keys.has('ArrowLeft'))  x -= 5;
  if (keys.has('ArrowRight')) x += 5;
  if (keys.has('ArrowUp'))    y -= 5;
  if (keys.has('ArrowDown'))  y += 5;
  draw.clear().bg('#111');
  draw.circle(x, y, 20, 'cyan');
});
```

### Click to spawn particles

```js
const particles = [];
draw.bg('#000');

on('window:mouse:click').when(d => d.button === 0).do(({ x, y }) => {
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

tick(16).do(() => {
  draw.alpha(0.15).bg('#000').alpha(1);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.life -= 0.02;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    draw.alpha(p.life).circle(p.x, p.y, 6, `hsl(${p.hue}, 90%, 65%)`).alpha(1);
  }
});
```

### Timed sequence

```js
const s = audio.fm();

setTimeout(() => {
  s.play('C4', '4n');
  setTimeout(() => {
    s.play('E4', '4n');
    setTimeout(() => s.play('G4', '2n'), 500);
  }, 500);
}, 1000);
```

---

## Events — `on`, `emit`, `any`

A global reactive event bus. Every subsystem emits lifecycle events. Subscriptions created
during a code run are automatically cleared on reset.

```js
// Subscribe to any event
const stop = on('beat:tick').do(({ bpm, bar, beat }) => {
  if (beat === 0) draw.bg('#111');
});
stop(); // unsubscribe

// Modifiers (chain before .do)
on('beat:tick').every(4).do(fn)                // every 4th tick
on('gesture:detected').within(500).do(fn)      // < 500ms since last
on('beat:tick').after('audio:start').do(fn)    // only after transport starts
on('beat:bar').when(d => d.bar % 2 === 0).do(fn) // predicate guard

// Object filter — only events where key = 'w'
on('window:key:down').when({ key: 'w' }).do(fn)

// Dispatch map — routes to handler by key name
on('window:key:down').when({ w: fnW, s: fnS, a: fnA, d: fnD });

// Multiple events at once
any('beat:bar', 'gesture:detected').do(data => console.log(data));

// Emit user events or trigger commandable system actions
emit('my-event', { x: 1 });
emit('wm:spawn', { title: 'Wave', type: 'shader' }); // causes a spawn
emit('audio:start');                                   // starts transport

// Fake an event for testing (no side effects on subsystems)
emit('beat:tick', { bpm: 120, bar: 0, beat: 2 });
```

### Key system events

```
beat:tick   { bpm, bar, beat, time }    — every quarter-note (transport running)
beat:bar    { bpm, bar, time }           — start of each bar (4 beats)
beat:phrase { bpm, phrase, time }        — every 16 beats
audio:start / audio:stop / audio:bpm-change

window:key:down    { key, code, repeat, winId }
window:key:up      { key, code, winId }
window:mouse:down  { button, x, y, winId }
window:mouse:up    { button, x, y, winId }
window:mouse:click { button, x, y, winId }
window:mouse:move  { x, y, winId }

wm:spawn / wm:close / wm:focus { id } / wm:blur { id } / wm:move / wm:resize
session:start { code } / session:stop / session:reset / session:error { error, line }
gesture:detected { type, hand } / gesture:expression / gesture:face
midi:note:on  { note, velocity, channel } / midi:note:off { note, channel }
midi:cc       { channel, cc, value }
camera:open / camera:close / camera:flip
shader:compile / shader:start / shader:stop / shader:error
sensor:gamepad / sensor:motion / sensor:shake / sensor:geo / sensor:battery / sensor:network
haptics:vibrate { pattern } / haptics:tap / haptics:buzz { ms } / haptics:stop
pipe:create / pipe:stage-added / pipe:show
desktop:file-added / desktop:file-removed / desktop:icon-clicked
editor:change / editor:save
```

Type inside `on('…')` in the editor for autocomplete of the full event catalog.

### Per-window scoped events

Replace `window:*` with `wm:{winId}:*` to scope to a specific window:

```js
on('wm:win-1:key:down').when({ ArrowUp: () => scroll(-10) });
on('wm:win-1:mouse:click').do(({ x, y }) => console.log(x, y));
on('wm:win-1:mouse:move').do(({ x, y }) => updateCursor(x, y));
```

---

## Global Constants

```js
draw.width   // 1600
draw.height  // 900
getCanvas().width   // 1600
getCanvas().height  // 900
```
