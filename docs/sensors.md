# Sensors

Unified signal bus for physical and environmental inputs. Each `sensors.*()` method returns a **signal object** with:
- **Live getters** — read values at any time
- **`.stream(fn)`** — RAF-driven push (calls `fn(sig)` every frame)
- **Edge triggers** — `.onMove`, `.onKey`, `.onShake`, etc. — fire once on enter/exit

All signals and triggers are cleaned up automatically on Stop/Reset.

## Signal bus overview

The same signal pattern runs across multiple APIs:

| API | Live value | Edge trigger |
|-----|-----------|--------------|
| `sensors.mouse()` | `mouse.x/y/speed/…` | `.onMove(threshold, fn)` |
| `sensors.keyboard()` | `kb.held/last/is(key)` | `.onKey(key, fn)` |
| `sensors.gamepad()` | `pad.axis(i)/button(i)` | `.onButton/.onAxis` |
| `sensors.motion()` | `motion.ax/magnitude/…` | `.onShake/.onTilt` |
| `sensors.geo()` | `geo.lat/lon/speed/…` | `.stream(fn)` |
| `sensors.network()` | `net.online/type/…` | `.onChange(fn)` |
| `sensors.battery()` | `bat.level/charging/…` | `.onChange(fn)` |
| `video.signal(source)` | `sig.brightness/motion/hue/…` | `video.onMotion/.onBrightness` |
| `audio.level` | 0–1 RMS float | `audio.onLevel(threshold, fn)` |

`audio.level` and `audio.onLevel` follow the same live-getter + edge-trigger pattern — they're just always-on (no factory call needed) because there's a single mic input. See [audio.md](audio.md) for the full mic API.

---

---

## Mouse — `sensors.mouse()`

```js
const mouse = sensors.mouse();
```

| Getter | Type | Description |
|--------|------|-------------|
| `mouse.x` | 0–1 | Normalized horizontal position |
| `mouse.y` | 0–1 | Normalized vertical position |
| `mouse.px` | px | Raw viewport x |
| `mouse.py` | px | Raw viewport y |
| `mouse.vx` | f | Per-frame velocity x (normalized) |
| `mouse.vy` | f | Per-frame velocity y (normalized) |
| `mouse.speed` | f | `sqrt(vx² + vy²)` |
| `mouse.buttons` | int | Bitmask: bit 0 = left, 1 = right, 2 = middle |
| `mouse.left` | bool | Left button held |
| `mouse.right` | bool | Right button held |
| `mouse.middle` | bool | Middle button held |

**`.stream(fn)`** — `fn(mouse)` called every frame.

**`.onMove(threshold, onEnter, onExit?)`** — fires when `speed >= threshold` (normalized units/frame).

**`.onButton(btn, onDown, onUp?)`** — edge-trigger on button. `btn`: 0=left, 1=right, 2=middle.

```js
const m = sensors.mouse();
m.stream(s => draw.circle(s.x * 1600, s.y * 900, 10, 'white'));
m.onMove(0.005, () => console.log('moving'));
m.onButton(0, () => draw.bg('red'), () => draw.bg('black'));
```

---

## Keyboard — `sensors.keyboard()`

```js
const kb = sensors.keyboard();
```

| Getter | Type | Description |
|--------|------|-------------|
| `kb.held` | Set | Currently held key names |
| `kb.last` | string | Last key pressed this run |
| `kb.is(key)` | bool | True if `key` is currently held |
| `kb.any(...keys)` | bool | True if any listed key is held |

**`.onKey(key, onDown, onUp?)`** — edge-trigger. Use `'*'` to match any key.

```js
const kb = sensors.keyboard();

setInterval(() => {
  if (kb.is('ArrowLeft'))  x -= 5;
  if (kb.is('ArrowRight')) x += 5;
}, 16);

kb.onKey('Enter', () => draw.bg(Color.random()));
kb.onKey('*', (s, e) => console.log(e.key));
```

---

## Gamepad — `sensors.gamepad(index?)`

```js
const pad = sensors.gamepad();     // first connected gamepad
const pad2 = sensors.gamepad(1);   // second gamepad
```

| Method | Description |
|--------|-------------|
| `pad.axis(i)` | Axis value -1..1. 0=left_x, 1=left_y, 2=right_x, 3=right_y |
| `pad.button(i)` | Button value 0..1 (analog) |
| `pad.pressed(i)` | Button pressed bool |
| `pad.axes` | Raw axes array |
| `pad.buttons` | Raw buttons array |
| `pad.connected` | Bool |

**`.onButton(i, onDown, onUp?)`** — edge-trigger on button i.

**`.onAxis(i, threshold, onEnter, onExit?)`** — edge-trigger when `|axis(i)| >= threshold`.

```js
const pad = sensors.gamepad();
pad.stream(g => {
  x += g.axis(0) * 5;  // left stick
  y += g.axis(1) * 5;
});
pad.onButton(0, () => draw.bg('cyan'));  // A button
```

