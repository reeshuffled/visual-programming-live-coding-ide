const _targets = new Map();

class DrawTarget {
  #z;
  #gc;

  constructor(z, getLayerCanvas) {
    this.#z = z;
    this.#gc = getLayerCanvas ?? ((z) => window.__ar_getLayerCanvas(z));
  }

  #ctx() {
    return this.#gc(this.#z).getContext("2d");
  }

  get width()  { return this.#gc(this.#z).width; }
  get height() { return this.#gc(this.#z).height; }

  // ── Background / clear ────────────────────────────────────────────────────

  bg(color) {
    const ctx = this.#ctx();
    const prev = ctx.fillStyle;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = prev;
    return this;
  }

  clear() {
    const ctx = this.#ctx();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return this;
  }

  // ── Filled shapes ─────────────────────────────────────────────────────────

  rect(x, y, w, h, color = "#fff") {
    const ctx = this.#ctx();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    return this;
  }

  circle(x, y, r, color = "#fff") {
    const ctx = this.#ctx();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    return this;
  }

  arc(x, y, r, start, end, color = "#fff") {
    const ctx = this.#ctx();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, start, end);
    ctx.closePath();
    ctx.fill();
    return this;
  }

  poly(points, color = "#fff") {
    if (points.length < 2) return this;
    const ctx = this.#ctx();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fill();
    return this;
  }

  // ── Stroked shapes ────────────────────────────────────────────────────────

  rectStroke(x, y, w, h, color = "#fff", thickness = 1) {
    const ctx = this.#ctx();
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.strokeRect(x, y, w, h);
    return this;
  }

  ring(x, y, r, color = "#fff", thickness = 1) {
    const ctx = this.#ctx();
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    return this;
  }

  arcStroke(x, y, r, start, end, color = "#fff", thickness = 1) {
    const ctx = this.#ctx();
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.arc(x, y, r, start, end);
    ctx.stroke();
    return this;
  }

  line(x1, y1, x2, y2, color = "#fff", thickness = 1) {
    const ctx = this.#ctx();
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    return this;
  }

  polyStroke(points, color = "#fff", thickness = 1, closed = true) {
    if (points.length < 2) return this;
    const ctx = this.#ctx();
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    if (closed) ctx.closePath();
    ctx.stroke();
    return this;
  }

  // ── Text ──────────────────────────────────────────────────────────────────

  text(str, x, y, size = 24, color = "#fff", { font = "sans-serif", align = "left", baseline = "alphabetic" } = {}) {
    const ctx = this.#ctx();
    ctx.fillStyle = color;
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(str, x, y);
    return this;
  }

  // ── Image ─────────────────────────────────────────────────────────────────

  image(img, x, y, w, h) {
    const ctx = this.#ctx();
    if (w !== undefined && h !== undefined) ctx.drawImage(img, x, y, w, h);
    else ctx.drawImage(img, x, y);
    return this;
  }

  // ── State ─────────────────────────────────────────────────────────────────

  push() { this.#ctx().save(); return this; }
  pop()  { this.#ctx().restore(); return this; }

  alpha(n)     { this.#ctx().globalAlpha = n; return this; }
  blend(mode)  { this.#ctx().globalCompositeOperation = mode; return this; }

  // ── Transform ─────────────────────────────────────────────────────────────

  translate(x, y)  { this.#ctx().translate(x, y); return this; }
  rotate(rad)      { this.#ctx().rotate(rad); return this; }
  scale(x, y = x)  { this.#ctx().scale(x, y); return this; }

  resetTransform() { this.#ctx().setTransform(1, 0, 0, 1, 0, 0); return this; }

  reset() {
    const ctx = this.#ctx();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    return this;
  }

  // ── Pixel FX ──────────────────────────────────────────────────────────────

  pixelate(source, blockSize = 8, x = 0, y = 0, w, h) {
    const ctx = this.#ctx();
    const dw = w ?? ctx.canvas.width - x;
    const dh = h ?? ctx.canvas.height - y;
    const pw = Math.max(1, Math.round(dw / blockSize));
    const ph = Math.max(1, Math.round(dh / blockSize));
    const off = document.createElement('canvas');
    off.width = pw; off.height = ph;
    const offCtx = off.getContext('2d');
    offCtx.drawImage(source, 0, 0, pw, ph);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, x, y, dw, dh);
    ctx.imageSmoothingEnabled = true;
    return this;
  }

  toASCII(canvas, { cols = 80, rows, charset = ' .:-=+*#%@', bg = '#000', color = '#0f0' } = {}) {
    const r = rows ?? Math.round(cols / 2.5);
    const pre = document.createElement('pre');
    pre.style.cssText = `background:${bg};color:${color};font:${Math.max(4, Math.floor(800 / cols))}px/1.1 monospace;margin:0;padding:4px;white-space:pre;overflow:hidden;`;
    const update = (src = canvas) => {
      const off = document.createElement('canvas');
      off.width = cols; off.height = r;
      const offCtx = off.getContext('2d');
      offCtx.drawImage(src, 0, 0, cols, r);
      const px = offCtx.getImageData(0, 0, cols, r).data;
      let text = '';
      for (let row = 0; row < r; row++) {
        for (let col = 0; col < cols; col++) {
          const i = (row * cols + col) * 4;
          const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
          text += charset[Math.min(charset.length - 1, Math.floor(lum * charset.length))];
        }
        text += '\n';
      }
      pre.textContent = text;
    };
    update(canvas);
    return { el: pre, update };
  }

  // ── Layer targeting ───────────────────────────────────────────────────────

  at(z) { return new DrawTarget(z, this.#gc); }
}

export function getDraw(z = 0, getLayerCanvas = null) {
  if (!getLayerCanvas) {
    if (_targets.has(z)) return _targets.get(z);
    const t = new DrawTarget(z, null);
    _targets.set(z, t);
    return t;
  }
  return new DrawTarget(z, getLayerCanvas);
}

export function cleanupDraw() {
  for (const [z] of _targets) {
    const canvas = window.__ar_getLayerCanvas?.(z);
    if (!canvas) continue;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
  }
  _targets.clear();
}
