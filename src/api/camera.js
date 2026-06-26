import { onReset } from '../runtime/reset-registry.js';
import { notify, registerCommand } from '../events/index.js';
import { recordStream } from './recorder.js';
import { initCameraLease } from './media-lease.js';
// ── Multi-camera API ─────────────────────────────────────────────────────────

const _openCameras = [];

export function cleanupCameras() {
  for (const c of _openCameras) c._release();
  _openCameras.length = 0;
}

class CameraStream {
  constructor(stream) {
    this._stream = stream;
    this._flipped = false;
    this._deviceId = stream.getVideoTracks()[0]?.getSettings?.().deviceId ?? null;
    this.element = document.createElement('video');
    this.element.autoplay = true;
    this.element.playsInline = true;
    this.element.muted = true;
    this.element.srcObject = stream;
    _openCameras.push(this);
  }

  /** Mirror the video feed horizontally */
  flip(state = true) {
    this._flipped = state;
    this.element.style.transform = state ? 'scaleX(-1)' : '';
    notify('camera:flip', { deviceId: this._deviceId, mirrored: state });
    return this;
  }

  stop() { this._release(); }

  async photo({ name = 'photo', download = false } = {}) {
    const v = this.element;
    const w = v.videoWidth || 640, h = v.videoHeight || 480;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (this._flipped) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, w, h);
    return new Promise(resolve => {
      c.toBlob(blob => {
        if (blob) window.desktop?.addBlob(blob, { name: name + '.jpg', type: 'image', download });
        resolve(blob);
      }, 'image/jpeg', 0.92);
    });
  }

  record({ name = 'clip', fps = 30 } = {}) {
    if (!this._stream) throw new Error('Camera stopped');
    return recordStream(this._stream, {
      onStop: blob => window.desktop?.addBlob(blob, { name: name + '.webm', type: 'video' }),
    });
  }

  _release() {
    const deviceId = this._deviceId;
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream = null;
    this.element.srcObject = null;
    const i = _openCameras.indexOf(this);
    if (i >= 0) _openCameras.splice(i, 1);
    if (deviceId) notify('camera:close', { deviceId });
  }
}

export const Camera = {
  async open({ index = 0, deviceId = null } = {}) {
    let id = deviceId;
    if (!id) {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter(d => d.kind === 'videoinput');
      id = cams[index]?.deviceId ?? null;
    }
    const constraints = {
      video: id
        ? { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1920 }, height: { ideal: 1080 } },
    };
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
    catch (err) {
      notify('camera:error', { deviceId: id, error: err?.message ?? String(err) });
      throw err;
    }
    const cam = new CameraStream(stream);
    // Wait for video metadata so width/height are available
    await new Promise(resolve => {
      if (cam.element.readyState >= 1) { resolve(); return; }
      cam.element.addEventListener('loadedmetadata', resolve, { once: true });
    });
    notify('camera:open', {
      deviceId: cam._deviceId,
      index,
      width: cam.element.videoWidth,
      height: cam.element.videoHeight,
    });
    return cam;
  },

  async list() {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter(d => d.kind === 'videoinput')
      .map((d, i) => ({ index: i, deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  },
};

// ── Main toolbar camera ──────────────────────────────────────────────────────
//
// Lazy: stream acquired only when ≥1 consumer holds a lease (ADR 023).
// No getUserMedia at page load. acquireCamera() in media-lease.js calls _startToolbarCamera.

export function initCamera() {
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  window.__ar_video = video;
  window.camera = video; // ergonomic alias for user code

  const cameraCanvas = document.getElementById("camera");
  const cameraCtx = cameraCanvas.getContext("2d");
  let rafId = null;
  let currentStream = null;

  const drawFrame = () => {
    rafId = requestAnimationFrame(drawFrame);
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      const w = cameraCanvas.width, h = cameraCanvas.height;
      cameraCtx.drawImage(video, 0, 0, w, h);
    }
  };

  const populateCameras = (devices) => {
    const videoDevices = devices.filter((d) => d.kind === "videoinput");
    const select = document.getElementById("cameraSelect");
    const current = select.value;
    select.innerHTML = "";
    videoDevices.forEach((device, i) => {
      const opt = document.createElement("option");
      opt.value = device.deviceId;
      opt.text = device.label || `Camera ${i + 1}`;
      if (opt.value === current) opt.selected = true;
      select.appendChild(opt);
    });
    document.getElementById("cameraWrapper").style.display = videoDevices.length > 1 ? "" : "none";
  };

  // _startToolbarCamera: called by media-lease on 0→1 (first consumer).
  // Acquires getUserMedia, starts draw loop, sets flags, emits events.
  const _startToolbarCamera = (deviceId) => {
    if (currentStream) {
      // switch device
      currentStream.getTracks().forEach((t) => t.stop());
      currentStream = null;
    }
    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1920 }, height: { ideal: 1080 } },
    };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        currentStream = stream;
        video.srcObject = stream;
        window.__ar_camera_on = true;
        if (!rafId) drawFrame();
        notify('camera:open', { deviceId: 'toolbar', toolbar: true });
        return new Promise(resolve => {
          if (video.readyState >= 1) { resolve(); return; }
          video.addEventListener('loadedmetadata', resolve, { once: true });
        });
      })
      .then(() => {
        notify('camera:ready', { deviceId: 'toolbar', toolbar: true, width: video.videoWidth, height: video.videoHeight });
        return navigator.mediaDevices.enumerateDevices();
      })
      .then(populateCameras)
      .catch((err) => {
        notify('camera:error', { deviceId: 'toolbar', error: err?.message ?? String(err) });
        console.warn("Camera unavailable:", err.message);
      });
  };

  // _stopToolbarCamera: called by media-lease on 1→0 (last consumer released).
  const _stopToolbarCamera = () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    cameraCtx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
    currentStream?.getTracks().forEach((t) => t.stop());
    currentStream = null;
    video.srcObject = null;
    window.__ar_camera_on = false;
    document.getElementById("cameraWrapper").style.display = "none";
    notify('camera:close', { deviceId: 'toolbar', toolbar: true });
  };

  // Device select change handler — switch camera while live.
  document.getElementById("cameraSelect").addEventListener("change", function () {
    if (window.__ar_camera_on) _startToolbarCamera(this.value);
  });

  // Permission change watcher — re-acquire if permission is granted externally.
  navigator.permissions?.query({ name: "camera" }).then((status) => {
    status.addEventListener("change", () => {
      // Only re-acquire if a consumer is waiting (refcount > 0 but no stream yet).
      if (status.state === "granted" && window.__ar_camera_on === false) {
        // If there are active leases but stream failed, try again.
        // media-lease will call _startToolbarCamera when count goes 0→1.
      }
    });
  }).catch(() => {});

  // Register with media-lease (ADR 023).
  initCameraLease(_startToolbarCamera, _stopToolbarCamera);
}

// Register teardown with the reset registry (ADR 008).
onReset(cleanupCameras);

// ── Event bus command handler ─────────────────────────────────────────────────
registerCommand('camera:close', ({ deviceId }) => {
  if (deviceId === 'toolbar') return; // toolbar handled by media-lease
  const cam = _openCameras.find(c => c._deviceId === deviceId);
  if (cam) cam.stop(); // stop() → _release() → notify('camera:close', ...)
});
