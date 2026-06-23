export function initMic() {
  let micOn = false;
  let currentStream = null;
  let audioCtx = null;
  let analyser = null;
  let rafId = null;

  const toggle = document.getElementById("micToggle");
  const vizWrap = document.getElementById("mic-viz-wrap");
  const vizCanvas = document.getElementById("mic-viz");
  const ctx = vizCanvas.getContext("2d");

  const NUM_BARS = 48;

  const drawBars = () => {
    rafId = requestAnimationFrame(drawBars);
    const W = vizCanvas.offsetWidth;
    if (vizCanvas.width !== W) vizCanvas.width = W;
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
      // right of center
      ctx.fillRect((half + i) * barW, (H - h) / 2, barW - 1, h);
      // mirror left of center
      ctx.fillRect((half - 1 - i) * barW, (H - h) / 2, barW - 1, h);
    }
  };

  const micWin = document.getElementById("win-mic");
  let micWinPositioned = false;

  const startViz = () => {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      audioCtx.createMediaStreamSource(currentStream).connect(analyser);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (micWin) {
      if (!micWinPositioned) {
        const desk = document.getElementById("desktop");
        const dw = desk.offsetWidth, dh = desk.offsetHeight;
        micWin.style.left   = `${Math.round(dw * 0.42)}px`;
        micWin.style.top    = `${Math.round(dh * 0.82)}px`;
        micWin.style.width  = `${Math.round(dw * 0.30)}px`;
        micWin.style.height = `${Math.round(dh * 0.14)}px`;
        micWinPositioned = true;
      }
      micWin.style.zIndex = "500";
      micWin.style.display = "flex";
    }
    if (!rafId) drawBars();
  };

  const stopViz = () => {
    cancelAnimationFrame(rafId);
    rafId = null;
    if (micWin) micWin.style.display = "none";
    ctx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
  };

  toggle.addEventListener("click", () => {
    micOn = !micOn;
    window.__ar_mic_on = micOn;
    toggle.innerHTML = micOn
      ? '<i class="fa-solid fa-microphone"></i>'
      : '<i class="fa-solid fa-microphone-slash"></i>';
    toggle.classList.toggle("active", micOn);
    currentStream?.getAudioTracks().forEach((t) => (t.enabled = micOn));
    micOn ? startViz() : stopViz();
  });

  if (navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        currentStream = stream;
        window.__ar_mic_stream = stream;
        stream.getAudioTracks().forEach((t) => (t.enabled = false));
        toggle.style.display = "inline-flex";
      })
      .catch((err) => console.warn("Mic unavailable:", err.message));
  }
}
