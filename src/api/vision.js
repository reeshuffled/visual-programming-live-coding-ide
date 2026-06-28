import {
  FilesetResolver,
  ObjectDetector,
  GestureRecognizer,
  FaceLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { onReset } from '../runtime/reset-registry.js';
import { notify, subscribe } from '../events/index.js';
import { acquireCameraRunScoped } from './media-lease.js';

const WASM_CDN = "https://unpkg.com/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_BASE = "https://storage.googleapis.com/mediapipe-models";

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

const POSE_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],
  [9,10],
  [11,12],[11,13],[13,15],[15,17],[15,19],[17,19],
  [12,14],[14,16],[16,18],[16,20],[18,20],
  [11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],
  [27,29],[28,30],[29,31],[30,32],[27,31],[28,32],
];

function toTurtle(px, py, vw, vh, cw, ch) {
  const cx = (px / vw) * cw - cw / 2;
  const cy = ch / 2 - (py / vh) * ch;
  return { cx, cy };
}

function classifyExpression(blendshapes) {
  if (!blendshapes?.length) return null;
  const bs = {};
  for (const { categoryName, score } of blendshapes[0].categories) {
    bs[categoryName] = score;
  }
  const smile = ((bs.mouthSmileLeft ?? 0) + (bs.mouthSmileRight ?? 0)) / 2;
  const frown = ((bs.mouthFrownLeft ?? 0) + (bs.mouthFrownRight ?? 0)) / 2;
  const jaw = bs.jawOpen ?? 0;
  const brow = bs.browInnerUp ?? 0;
  if (smile > 0.4) return "smile";
  if (brow > 0.5 && jaw > 0.3) return "surprise";
  if (frown > 0.3) return "frown";
  if (jaw > 0.5) return "mouth_open";
  return "neutral";
}

function _defaultCtx() {
  return document.getElementById("turtle")?.getContext("2d") ?? null;
}

function _applyMirror(ctx, mirror) {
  if (mirror === 'auto' ? _cameraFlipped : mirror) {
    ctx.translate(ctx.canvas.width, 0);
    ctx.scale(-1, 1);
  }
}

// Track camera flip state persistently (not run-scoped).
let _cameraFlipped = false;
subscribe('camera:flip', ({ mirrored }) => { _cameraFlipped = !!mirrored; }, { persistent: true });

const _cache = { objects: [], hands: [], face: null, pose: null };

const _gestureHandlers = [];
const _expressionHandlers = [];

let _initPromise = null;
let _ready = false;
let _running = false;
let _rafId = null;
let _cameraLeased = false; // guard: acquire once per run start
let _videoSource = null; // custom source override (video/canvas el)
let _lastDetectionTime = 0;
const DETECTION_INTERVAL_MS = 100;

let _objectDetector = null;
let _gestureRecognizer = null;
let _faceLandmarker = null;

// Pose: lazy init, configurable before first use.
let _poseLandmarker = null;
let _initPosePromise = null;
let _poseConfig = { model: 'lite', numPoses: 1 };

async function _init() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const wasmFileset = await FilesetResolver.forVisionTasks(WASM_CDN);
    [_objectDetector, _gestureRecognizer, _faceLandmarker] = await Promise.all([
      ObjectDetector.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: `${MODEL_BASE}/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        scoreThreshold: 0.5,
      }),
      GestureRecognizer.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: `${MODEL_BASE}/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
      }),
      FaceLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: `${MODEL_BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputFaceBlendshapes: true,
      }),
    ]);
    _ready = true;
  })();
  return _initPromise;
}

async function _initPose() {
  if (_initPosePromise) return _initPosePromise;
  _initPosePromise = (async () => {
    const wasmFileset = await FilesetResolver.forVisionTasks(WASM_CDN);
    const modelName = _poseConfig.model === 'heavy' ? 'pose_landmarker_heavy'
                    : _poseConfig.model === 'full'  ? 'pose_landmarker_full'
                    : 'pose_landmarker_lite';
    _poseLandmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        modelAssetPath: `${MODEL_BASE}/pose_landmarker/${modelName}/float16/1/${modelName}.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: _poseConfig.numPoses ?? 1,
    });
  })();
  return _initPosePromise;
}

