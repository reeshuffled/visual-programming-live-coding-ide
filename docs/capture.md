# Capture & Record

Take photos or record video from the webcam, or record any output window. Captures are saved to the desktop as persistent icons (stored in IndexedDB) and can optionally be downloaded immediately.

---

## Webcam photo

```js
const cam = await Camera.open();
await cam.photo({ name: 'selfie', download: true });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | `'photo'` | Base filename (`.jpg` appended automatically) |
| `download` | boolean | `false` | Also trigger a browser file download |

Returns a `Promise<Blob>` (JPEG). The photo lands on the desktop as an `image` icon with a thumbnail that survives reload.

---

## Webcam video

```js
const cam = await Camera.open();
const rec = cam.record({ name: 'clip', fps: 30 });
// ... later:
rec.stop(); // → .webm saved to desktop
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | `'clip'` | Base filename (`.webm` appended) |
| `fps` | number | `30` | Recording frame rate |

Returns a `Recording` instance. The video is saved to the desktop as a `video` icon (with a poster-frame thumbnail) when you call `rec.stop()`.

---

## Record an output window

```js
const r = wm.record('win-canvas-1', { fps: 30, name: 'scene' });
// ... later:
wm.stopRecording('win-canvas-1');
// or: r.stop();
```

Works on `canvas`, `shader`, `camera`, `video`, and `image` windows. Multi-layer output windows (e.g. draw + pixi + shader) are automatically composited into a single WebM.

---

## Snapshot an output window

```js
wm.snapshot('win-canvas-1');
wm.snapshot('win-canvas-1', { name: 'hero.png', download: true });
```

Composites the current frame (all canvas layers + any paint overlay) into a PNG icon on the desktop. The `📷` button in the window titlebar does the same thing.

---

## Titlebar buttons

Every `canvas`, `shader`, `camera`, `video`, and `image` window gets two new titlebar buttons automatically:

| Button | Action |
|--------|--------|
| 📷 | Snapshot the window → persistent desktop PNG |
| 🔴 | Start recording → desktop WebM. Toggles to ⏹ while recording. |

Click ⏹ to stop the recording and save it.

---

## Desktop blob persistence

Captured photos and videos are stored in IndexedDB (`vl-captures`) keyed by icon id. This means they survive page reloads. The desktop's localStorage entry stores only a lightweight `blobKey` stub — the raw bytes live in IDB.

Capture icons are **excluded from `.vljson` project files** (IDB blobs don't travel). Use the download option to export captures to the real filesystem.

---

## Download

Add `download: true` to any capture call to also trigger a browser download alongside the desktop icon:

```js
await cam.photo({ name: 'selfie', download: true });
wm.snapshot('win-canvas-1', { download: true });
```

No File System Access API required — uses a standard `<a download>` anchor (works everywhere).

---

## Reset behavior

In-flight recordings are stopped (and finalized) on code reset. The saved `.webm` icon persists; only the recording state clears. Windows survive reset.

---

## API reference

| Method | Description |
|--------|-------------|
| `cam.photo({ name?, download? })` | → `Promise<Blob>` — webcam still |
| `cam.record({ name?, fps? })` | → `Recording` — webcam video |
| `wm.snapshot(winId, { name?, download? })` | Snapshot any visual window to desktop PNG |
| `wm.record(winId, { fps?, name? })` | → `Recording` — record any visual window |
| `wm.stopRecording(winId)` | Stop in-progress recording |
| `rec.stop()` | Stop a `Recording` directly |
| `desktop.addBlob(blob, { name, type, download? })` | Low-level: add any blob to desktop (persistent) |

---

## See also

- [windows.md](windows.md) — `wm.spawn`, window types
- [ADR 016](adr/016-capture-and-recording.md) — design decisions
