# CONTEXT.md — Visual Live Coding IDE

## Glossary

### Editor Instance
A self-contained authoring unit. Comprises an **Editor Window** and a paired **Output Window**. Created together via the "+" toolbar button, closed together via confirmation. Identified by a stable numeric ID (1, 2, 3…).

### Editor Window
The floating window that holds the code area (text or blocks), mode toggle, play/pause/stop controls, and embedded console. Each Editor Window belongs to exactly one Editor Instance. Cannot be closed without confirmation; can be minimized to the Taskbar.

### Output Window
The canvas display window paired with an Editor Instance. Renders only the visual output of its paired editor's running code. Can be closed independently (no effect on the Editor Window or running code). Automatically spawned when an Editor Instance is created.

### Embedded Console
A collapsible log panel inside the Editor Window. Receives `console.log`/`console.error` output only from that Editor Instance's running code. Can be "popped off" into an independent floating window that remains connected to the same editor's output stream.

### Taskbar
A dock bar that appears at the bottom of the desktop when at least one Editor Window is minimized. Each minimized editor is represented as a chip showing its title and run-state indicator. Disappears when no editors are minimized.

### Minimized Editor
An Editor Instance whose Editor Window has been collapsed to the Taskbar. Code and execution state are preserved. Restored by clicking the chip in the Taskbar.

### Run State
The execution state of a single Editor Instance: `idle`, `running`, `paused`, or `stopped`. Independent per instance — pausing Editor 2 has no effect on Editor 1.

### Shared Globals
APIs that live on `window` and are accessible from all Editor Instances simultaneously: `Shader`, `ShaderFX`, `audio`, `vision`, `Camera`, `Media`, `wm`, `Color`, `onKey`, `randUni`. A shader created in Editor 1 can be referenced in Editor 2.

### Per-Editor Locals
APIs injected as locals into each Editor Instance's IIFE at execution time, scoping them to that instance's canvas stack: `draw`, `getCanvas`, `getLayer`, `getDraw`, `setInterval`, `clearInterval`, `setTimeout`, `clearTimeout`, `console`. These shadow any global with the same name inside the user's IIFE. The set is enumerated **once** in the `PER_EDITOR_LOCALS` table (`src/editor/editor-instance.js`): `_setupGlobals` creates each on `window[__ar_e{id}_<name>]` and `editorPreamble` aliases each back to a `const`, both deriving from the table so the two halves can't drift. Run-control sugar (`stop`/`stopRunning`/`pause`/`resume`) is *not* a Per-Editor Local — it has no window-global side and stays inline in `editorPreamble`.

### IIFE Isolation
The execution strategy used to scope per-editor APIs. Each editor's `execute()` injects **Per-Editor Locals** as named variables in the IIFE wrapper before user code runs. Callbacks and timers capture these locals via closure. Globals (`Shared Globals`) remain on `window` and are unaffected.

### Creative Widget
One of the in-app authoring tools that spawns its own WM window: Paint, SpriteEditor, AsciiEditor, Drumpad, Piano. They share a **chassis** (`src/api/widget-shell.js`): `mountWidgetShell` owns the window, body styling, debounced autosave to a desktop icon, undo/redo wiring, and lifecycle; `buildFrameStrip`/`buildTransport` build the animation UI over a FrameController. Each widget supplies only its own canvas, tools, and export logic (composition, not a base class — see ADR 007).

### FrameDoc
The DOM-free animation frame model (`src/api/frame-doc.js`): an ordered list of opaque frames + a current index + transport (play/stop/fps) + onion-skin flag. Element-agnostic — Paint frames are canvases, AsciiEditor frames are cell arrays — via `createBlank`/`copyFrame`/`clearFrame`/`drawThumb` hooks. It is one implementation of the **FrameController** interface that the shared frame-strip/transport UI consumes; `SpriteFrameAdapter` (wrapping the public `Sprite` class) is the other.

### Active Editor
The Editor Instance that most recently ran (tracked as `window.__ar_active_editor_id`). The **Active Editor seam** (`src/editor/active-editor.js`) is the one place that inserts generated code into it — `insertSnippet(code)` appends at the document end, places the cursor, focuses, and falls back to the clipboard when no editor is active. Creative-widget export buttons call it instead of poking CodeMirror's `dispatch` directly.

### Drawable Source
Any object the visual APIs can treat as a frame source: a `Layer`, a `CameraStream`, a bare `<video>`/`<canvas>`, or a `GLShader`/`Shader` instance. **Resolving** a Drawable Source means reducing it to the underlying `canvas` or `video` element. The sync resolver (`resolveDrawable`) handles these object forms only; string forms (`'camera'`, image URLs) are a separate async concern layered on by `draw.backdrop` (see ADR 006).

### Editor Persistence
Each Editor Instance saves its code to `localStorage` under key `vl-ide-code-{id}`. A manifest key `vl-ide-editors` holds the ordered list of active editor IDs. On page load all editors in the manifest are recreated with their saved code.

### Execution Trail
A live line-highlight overlay in the code editor showing which statements are currently executing. Implemented as CM6 `Decoration` entries added on each `__ar_trace(line)` call and removed after 800 ms. Lines executing at high frequency (e.g. inside `tick()`) glow permanently while active; one-shot lines flash and fade. Auto-on by default; toggled per Editor Instance via a button in the console label row. State persisted as `vl-trace-{id}`. See ADR 019.

### AST Transform Pipeline
The code-transformation stage applied to user code before injection. One Esprima parse; multiple registered visitors applied in order. `live-patch.js` hosts the pipeline (`transformCode(code, visitors)`). Current visitors: loop-protection (always), trace injection (when Execution Trail is enabled). Visitors see original source positions so line numbers are always accurate.

### Event Stream Panel
A floating WM window that shows a live rate-limited feed of bus events during a run. One row per unique event name; repeat fires within 200 ms increment a counter badge (`×N`) rather than spawning new rows. Rows are expandable to show full payload (depth-2 JSON tree). Default filter excludes harness-internal prefixes (`editor:`, `session:`, `wm:`). Implemented via a bus tap (`addBusTap`) — not a run-scoped subscription. See ADR 019.