function _loop() {
  if (!_running) return;
  _rafId = requestAnimationFrame(_loop);

  const video = _videoSource ?? window.__ar_video;
  if (!video) return;
  if (video instanceof HTMLVideoElement && video.readyState < video.HAVE_CURRENT_DATA) return;

  const now = performance.now();
  if (now - _lastDetectionTime < DETECTION_INTERVAL_MS) return;
  _lastDetectionTime = now;

  const vw = video instanceof HTMLVideoElement ? (video.videoWidth || 600) : (video.width || 600);
  const vh = video instanceof HTMLVideoElement ? (video.videoHeight || 600) : (video.height || 600);
  const canvasEl = document.getElementById("turtle");
  const cw = canvasEl?.width ?? 600;
  const ch = canvasEl?.height ?? 600;

  try {
    if (_objectDetector) {
      const r = _objectDetector.detectForVideo(video, now);
      _cache.objects = (r.detections ?? []).map((d) => {
        const bb = d.boundingBox;
        const px = bb.originX + bb.width / 2;
        const py = bb.originY + bb.height / 2;
        return {
          label: d.categories[0]?.categoryName ?? "unknown",
          confidence: d.categories[0]?.score ?? 0,
          bbox: { x: bb.originX / vw, y: bb.originY / vh, width: bb.width / vw, height: bb.height / vh },
          ...toTurtle(px, py, vw, vh, cw, ch),
        };
      });
      for (const obj of _cache.objects) {
        notify('gesture:object', { label: obj.label, confidence: obj.confidence, bbox: obj.bbox });
      }
    }
  } catch (_) {}

  try {
    if (_gestureRecognizer) {
      const r = _gestureRecognizer.recognizeForVideo(video, now);
      _cache.hands = (r.gestures ?? []).map((g, i) => {
        const lm = r.landmarks?.[i] ?? [];
        let cx = 0, cy = 0;
        if (lm.length) {
          const wrist = lm[0];
          ({ cx, cy } = toTurtle(wrist.x * vw, wrist.y * vh, vw, vh, cw, ch));
        }
        return {
          gesture: g[0]?.categoryName ?? "None",
          confidence: g[0]?.score ?? 0,
          cx,
          cy,
          landmarks: lm,
        };
      });
    }
  } catch (_) {}

  try {
    if (_faceLandmarker) {
      const r = _faceLandmarker.detectForVideo(video, now);
      if (r.faceLandmarks?.length) {
        const lm = r.faceLandmarks[0];
        const avgX = lm.reduce((s, p) => s + p.x, 0) / lm.length;
        const avgY = lm.reduce((s, p) => s + p.y, 0) / lm.length;
        const { cx, cy } = toTurtle(avgX * vw, avgY * vh, vw, vh, cw, ch);
        _cache.face = { expression: classifyExpression(r.faceBlendshapes), cx, cy, landmarks: lm };
        notify('gesture:face', { expression: _cache.face.expression, cx, cy, landmarks: lm });
      } else {
        _cache.face = null;
      }
    }
  } catch (_) {}

  try {
    if (_poseLandmarker) {
      const r = _poseLandmarker.detectForVideo(video, now);
      if (r.landmarks?.length) {
        _cache.pose = { landmarks: r.landmarks[0] };
        notify('gesture:pose', { landmarks: r.landmarks[0] });
      } else {
        _cache.pose = null;
      }
    }
  } catch (_) {}

  // Edge-triggered gesture handlers
  const g = _cache.hands[0]?.gesture;
  const currGesture = !g || g === "None" ? null : g;
  for (const h of _gestureHandlers) {
    const active = currGesture === h.gesture;
    if (active && !h.prev) {
      notify('gesture:detected', { type: currGesture, hand: _cache.hands[0], confidence: _cache.hands[0]?.confidence ?? 0 });
      h.fn();
    }
    h.prev = active;
  }

  // Edge-triggered expression handlers
  const currExpr = _cache.face?.expression ?? null;
  for (const h of _expressionHandlers) {
    const active = currExpr === h.expr;
    if (active && !h.prev) {
      const face = _cache.face;
      if (currExpr === 'smile') {
        notify('gesture:smile', { confidence: face?.confidence ?? 0, cx: face?.cx ?? 0, cy: face?.cy ?? 0 });
      }
      notify('gesture:expression', { expression: currExpr, confidence: face?.confidence ?? 0, cx: face?.cx ?? 0, cy: face?.cy ?? 0 });
      h.fn();
    }
    h.prev = active;
  }
}

function _ensureStarted() {
  if (_running) return;
  if (!_cameraLeased && !_videoSource) { acquireCameraRunScoped(); _cameraLeased = true; }
  _running = true;
  if (_ready) {
    _loop();
  } else {
    _init().then(() => { if (_running) _loop(); });
  }
}

function _ensurePoseStarted() {
  _ensureStarted();
  if (!_poseLandmarker && !_initPosePromise) {
    _initPose();
  }
}

export function preloadVision() {
  _init();
}

export function stopVision() {
  _running = false;
  _cameraLeased = false; // allow re-acquire on next run
  _videoSource = null;
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  _cache.objects = [];
  _cache.hands = [];
  _cache.face = null;
  _cache.pose = null;
  _lastDetectionTime = 0;
  _gestureHandlers.length = 0;
  _expressionHandlers.length = 0;
}

