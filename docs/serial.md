# WebSerial & GPIO

Talk to physical microcontrollers (Arduino, ESP32, Raspberry Pi Pico, Teensy) via USB. Chrome/Edge only.

All interaction is via the event bus — no `window` API. Events appear in the **Event Stream Panel** (`monitor`) automatically.

---

## Connect

`serial:connect` requires a **user gesture** (button click). Wire it to a WM button:

```js
const btn = wm.spawn('Serial', {
  html: '<button id="b" style="margin:16px;font-size:18px">Connect USB</button>',
});
document.getElementById(btn)?.querySelector('#b')?.addEventListener('click', () => {
  emit('serial:connect', { baudRate: 115200 });
});

on('serial:status').do(({ connected, port }) => {
  console.log(connected ? `connected (vendor ${port?.vendorId})` : 'disconnected');
});
```

Options for `serial:connect`:

| Option | Default | Description |
|--------|---------|-------------|
| `baudRate` | `115200` | Must match Arduino `Serial.begin(baudRate)` |
| `parse` | `PIN:VALUE\n` splitter | `line => { pin, value } \| null` |
| `serialize` | `` `${pin}:${value}\n` `` | `{ pin, value } => string` |
| `mode` | `'text'` | `'text'` (line-buffered) or `'binary'` (raw chunks) |

**Port survives resets** — connect once, keep it across code runs. Disconnect only with `serial:disconnect` or page close.

---

## Reading — `sensor:serial:data`

Always fires with the raw line, regardless of parse result:

```js
on('sensor:serial:data').do(({ line }) => {
  console.log('raw:', line);
});
```

---

## GPIO pin read — `gpio:pin`

Fires when `parse(line)` returns non-null. Default parse handles `PIN:VALUE\n`:

```js
on('gpio:pin').do(({ pin, value }) => {
  if (pin === 0) draw.bg(`hsl(${value / 4}, 80%, 50%)`);  // analog A0 → color
  if (pin === 2) console.log('button:', value ? 'pressed' : 'released');
});
```

Both `sensor:serial:data` and `gpio:pin` fire for matching lines — use raw events for debugging when `gpio:pin` is silent.

---

## GPIO pin write — `gpio:write`

```js
emit('gpio:write', { pin: 13, value: 1 });  // HIGH
emit('gpio:write', { pin: 13, value: 0 });  // LOW
```

Uses the `serialize` function (default: `"13:1\n"`). Raw write: `emit('serial:write', { data: 'RESET\n' })`.

---

## Disconnect + status

```js
emit('serial:disconnect', {});

// Live state:
hold('serial:status').connected  // true | false
```

---

## Custom protocol

Override `parse` and `serialize` together:

```js
// JSON lines: {"p":13,"v":512}
emit('serial:connect', {
  baudRate: 115200,
  parse: line => {
    try { const { p, v } = JSON.parse(line); return { pin: p, value: v }; }
    catch { return null; }
  },
  serialize: ({ pin, value }) => JSON.stringify({ p: pin, v: value }) + '\n',
});
```

---

## Binary mode

```js
emit('serial:connect', { baudRate: 115200, mode: 'binary' });

on('sensor:serial:data').do(({ bytes }) => {
  // bytes is Uint8Array — parse your protocol here
  console.log(bytes[0], bytes[1]);
});
```

`gpio:pin` never fires in binary mode.

---

## Arduino GPIO Bridge sketch

Upload to Arduino. Compatible with the default `parse`/`serialize`:

```cpp
void setup() {
  Serial.begin(115200);
  for (int i = 2; i <= 7; i++) pinMode(i, OUTPUT);
}

void loop() {
  // Send analog reads as "PIN:VALUE\n"
  for (int i = 0; i <= 5; i++) {
    Serial.println(String(i) + ":" + String(analogRead(i)));
  }

  // Receive gpio:write commands "PIN:VALUE\n"
  while (Serial.available()) {
    String s = Serial.readStringUntil('\n');
    int colon = s.indexOf(':');
    if (colon > 0) {
      int pin = s.substring(0, colon).toInt();
      int val = s.substring(colon + 1).toInt();
      digitalWrite(pin, val ? HIGH : LOW);
    }
  }

  delay(50);
}
```

---

## Event reference

| Event | Direction | Payload |
|-------|-----------|---------|
| `serial:connect` | commandable | `{ baudRate?, parse?, serialize?, mode? }` |
| `serial:disconnect` | commandable | `{}` |
| `serial:write` | commandable | `{ data }` |
| `gpio:write` | commandable | `{ pin, value }` |
| `serial:status` | notify | `{ connected, port: { vendorId, productId } }` |
| `sensor:serial:data` | notify | `{ line }` or `{ bytes }` |
| `gpio:pin` | notify | `{ pin, value }` |

## Supported hardware

Works with any board that exposes a USB-serial bridge: Arduino Uno/Nano/Mega, ESP32, ESP8266, Raspberry Pi Pico, Teensy, BBC micro:bit. Chrome/Edge only — same restriction as WebUSB but broader hardware support.
