# ADR 021 — Vision Draw Helpers, PoseLandmarker, and bbox Fix

**Status:** Accepted  
**Date:** 2026-06-26

## Context

`vision` exposes perception data (objects, hands, face, gesture) as pure JS objects. Drawing
overlays — bounding boxes, face meshes, hand skeletons — requires ~20 lines of canvas math
per type. Three gaps exist:

1. **bbox bug**: `_cache.objects` never stores bbox coordinates. `notify('gesture:object', { bbox: obj.bbox })` emits `undefined`. `drawBoxes` is impossible without a fix.
2. **No draw helpers**: users must hand-roll all overlay rendering.
3. **No body pose**: MediaPipe `PoseLandmarker` (33-point body skeleton) is not loaded.

## Decisions

### 1. Draw methods live on the `vision` object

`audio.viz()` sets the precedent: perception/audio modules own their own rendering helpers
in this codebase. Convenience beats separation-of-concerns for a live creative-coding context.
Data access methods remain unchanged alongside new `drawBoxes / drawFace / drawHands / drawPose`.

### 2. Coordinate system: normalized [0,1] → canvas pixel

All draw helpers use the same projection: `x * ctx.canvas.width`, `y * ctx.canvas.height`.
MediaPipe face/hand/pose landmarks are already normalized [0,1]. The bbox fix (below)
normalizes object boxes to match. This makes all four helpers consistent and removes any
dependency on video resolution at draw time.

Turtle coords (`cx`/`cy`) are NOT used for drawing — they remain the data API's coordinate
system for positioning objects in turtle-space programs.

### 3. bbox stored as normalized [0,1]

`originX / videoWidth`, `originY / videoHeight`, `width / videoWidth`, `height / videoHeight`.
Consistent with landmark coord system. Fixes the undefined-bbox bug on `gesture:object` notify.
Objects now carry: `{ label, confidence, bbox: {x,y,width,height}, cx, cy }`.

### 4. Mirror: auto by default

Camera feed is CSS-mirrored (`transform: scaleX(-1)` on the video element) but MediaPipe
reads raw unflipped video. Landmarks are always in unflipped space.

`vision.js` subscribes to `camera:flip` on module load and caches the current flip state.
Draw helpers default to `{ mirror: 'auto' }` — they apply `ctx.scale(-1,1)` + translate
when the camera is currently flipped. Opt out with `{ mirror: false }`.

### 5. PoseLandmarker: lazy, lite, configurable

PoseLandmarker is NOT loaded in the parallel `_init()` alongside the three existing models.
It lazy-loads on first call to `vision.pose()` or `vision.drawPose()` via its own
`_initPosePromise`. This avoids paying the model-load cost for sketches that don't use pose.

Default: `pose_landmarker_lite` (fastest), `numPoses: 1`. Configurable via:

```js
vision.configure({ pose: { model: 'full', numPoses: 2 } })
```

`vision.configure()` must be called before the first `vision.pose()` / `vision.drawPose()` —
**first-run-wins**: once the model is loaded it is not torn down on reset (models survive
resets; only cache + handlers are cleared). Changing model config requires a page refresh.

### 6. HandLandmarker: no new model

`GestureRecognizer` already runs hand landmark detection internally and exposes 21-point
landmarks per hand in `_cache.hands[i].landmarks`. Adding a separate `HandLandmarker` model
would run two hand-detection pipelines simultaneously for no user-visible gain. `drawHands()`
draws from `_cache.hands` landmarks directly.

### 7. Pose bus event: `gesture:pose`

Consistent with `gesture:face`, `gesture:object`, `gesture:detected`. The `gesture:` prefix
covers all vision perception outputs — renaming would split the namespace mid-subsystem.
Fires each detection cycle when at least one pose is found.

## Consequences

**Good:**
- One-liner overlays: `tick(() => vision.drawPose())` — no coordinate math in user code
- Consistent normalized coordinate system across all four draw helpers
- Lazy PoseLandmarker: existing sketches pay no extra init cost
- Auto-mirror means overlays match what user sees by default
- bbox bug fixed; `gesture:object` payload now carries real coordinates

**Trade-offs:**
- `vision.configure()` must precede first vision call; late config is silently ignored
  (first-run-wins; page refresh required to change model)
- Auto-mirror requires vision.js to track camera flip state via bus subscription
  (persistent, not run-scoped — same lifetime as the camera:flip event itself)
- Mixed coordinate systems on the object shape (`cx`/`cy` in turtle-space, `bbox` in
  normalized [0,1]) — two systems on one object, but they serve different consumers