export const vision = {
  configure(opts = {}) {
    if (opts.pose && !_initPosePromise) {
      Object.assign(_poseConfig, opts.pose);
    }
    return this;
  },

  // Use a custom HTMLVideoElement or HTMLCanvasElement instead of the webcam.
  // Pass null to revert to webcam. Must be called before other vision methods.
  source(el) {
    _videoSource = el ?? null;
    _ensureStarted();
    return this;
  },

  objects() { _ensureStarted(); return _cache.objects; },
  nearest(label) {
    _ensureStarted();
    const list = label ? _cache.objects.filter((o) => o.label === label) : _cache.objects;
    if (!list.length) return null;
    return list.reduce((best, o) => (o.confidence > best.confidence ? o : best));
  },
  all(label)   { _ensureStarted(); return _cache.objects.filter((o) => o.label === label); },
  count(label) { _ensureStarted(); return _cache.objects.filter((o) => o.label === label).length; },
  any(label)   { _ensureStarted(); return _cache.objects.some((o) => o.label === label); },

  hands()    { _ensureStarted(); return _cache.hands; },
  gesture()  {
    _ensureStarted();
    if (!_cache.hands.length) return null;
    const g = _cache.hands[0].gesture;
    return g === "None" ? null : g;
  },

  face()       { _ensureStarted(); return _cache.face; },
  expression() { _ensureStarted(); return _cache.face?.expression ?? null; },

  pose() { _ensurePoseStarted(); return _cache.pose; },

  onGesture(gesture, fn) {
    _ensureStarted();
    _gestureHandlers.push({ gesture, fn, prev: false });
    return this;
  },
  onExpression(expr, fn) {
    _ensureStarted();
    _expressionHandlers.push({ expr, fn, prev: false });
    return this;
  },

  drawBoxes(ctx, { color = 'lime', font = '14px sans-serif', lineWidth = 2, mirror = 'auto' } = {}) {
    _ensureStarted();
    if (!ctx) ctx = _defaultCtx();
    if (!ctx) return;
    const { width: cw, height: ch } = ctx.canvas;
    ctx.save();
    _applyMirror(ctx, mirror);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.lineWidth = lineWidth;
    for (const obj of _cache.objects) {
      const { bbox } = obj;
      if (!bbox) continue;
      const x = bbox.x * cw, y = bbox.y * ch, w = bbox.width * cw, h = bbox.height * ch;
      ctx.strokeRect(x, y, w, h);
      ctx.fillText(`${obj.label} ${(obj.confidence * 100).toFixed(0)}%`, x + 2, y - 4);
    }
    ctx.restore();
  },

  drawFace(ctx, { color = 'cyan', pointSize = 1.5, mirror = 'auto' } = {}) {
    _ensureStarted();
    if (!ctx) ctx = _defaultCtx();
    if (!ctx || !_cache.face) return;
    const { width: cw, height: ch } = ctx.canvas;
    ctx.save();
    _applyMirror(ctx, mirror);
    ctx.fillStyle = color;
    for (const lm of _cache.face.landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * cw, lm.y * ch, pointSize, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  drawHands(ctx, { color = 'yellow', lineWidth = 2, pointSize = 4, mirror = 'auto' } = {}) {
    _ensureStarted();
    if (!ctx) ctx = _defaultCtx();
    if (!ctx || !_cache.hands.length) return;
    const { width: cw, height: ch } = ctx.canvas;
    ctx.save();
    _applyMirror(ctx, mirror);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    for (const hand of _cache.hands) {
      const lm = hand.landmarks;
      if (!lm?.length) continue;
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(lm[a].x * cw, lm[a].y * ch);
        ctx.lineTo(lm[b].x * cw, lm[b].y * ch);
        ctx.stroke();
      }
      for (const p of lm) {
        ctx.beginPath();
        ctx.arc(p.x * cw, p.y * ch, pointSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  drawPose(ctx, { color = 'magenta', lineWidth = 2, pointSize = 4, minVisibility = 0.5, mirror = 'auto' } = {}) {
    _ensurePoseStarted();
    if (!ctx) ctx = _defaultCtx();
    if (!ctx || !_cache.pose) return;
    const { width: cw, height: ch } = ctx.canvas;
    const lm = _cache.pose.landmarks;
    ctx.save();
    _applyMirror(ctx, mirror);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    for (const [a, b] of POSE_CONNECTIONS) {
      if ((lm[a].visibility ?? 1) < minVisibility || (lm[b].visibility ?? 1) < minVisibility) continue;
      ctx.beginPath();
      ctx.moveTo(lm[a].x * cw, lm[a].y * ch);
      ctx.lineTo(lm[b].x * cw, lm[b].y * ch);
      ctx.stroke();
    }
    for (const p of lm) {
      if ((p.visibility ?? 1) < minVisibility) continue;
      ctx.beginPath();
      ctx.arc(p.x * cw, p.y * ch, pointSize, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
};

onReset(stopVision);
