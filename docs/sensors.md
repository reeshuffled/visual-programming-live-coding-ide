# Sensors & Device Input

Device sensors are bus events. Subscribe with `on(event)` or poll with `hold(event)`. Sources are **lazy** — the underlying OS watch/RAF loop starts on the first subscriber and stops when the last one leaves. No polling when nothing is listening.

See also [control.md](control.md) for keyboard, mouse, `tick()`, and `hold()`. See [serial.md](serial.md) for WebSerial GPIO (Arduino/ESP32/Pico).

---

## Gamepad — `sensor:gamepad`

Connect a gamepad first (press any button to activate the browser's Gamepad API).

```js
on('sensor:gamepad').do(({ index, axes, buttons, pressed }) => {
  if (index !== 0) return;            // first controller
  const x = axes[0];                  // left stick X  -1..1
  const y = axes[1];                  // left stick Y
  draw.clear().bg('#111');
  draw.circle(800 + x * 300, 450 + y * 300, 30, 'white');
  if (pressed[0]) draw.bg('#222');    // A / Cross button
});
```

Payload: `{ index, axes[], buttons[], pressed[] }`.  
Standard button mapping: `pressed[0]`=A/Cross, `[1]`=B/Circle, `[2]`=X/Square, `[3]`=Y/Triangle, `[4]`=LB, `[5]`=RB.

---

## Motion / Orientation — `sensor:motion`, `sensor:shake`

Device accelerometer and gyroscope. **iOS 13+**: requires a user gesture before the source can start — wrap `emit('haptics:tap', {})` or a button click before subscribing.

```js
on('sensor:motion').do(({ ax, ay, az, alpha, beta, gamma, magnitude }) => {
  draw.clear().bg('#111');
  draw.circle(800 + gamma * 6, 450 - beta * 6, 20, 'cyan');
});
```

Payload:

| Field | Unit | Description |
|-------|------|-------------|
| `ax/ay/az` | m/s² | Acceleration incl. gravity |
| `alpha` | 0–360° | Compass heading |
| `beta` | -180–180° | Front-back tilt |
| `gamma` | -90–90° | Left-right tilt |
| `magnitude` | m/s² | `sqrt(ax²+ay²+az²)` |

`sensor:shake` fires alongside `sensor:motion` when `magnitude` is high:

```js
on('sensor:shake').when(d => d.magnitude > 20).do(() => {
  draw.clear().bg(Color.random());
});
```

---

## Geolocation — `sensor:geo`

```js
on('sensor:geo').do(({ lat, lon, accuracy, speed, heading }) => {
  console.log(`${lat.toFixed(5)}, ${lon.toFixed(5)} ±${accuracy|0}m`);
});
// Browser asks for permission on first subscriber (source starts watchPosition).
```

Payload: `{ lat, lon, altitude, accuracy, speed, heading }`.

---

## Battery — `sensor:battery`

Chrome/Edge only. Returns stub on unsupported browsers.

```js
on('sensor:battery').do(({ level, charging }) => {
  if (level < 0.1 && !charging) draw.bg('red');
});
```

Payload: `{ level (0–1), charging }`.

---

## Network — `sensor:network`

```js
on('sensor:network').do(({ online, type, downlink, rtt }) => {
  console.log(online ? `online (${type}, ${downlink}Mbps)` : 'offline');
});
```

Payload: `{ online, type, downlink, rtt }`. `type`: `'4g'` | `'3g'` | `'wifi'` | `'ethernet'` | `'unknown'`. Chrome/Edge only for type/downlink/rtt.

---

## Haptics

Haptics are **commandable** bus events — `emit()` actuates `navigator.vibrate()`. Mobile devices + some controllers.

```js
emit('haptics:vibrate', { pattern: 200 });          // 200ms
emit('haptics:vibrate', { pattern: [200, 100, 200] }); // on/off/on pattern
emit('haptics:tap', {});                             // 40ms tap
emit('haptics:buzz', { ms: 500 });                  // 500ms
emit('haptics:stop', {});                           // stop
```

---

## Polling with `hold()`

`hold(event)` returns a persistent live-state object for any sensor event. Always current, no need to subscribe and track manually.

```js
const motion = hold('sensor:motion');

tick(16).do(() => {
  const tilt = motion.gamma ?? 0;   // null until first reading
  draw.clear().bg('#111');
  draw.circle(800 + tilt * 6, 450, 20, 'cyan');
});
```

---

## Examples

### Mouse-driven shader (hold)

```js
const mouse = hold('window:mouse:move');
const shader = new Shader(({ uv, custom }) => {
  const d = distance(uv, custom.xy);
  return vec4f(vec3f(1.0 - d * 3.0), 1.0);
});
shader.start();
tick(16).do(() => shader.set([mouse.x / draw.width, mouse.y / draw.height, 0, 0]));
```

### WASD + gamepad combined

```js
const keys = hold('window:key:down');
let x = 800, y = 450, padX = 0, padY = 0;

on('sensor:gamepad').when(d => d.index === 0).do(({ axes }) => {
  padX = axes[0]; padY = axes[1];
});

tick(16).do(() => {
  x += (keys.has('d') ? 5 : keys.has('a') ? -5 : 0) + padX * 6;
  y += (keys.has('s') ? 5 : keys.has('w') ? -5 : 0) + padY * 6;
  draw.clear().bg('#111');
  draw.circle(x, y, 20, 'cyan');
});
```

### Tilt scroll (mobile)

```js
const shader = new Shader(`
  let scroll = custom.x;
  let uv2 = vec2f(uv.x, fract(uv.y + scroll));
  return vec4f(vec3f(uv2, sin(time)), 1.0);
`);
shader.start();

on('sensor:motion').do(({ beta }) => shader.set([beta / 180, 0, 0, 0]));
```
