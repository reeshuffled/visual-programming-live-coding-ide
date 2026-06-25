export class Layer {
  #canvas;
  #state;

  constructor(canvas) {
    this.#canvas = canvas;
    this.#state = {
      blur: null,
      hue: null,
      brightness: null,
      saturate: null,
      invert: null,
      rawFilter: null,
      opacity: null,
      blendMode: null,
      rotate: null,
      rotateX: null,
      rotateY: null,
      scale: null,
      perspective: 600,
      clip: null,
    };
  }

  get canvas() {
    return this.#canvas;
  }

  #applyFilter() {
    if (this.#state.rawFilter !== null) {
      this.#canvas.style.filter = this.#state.rawFilter;
      return;
    }
    const s = this.#state;
    const parts = [];
    if (s.blur !== null) parts.push(`blur(${s.blur}px)`);
    if (s.hue !== null) parts.push(`hue-rotate(${s.hue}deg)`);
    if (s.brightness !== null) parts.push(`brightness(${s.brightness})`);
    if (s.saturate !== null) parts.push(`saturate(${s.saturate})`);
    if (s.invert !== null) parts.push(`invert(${s.invert})`);
    this.#canvas.style.filter = parts.join(" ");
  }

  #applyTransform() {
    const s = this.#state;
    const parts = [];
    if (s.rotateX !== null || s.rotateY !== null) parts.push(`perspective(${s.perspective}px)`);
    if (s.rotate !== null) parts.push(`rotate(${s.rotate}deg)`);
    if (s.rotateX !== null) parts.push(`rotateX(${s.rotateX}deg)`);
    if (s.rotateY !== null) parts.push(`rotateY(${s.rotateY}deg)`);
    if (s.scale !== null) parts.push(`scale(${s.scale})`);
    this.#canvas.style.transform = parts.join(" ");
  }

  blur(px) {
    this.#state.blur = px;
    this.#applyFilter();
    return this;
  }
  hue(deg) {
    this.#state.hue = deg;
    this.#applyFilter();
    return this;
  }
  brightness(n) {
    this.#state.brightness = n;
    this.#applyFilter();
    return this;
  }
  saturate(n) {
    this.#state.saturate = n;
    this.#applyFilter();
    return this;
  }
  invert(n) {
    this.#state.invert = n;
    this.#applyFilter();
    return this;
  }
  filter(str) {
    this.#state.rawFilter = str;
    this.#applyFilter();
    return this;
  }

  opacity(n) {
    this.#state.opacity = n;
    this.#canvas.style.opacity = String(n);
    return this;
  }

  rotate(deg) {
    this.#state.rotate = deg;
    this.#applyTransform();
    return this;
  }
  rotateX(deg) {
    this.#state.rotateX = deg;
    this.#applyTransform();
    return this;
  }
  rotateY(deg) {
    this.#state.rotateY = deg;
    this.#applyTransform();
    return this;
  }
  scale(x, y) {
    this.#state.scale = y !== undefined ? `${x}, ${y}` : String(x);
    this.#applyTransform();
    return this;
  }
  perspective(px) {
    this.#state.perspective = px;
    this.#applyTransform();
    return this;
  }

  clip(str) {
    this.#state.clip = str;
    this.#canvas.style.clipPath = str;
    return this;
  }

  blendMode(mode) {
    this.#state.blendMode = mode;
    this.#canvas.style.mixBlendMode = mode;
    return this;
  }

  reset() {
    this.#state = {
      blur: null,
      hue: null,
      brightness: null,
      saturate: null,
      invert: null,
      rawFilter: null,
      opacity: null,
      blendMode: null,
      rotate: null,
      rotateX: null,
      rotateY: null,
      scale: null,
      perspective: 600,
      clip: null,
    };
    this.#canvas.style.filter = "";
    this.#canvas.style.opacity = "";
    this.#canvas.style.mixBlendMode = "";
    this.#canvas.style.transform = "";
    this.#canvas.style.clipPath = "";
    return this;
  }
}

export function getLayerForZ(z) {
  const reg = (window.__ar_layer_objects ??= new Map());
  if (reg.has(z)) return reg.get(z);
  const canvas = window.__ar_getLayerCanvas?.(z) ?? document.getElementById("turtle");
  const layer = new Layer(canvas);
  reg.set(z, layer);
  return layer;
}
