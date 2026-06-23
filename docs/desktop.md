# Desktop

Manage file icons on the IDE desktop. Icons can represent local files (images, video, audio, code) or act as launchers for editor windows.

---

## `desktop.add(url, opts?)`

Add a file icon to the desktop.

```js
const icon = desktop.add(url, { name: 'photo.jpg', type: 'image', x: 100, y: 80 });
// → { id, name, type, url }
```

**opts:**

| Option | Default | Description |
|--------|---------|-------------|
| `name` | `'file'` | Display label |
| `type` | auto-detected | `'image'` \| `'video'` \| `'audio'` \| `'code'` \| `'file'` |
| `x` | `80` | Desktop x position (px) |
| `y` | `80` | Desktop y position (px) |

---

## `desktop.remove(id)`

Remove an icon by its id.

```js
desktop.remove(icon.id);
```

---

## `desktop.clear()`

Remove all non-editor file icons.

---

## `desktop.files()`

List all current file icons (excluding editor icons).

```js
const files = desktop.files();
// → [{ id, name, type, url, x, y }, ...]
```

---

## `desktop.onFile(fn)`

Register a callback that fires when the user double-clicks or activates a file icon.

```js
desktop.onFile(({ id, name, type, url }) => {
  if (type === 'image') wm.spawn(name, { type: 'image', src: url });
  if (type === 'video') wm.spawn(name, { type: 'video', src: url });
});
```

Callbacks registered with `onFile` are removed on Stop/Reset.

---

## `desktop.open(id)`

Programmatically activate a file icon (same as double-clicking).

---

## Examples

### Drop a photo onto the desktop then open it in a window

```js
desktop.onFile(({ name, type, url }) => {
  wm.spawn(name, { type, src: url, w: 640, h: 480 });
});
```

### Add a generated image icon

```js
const canvas = getCanvas(0);
const url = canvas.toDataURL();
desktop.add(url, { name: 'snapshot.png', type: 'image' });
```
