// ── Multi-camera API ─────────────────────────────────────────────────────────

const _openCameras = [];

export function cleanupCameras() {
  for (const c of _openCameras) c._release();
  _openCameras.length = 0;
}

class CameraStream {
  constructor(stream) {
    this._stream = stream;
    this.element = document.createElement('video');
    this.element.autoplay = true;
    this.element.playsInline = true;
    this.element.muted = true;
    this.element.srcObject = stream;
    _openCameras.push(this);
  }

  stop() { this._release(); }

  _release() {
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream = null;
    this.element.srcObject = null;
    const i = _openCameras.indexOf(this);
    if (i >= 0) _openCameras.splice(i, 1);
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
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const cam = new CameraStream(stream);
    // Wait for video metadata so width/height are available
    await new Promise(resolve => {
      if (cam.element.readyState >= 1) { resolve(); return; }
      cam.element.addEventListener('loadedmetadata', resolve, { once: true });
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

export function initCamera() {
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  window.__ar_video = video;
  window.camera = video; // ergonomic alias for user code

  const cameraCanvas = document.getElementById("camera");
  const cameraCtx = cameraCanvas.getContext("2d");
  let rafId = null;
  let cameraOn = false;
  let currentStream = null;

  const drawFrame = () => {
    rafId = requestAnimationFrame(drawFrame);
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      cameraCtx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);
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

  const startCamera = (deviceId) => {
    currentStream?.getTracks().forEach((t) => t.stop());
    currentStream = null;
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
        document.getElementById("cameraToggle").style.display = "inline-flex";
        if (cameraOn && !rafId) drawFrame();
        return navigator.mediaDevices.enumerateDevices();
      })
      .then(populateCameras)
      .catch((err) => console.warn("Camera unavailable:", err.message));
  };

  document.getElementById("cameraToggle").addEventListener("click", () => {
    cameraOn = !cameraOn;
    window.__ar_camera_on = cameraOn;
    const toggle = document.getElementById("cameraToggle");
    toggle.innerHTML = cameraOn ? '<i class="fa-solid fa-video"></i>' : '<i class="fa-solid fa-video-slash"></i>';
    toggle.classList.toggle("active", cameraOn);
    if (cameraOn) {
      if (!rafId) drawFrame();
    } else {
      cancelAnimationFrame(rafId);
      rafId = null;
      cameraCtx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
    }
  });

  document.getElementById("cameraSelect").addEventListener("change", function () {
    startCamera(this.value);
  });

  if (navigator.mediaDevices?.getUserMedia) {
    startCamera(null);
  }
}
