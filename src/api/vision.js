import {
  FilesetResolver,
  ObjectDetector,
  GestureRecognizer,
  FaceLandmarker,
} from "@mediapipe/tasks-vision";

const WASM_CDN = "https://unpkg.com/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_BASE = "https://storage.googleapis.com/mediapipe-models";

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

const _cache = { objects: [], hands: [], face: null };

const _gestureHandlers = []; // [{gesture, fn, prev}]
const _expressionHandlers = []; // [{expr, fn, prev}]

let _initPromise = null;
let _ready = false;
let _running = false;
let _rafId = null;
let _lastDetectionTime = 0;
const DETECTION_INTERVAL_MS = 100; // ~10fps

let _objectDetector = null;
let _gestureRecognizer = null;
let _faceLandmarker = null;

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

function _loop() {
  if (!_running) return;
  _rafId = requestAnimationFrame(_loop);

  const video = window.__ar_video;
  if (!video || video.readyState < video.HAVE_CURRENT_DATA) return;

  const now = performance.now();
  if (now - _lastDetectionTime < DETECTION_INTERVAL_MS) return;
  _lastDetectionTime = now;

  const vw = video.videoWidth || 600;
  const vh = video.videoHeight || 600;
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
          ...toTurtle(px, py, vw, vh, cw, ch),
        };
      });
    }
  } catch (_) {
    /* GPU/stream hiccup — keep last result */
  }

  try {
    if (_gestureRecognizer) {
      const r = _gestureRecognizer.recognizeForVideo(video, now);
      _cache.hands = (r.gestures ?? []).map((g, i) => {
        const lm = r.landmarks?.[i] ?? [];
        let cx = 0,
          cy = 0;
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
        _cache.face = {
          expression: classifyExpression(r.faceBlendshapes),
          cx,
          cy,
          landmarks: lm,
        };
      } else {
        _cache.face = null;
      }
    }
  } catch (_) {}

  // Edge-triggered gesture handlers
  const g = _cache.hands[0]?.gesture;
  const currGesture = !g || g === "None" ? null : g;
  for (const h of _gestureHandlers) {
    const active = currGesture === h.gesture;
    if (active && !h.prev) h.fn();
    h.prev = active;
  }

  // Edge-triggered expression handlers
  const currExpr = _cache.face?.expression ?? null;
  for (const h of _expressionHandlers) {
    const active = currExpr === h.expr;
    if (active && !h.prev) h.fn();
    h.prev = active;
  }
}

function _ensureStarted() {
  if (_running) return;
  _running = true;
  if (_ready) {
    _loop();
  } else {
    _init().then(() => {
      if (_running) _loop();
    });
  }
}

export function preloadVision() {
  _init();
}

export function stopVision() {
  _running = false;
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  _cache.objects = [];
  _cache.hands = [];
  _cache.face = null;
  _lastDetectionTime = 0;
  _gestureHandlers.length = 0;
  _expressionHandlers.length = 0;
}

export const vision = {
  objects() {
    _ensureStarted();
    return _cache.objects;
  },
  nearest(label) {
    _ensureStarted();
    const list = label ? _cache.objects.filter((o) => o.label === label) : _cache.objects;
    if (!list.length) return null;
    return list.reduce((best, o) => (o.confidence > best.confidence ? o : best));
  },
  all(label) {
    _ensureStarted();
    return _cache.objects.filter((o) => o.label === label);
  },
  count(label) {
    _ensureStarted();
    return _cache.objects.filter((o) => o.label === label).length;
  },
  any(label) {
    _ensureStarted();
    return _cache.objects.some((o) => o.label === label);
  },

  hands() {
    _ensureStarted();
    return _cache.hands;
  },
  gesture() {
    _ensureStarted();
    if (!_cache.hands.length) return null;
    const g = _cache.hands[0].gesture;
    return g === "None" ? null : g;
  },

  face() {
    _ensureStarted();
    return _cache.face;
  },
  expression() {
    _ensureStarted();
    return _cache.face?.expression ?? null;
  },

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
};