---

## Motion / Orientation — `sensors.motion()`

Device accelerometer and gyroscope. iOS 13+ requires permission — see `sensors.requestMotion()`.

```js
const motion = sensors.motion();
```

| Getter | Unit | Description |
|--------|------|-------------|
| `motion.ax/ay/az` | m/s² | Acceleration incl. gravity |
| `motion.gx/gy/gz` | deg/s | Rotation rate |
| `motion.alpha` | 0–360° | Compass heading |
| `motion.beta` | -180–180° | Front-back tilt |
| `motion.gamma` | -90–90° | Left-right tilt |
| `motion.magnitude` | m/s² | `sqrt(ax²+ay²+az²)` |

**`.onShake(threshold?, onEnter, onExit?)`** — fires when `magnitude >= threshold` (default 15 m/s² ≈ hard shake).

**`.onTilt(axis, threshold, onEnter, onExit?)`** — fires when `|motion[axis]| >= threshold`. Axis: `'alpha'` | `'beta'` | `'gamma'` | `'ax'` | `'ay'` | `'az'`.

```js
const motion = sensors.motion();
motion.onShake(20, () => draw.clear().bg('white'));
motion.stream(m => draw.circle(800 + m.gamma * 10, 450 + m.beta * 10, 20, 'cyan'));
```

### iOS 13+ permission

```js
// Must be called from a user gesture (button click, etc.)
const motion = await sensors.requestMotion();
motion.onShake(15, () => audio.kick());
```

---

## Geolocation — `sensors.geo(opts?)`

```js
const geo = sensors.geo();
const geo = sensors.geo({ highAccuracy: true });
```

| Getter | Description |
|--------|-------------|
| `geo.lat` | Latitude (decimal degrees, null until first fix) |
| `geo.lon` | Longitude |
| `geo.altitude` | Meters (null if unavailable) |
| `geo.accuracy` | Meters |
| `geo.speed` | m/s (null if unavailable) |
| `geo.heading` | Degrees from north (null if unavailable) |
| `geo.ready` | True once first fix received |
| `geo.error` | Last error message or null |

```js
const geo = sensors.geo();
geo.stream(g => {
  if (g.ready) draw.text(`${g.lat.toFixed(4)}, ${g.lon.toFixed(4)}`, 50, 50);
});
```

---

## Network — `sensors.network()`

```js
const net = sensors.network();
```

| Getter | Description |
|--------|-------------|
| `net.online` | Bool |
| `net.type` | `'slow-2g'` \| `'2g'` \| `'3g'` \| `'4g'` \| `'wifi'` \| `'ethernet'` \| `'unknown'` \| `'none'` |
| `net.downlink` | Estimated Mbps (null if unavailable) |
| `net.rtt` | Estimated round-trip ms (null if unavailable) |
| `net.saveData` | Bool — user's data-saver preference |

**`.onChange(fn)`** — fires on online/offline or connection type change.

```js
sensors.network().onChange(n => {
  draw.text(n.online ? 'online' : 'offline', 50, 50, { color: n.online ? 'green' : 'red' });
});
```

---

## Battery — `sensors.battery()` (async, Chrome/Edge)

```js
const bat = await sensors.battery();
```

| Getter | Description |
|--------|-------------|
| `bat.level` | 0–1 |
| `bat.charging` | Bool |
| `bat.timeToFull` | Seconds (Infinity if not charging) |
| `bat.timeToEmpty` | Seconds |

**`.onChange(fn)`** — fires on level or charging state change.

```js
const bat = await sensors.battery();
bat.onChange(b => {
  if (b.level < 0.1 && !b.charging) draw.bg('red');
});
```

---

## Examples

### Mouse-driven shader uniform

```js
const shader = new Shader(`
  let d = distance(uv, custom.xy);
  return vec4f(vec3f(1.0 - d * 3.0), 1.0);
`);
shader.start();

const m = sensors.mouse();
m.stream(s => shader.set([s.x, s.y, 0, 0]));
```

### WASD + gamepad movement (combined)

```js
const kb  = sensors.keyboard();
const pad = sensors.gamepad();
let x = 800, y = 450;

setInterval(() => {
  x += (kb.is('d') ? 1 : kb.is('a') ? -1 : 0) * 5 + pad.axis(0) * 6;
  y += (kb.is('s') ? 1 : kb.is('w') ? -1 : 0) * 5 + pad.axis(1) * 6;
  draw.clear().bg('#111').circle(x, y, 20, 'cyan');
}, 16);
```

### Tilt to scroll (mobile)

```js
const shader = new Shader(`
  let scroll = custom.x;
  let uv2 = vec2f(uv.x, fract(uv.y + scroll));
  let col = vec3f(uv2, sin(time));
  return vec4f(col, 1.0);
`);
shader.start();

const m = await sensors.requestMotion();
m.stream(s => shader.set(s.beta / 180));
```
