export function initMic() {
  let micOn = false;
  let currentStream = null;
  let audioCtx = null;
  let analyser = null;
  let rafId = null;

  const toggle = document.getElementById("micToggle");

  // Hidden canvas kept for shader.micVizShader() / audio.micCanvas compatibility
  const vizCanvas = document.getElementById("mic-viz");
  vizCanvas.width = 512;
  vizCanvas.height = 64;
  window.__ar_mic_viz = vizCanvas;
  const ctx = vizCanvas.getContext("2d");

  const NUM_BARS = 48;

  const drawBars = () => {
    rafId = requestAnimationFrame(drawBars);
    const W = vizCanvas.width;
    const H = vizCanvas.height;
    const bins = analyser.frequencyBinCount;
    const data = new Uint8Array(bins);
    analyser.getByteFrequencyData(data);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, W, H);
    const half = NUM_BARS / 2;
    const barW = W / NUM_BARS;
    for (let i = 0; i < half; i++) {
      const t = i / (half - 1);
      const bin = Math.round(Math.pow(t, 2) * (bins - 1));
      const v = data[bin] / 255;
      const h = v * H;
      const hue = v * 60;
      ctx.fillStyle = `hsl(${hue}, 95%, ${35 + v * 30}%)`;
      ctx.fillRect((half + i) * barW, (H - h) / 2, barW - 1, h);
      ctx.fillRect((half - 1 - i) * barW, (H - h) / 2, barW - 1, h);
    }
  };

  const startMic = () => {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      audioCtx.createMediaStreamSource(currentStream).connect(analyser);
      window.__ar_mic_analyser = analyser;
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (!rafId) drawBars();
  };

  const stopMic = () => {
    cancelAnimationFrame(rafId);
    rafId = null;
    ctx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
  };

  const enableMic = () => {
    if (micOn) return;
    micOn = true;
    window.__ar_mic_on = true;
    toggle.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    toggle.classList.add("active");
    currentStream?.getAudioTracks().forEach((t) => (t.enabled = true));
    startMic();
    console.log('[createos] Mic auto-enabled');
  };

  window.__ar_enableMic = enableMic;

  toggle.addEventListener("click", () => {
    micOn = !micOn;
    window.__ar_mic_on = micOn;
    toggle.innerHTML = micOn
      ? '<i class="fa-solid fa-microphone"></i>'
      : '<i class="fa-solid fa-microphone-slash"></i>';
    toggle.classList.toggle("active", micOn);
    currentStream?.getAudioTracks().forEach((t) => (t.enabled = micOn));
    micOn ? startMic() : stopMic();
  });

  const tryAcquireMic = () => {
    if (currentStream) return;
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        currentStream = stream;
        window.__ar_mic_stream = stream;
        stream.getAudioTracks().forEach((t) => (t.enabled = false));
        toggle.style.display = "inline-flex";
      })
      .catch(() => {});
  };

  if (navigator.mediaDevices?.getUserMedia) {
    tryAcquireMic();
    navigator.permissions?.query({ name: "microphone" }).then((status) => {
      status.addEventListener("change", () => {
        if (status.state === "granted") tryAcquireMic();
      });
    }).catch(() => {});
  }
}
