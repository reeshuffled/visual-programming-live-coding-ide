# ADR 034 — Gaze Estimation (blendshape direction + calibrated screen point)

**Status:** Accepted
**Date:** 2026-06-28
**Relates to:** ADR 021 (vision draw helpers & pose), ADR 025 (cross-domain signal chain)

## Context

`vision` already runs `FaceLandmarker` with `outputFaceBlendshapes: true` and stores the full
478-point landmark array (iris points 468–477 included). Two latent capabilities fall out of
data we already compute:

1. **Gaze direction** — the `eyeLook{In,Out,Up,Down}{Left,Right}` blendshapes give head-relative
   eye direction for free, every frame.
2. **Screen-point gaze** — where on the display the user is looking — which creatives want for
   "look at this object" interactions.

The hard reality that shapes everything below: a browser **cannot obtain the camera↔screen
geometry** (camera offset, screen physical size, FOV/intrinsics). So a head-pose gaze *ray* lives
in camera space and cannot be intersected with the screen plane in pixels by geometry alone.

## Decisions

### 1. New `gaze:*` event prefix — a deliberate deviation from ADR 021 #7

ADR 021 #7 ruled that the `gesture:` prefix covers all vision perception outputs. Gaze breaks that
on purpose. The `gesture:*` outputs (`face`/`pose`/`object`) are **discrete detections** — a thing
is present or absent. Gaze is a **continuous scalar stream** intended to drive `route()`, shaders,
and audio every frame, categorically closer to `sensor:*` than to a recognised gesture. The prefix
marks a different *kind* of output. The discrete eye events (`gaze:blink`/`gaze:wink`/`gaze:look`/
`gaze:enter`/`gaze:leave`) ride the same prefix because they share the eye data source — only
`gaze:move` is truly continuous, but grouping the whole eye subsystem under one prefix beats
splitting it.

### 2. Two-tier data on one object (progressive enhancement)

`vision.gaze()` always returns `{ x, y, dir, blink, leftClosed, rightClosed, vx, vy }`. The
blendshape-derived fields (`x`/`y` direction in −1..1, `dir` zone, `blink`, eye-closed/wink) work
immediately with **no calibration**. `vx`/`vy` (viewport pixels) are `null` until calibrated.
`vision.calibrated` (boolean) tells which tier is live. One mental model, not two methods.

### 3. Screen point requires mandatory calibration (head pose stabilises, it does not map)

Because camera↔screen geometry is unobtainable, `vx`/`vy` come from a **calibration regression**:
the user looks at on-screen dots and we fit `eye features → viewport px`. We enable
`outputFacialTransformationMatrixes` and use head pose to make the iris features **head-stable**
(robustness to head movement), but head pose does **not** produce the pixel mapping — calibration
does. Calibration is therefore mandatory, not a refinement.

### 4. Coordinate surface: viewport pixels, converted per-canvas at read

`vx`/`vy` are **browser viewport pixels** — the physical thing the eye actually looked at — so they
survive Output Window move/resize. `vision.gazeIn(elementOrCanvas)` converts to element-local
coordinates via `getBoundingClientRect()` at read time. We deliberately did **not** express gaze in
ADR 021's normalized [0,1] draw space or turtle `cx/cy` data space: both are canvas-relative and
would silently break the moment a window moves after a screen-fixed calibration.

### 5. Two calibration entry points, one routine

A gaze/eye **chip** (zero-code, matching the MIDI Target and camera-button house style) and
`await vision.calibrate({ points })` (reproducible from a sketch) both funnel into one
`_runCalibration()` that renders a fullscreen dot overlay and resolves when done.

### 6. Persistence: device-keyed localStorage, never in a project

Calibration is bound to one person + camera + screen. Stored in `localStorage['vl_gaze_calib']`
keyed by `cameraDeviceId@WxH`, **excluded from `.vljson`** (consistent with mic permissions and IDB
capture blobs — `serializeDesktop({forProject:true})` skips device-local state). On load, a
device/resolution-key mismatch silently sets `calibrated=false`; the user re-clicks the chip. The
calibration model survives reload but is not a run artifact.

### 7. Route bridge: `Source.gaze` with `.x/.y` and `.vx/.vy`; null trap closed by hold-and-warn

`Source.gaze` is a new route source (the first vision→route bridge). `.x/.y` bridge the
calibration-free direction; `.vx/.vy` bridge the screen point. To avoid a route silently emitting
`null` before calibration, the `vx/vy` bridge **holds the last valid pixel value, defaulting to 0**,
and `console.warn`s **once** ("gaze.vx routed but not calibrated"); `signalGraph` shows the gaze
source as uncalibrated. No `null` ever reaches a sink.

### 8. Region gaze: `onGaze(el|rect, fn)` + `gaze:enter`/`gaze:leave`

`vision.onGaze` is polymorphic: a direction string (`'left'`, `'center'`, …) registers a
calibration-free direction handler; a DOM element / canvas or `{x,y,w,h}` viewport rect registers an
edge-triggered region handler firing on gaze-enter, emitting `gaze:enter`/`gaze:leave {target}`.
Region handlers need calibration (they read `vx/vy`); uncalibrated, they no-op with the same
warn-once. `onBlink(fn)` / `onWink(eye, fn)` round out the handler set. All gaze handlers clear in
`stopVision()` like the existing `onGesture`/`onExpression` handlers.

### 9. No new model; one new model option

Iris points are already in the 478-landmark output. The only model-config change is enabling
`outputFacialTransformationMatrixes` on the existing `FaceLandmarker`. Like ADR 021's pose config,
this is **first-run-wins** — set before the first vision call; changing it requires a page refresh.

## Consequences

**Good:**
- Direction, blink, and wink ship with zero calibration and zero extra compute (blendshapes already
  computed); only screen-point gaze pays the calibration cost.
- `vx/vy` in viewport space survive window move/resize; `gazeIn()` localises on demand.
- First vision subsystem to feed `route()` — gaze becomes a continuous signal source for shaders/audio.
- Calibration state is device-local and honest about its person/camera/screen binding.

**Trade-offs:**
- A second event-namespace convention (`gaze:*` alongside `gesture:*`) now exists in vision; this ADR
  is the record of why, so it is not "fixed" back to `gesture:gaze`.
- Screen-point gaze is calibrated-regression accuracy, not eye-tracker grade; it degrades with large
  head movement despite head-pose stabilisation, and a device/resolution change silently invalidates it.
- The `gaze()` object carries mixed-availability fields (direction always, `vx/vy` conditional) —
  callers must check `vision.calibrated` before trusting `vx/vy`.
