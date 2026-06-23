import esprima from "esprima";

// ── Color utilities ───────────────────────────────────────────────────────────

function colorToHex(color) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function isValidColor(color) {
  const s = new Option().style;
  s.color = color;
  return s.color !== "";
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${f(0).toString(16).padStart(2, "0")}${f(8).toString(16).padStart(2, "0")}${f(4).toString(16).padStart(2, "0")}`;
}

function resolveToHex(color) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  try { return colorToHex(color); } catch (_) { return "#ff0000"; }
}

// ── Color popup (singleton) ───────────────────────────────────────────────────

let _popup = null;

function getColorPopup() {
  if (_popup) return _popup;

  const el = document.createElement("div");
  el.className = "ar-color-popup";
  el.innerHTML = `
    <div class="ar-cp-preview"></div>
    <div class="ar-cp-row"><span>H</span><input type="range" class="ar-cp-h" min="0" max="359"></div>
    <div class="ar-cp-row"><span>S</span><input type="range" class="ar-cp-s" min="0" max="100"></div>
    <div class="ar-cp-row"><span>L</span><input type="range" class="ar-cp-l" min="5" max="95"></div>
    <input type="text" class="ar-cp-hex" maxlength="7" spellcheck="false">
  `;
  el.style.display = "none";
  document.body.appendChild(el);

  const preview = el.querySelector(".ar-cp-preview");
  const hSlider = el.querySelector(".ar-cp-h");
  const sSlider = el.querySelector(".ar-cp-s");
  const lSlider = el.querySelector(".ar-cp-l");
  const hexInput = el.querySelector(".ar-cp-hex");

  let h = 0, s = 100, l = 50;
  let onChangeCb = null;
  let onCloseCb = null;
  let anchorEl = null;

  function updateSliderBg() {
    hSlider.style.background = `linear-gradient(to right,
      hsl(0,${s}%,${l}%),hsl(60,${s}%,${l}%),hsl(120,${s}%,${l}%),
      hsl(180,${s}%,${l}%),hsl(240,${s}%,${l}%),hsl(300,${s}%,${l}%),hsl(359,${s}%,${l}%))`;
    sSlider.style.background =
      `linear-gradient(to right,hsl(${h},0%,${l}%),hsl(${h},100%,${l}%))`;
    lSlider.style.background =
      `linear-gradient(to right,hsl(${h},${s}%,5%),hsl(${h},${s}%,50%),hsl(${h},${s}%,95%))`;
  }

  function emitColor() {
    const hex = hslToHex(h, s, l);
    preview.style.background = hex;
    hexInput.value = hex;
    updateSliderBg();
    onChangeCb?.(hex);
  }

  hSlider.addEventListener("input", () => { h = +hSlider.value; emitColor(); });
  sSlider.addEventListener("input", () => { s = +sSlider.value; emitColor(); });
  lSlider.addEventListener("input", () => { l = +lSlider.value; emitColor(); });

  hexInput.addEventListener("change", () => {
    const v = hexInput.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      [h, s, l] = hexToHsl(v);
      hSlider.value = h; sSlider.value = s; lSlider.value = l;
      emitColor();
    }
  });

  // Stop mousedown from bubbling to CM (would move cursor)
  el.addEventListener("mousedown", (e) => e.stopImmediatePropagation());

  // Close on outside click
  document.addEventListener("mousedown", (e) => {
    if (el.style.display === "none") return;
    if (!el.contains(e.target) && e.target !== anchorEl && !anchorEl?.contains(e.target)) {
      hide();
    }
  });

  function reposition() {
    if (!anchorEl || el.style.display === "none") return;
    const r = anchorEl.getBoundingClientRect();
    let left = r.left;
    let top = r.bottom + 4;
    // Keep inside viewport
    if (left + 190 > window.innerWidth) left = window.innerWidth - 194;
    if (top + 160 > window.innerHeight) top = r.top - 160 - 4;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function show(anchor, hex, onChange, onClose) {
    anchorEl = anchor;
    onChangeCb = onChange;
    onCloseCb = onClose;
    const resolved = resolveToHex(hex);
    [h, s, l] = hexToHsl(resolved);
    hSlider.value = h; sSlider.value = s; lSlider.value = l;
    preview.style.background = resolved;
    hexInput.value = resolved;
    updateSliderBg();
    el.style.display = "block";
    reposition();
  }

  function hide() {
    if (el.style.display === "none") return;
    el.style.display = "none";
    onCloseCb?.();
    onChangeCb = null;
    onCloseCb = null;
    anchorEl = null;
  }

  function isOpen() { return el.style.display !== "none"; }
  function currentAnchor() { return anchorEl; }

  _popup = { show, hide, isOpen, currentAnchor };
  return _popup;
}



// ── Color swatch widget (for existing color literals) ─────────────────────────

function makeColorWidget(cm, arg, code, suppressDebounce) {
  const color = arg.value;
  if (!isValidColor(color)) return null;

  const hex = resolveToHex(color);
  const swatch = document.createElement("span");
  swatch.className = "ar-color-swatch";
  swatch.style.background = hex;
  swatch.title = color;

  const argStartIndex = arg.range[0];
  let currentStr = code.slice(arg.range[0], arg.range[1]);

  const applyColor = (newHex) => {
    const newStr = `"${newHex}"`;
    const fromPos = cm.posFromIndex(argStartIndex);
    const toPos = cm.posFromIndex(argStartIndex + currentStr.length);
    cm.replaceRange(newStr, fromPos, toPos);
    currentStr = newStr;
    swatch.style.background = newHex;
    swatch.title = newHex;
  };

  swatch.addEventListener("mousedown", (e) => e.stopImmediatePropagation());
  swatch.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const popup = getColorPopup();
    if (popup.isOpen() && popup.currentAnchor() === swatch) {
      popup.hide();
    } else {
      popup.show(
        swatch,
        swatch.style.background || hex,
        (newHex) => { suppressDebounce(true); applyColor(newHex); },
        () => suppressDebounce(false),
      );
    }
  });

  return swatch;
}

// ── Scrub widget (for number literals) ───────────────────────────────────────

function makeScrubWidget(cm, arg, suppressDebounce) {
  const argStartIndex = arg.range[0];
  let currentVal = arg.value;
  let currentStr = String(currentVal);
  let currentMark = null;

  const scrub = document.createElement("span");
  scrub.className = "ar-scrub";
  scrub.textContent = currentStr;

  scrub.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    suppressDebounce(true);
    scrub.classList.add("ar-scrub-active");

    const dragStartX = e.clientX;
    const dragStartVal = currentVal;
    const isInt = Number.isInteger(currentVal);
    const magnitude = Math.abs(currentVal) || 1;
    const step = magnitude >= 100 ? 2 : magnitude >= 10 ? 1 : 0.1;

    const onMove = (e) => {
      const delta = e.clientX - dragStartX;
      let newVal = dragStartVal + Math.round(delta / 3) * step;
      newVal = isInt ? Math.round(newVal) : Math.round(newVal * 10) / 10;
      if (newVal === currentVal) return;

      const newStr = String(newVal);
      const fromPos = cm.posFromIndex(argStartIndex);
      const toPos = cm.posFromIndex(argStartIndex + currentStr.length);
      cm.replaceRange(newStr, fromPos, toPos);
      currentVal = newVal;
      currentStr = newStr;
      scrub.textContent = newStr;

      if (currentMark) { try { currentMark.clear(); } catch (_) {} }
      const newFrom = cm.posFromIndex(argStartIndex);
      const newTo = cm.posFromIndex(argStartIndex + newStr.length);
      currentMark = cm.markText(newFrom, newTo, {
        replacedWith: scrub,
        handleMouseEvents: false,
      });
    };

    const onUp = () => {
      scrub.classList.remove("ar-scrub-active");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      suppressDebounce(false);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  return {
    el: scrub,
    setMark: (m) => { currentMark = m; },
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function initInlineWidgets(cm) {
  let activeMarks = [];
  let debounceTimer = null;
  let dragging = false;

  function suppressDebounce(on) {
    dragging = on;
    if (!on) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(placeWidgets, 200);
    }
  }

  function clearMarks() {
    for (const m of activeMarks) { try { m.clear(); } catch (_) {} }
    activeMarks = [];
  }

  function placeWidgets() {
    if (dragging) return;
    clearMarks();
    clearGhost();

    const code = cm.getValue();
    let ast;
    try {
      ast = esprima.parseScript(code, { range: true, tolerant: true });
    } catch (_) {
      return;
    }

    const toPlace = [];

    function visitCall(call) {
      if (call.callee?.type !== "MemberExpression") return;
      const method = call.callee.property?.name;
      if (!method) return;

      for (const arg of call.arguments) {
        if (arg.type !== "Literal") continue;
        const from = cm.posFromIndex(arg.range[0]);
        const to = cm.posFromIndex(arg.range[1]);

        if (typeof arg.value === "string" && isValidColor(arg.value)) {
          const el = makeColorWidget(cm, arg, code, suppressDebounce);
          if (el) toPlace.push({ pos: from, el, bookmark: true });
        } else if (typeof arg.value === "number") {
          const { el, setMark } = makeScrubWidget(cm, arg, suppressDebounce);
          toPlace.push({ from, to, el, setMark, bookmark: false });
        }
      }
    }

    function walk(node) {
      if (!node || typeof node !== "object") return;
      if (node.type === "CallExpression") visitCall(node);
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object" && v.type) walk(v);
      }
    }

    walk(ast);

    for (const { pos, from, to, el, setMark, bookmark } of toPlace) {
      const mark = bookmark
        ? cm.setBookmark(pos, { widget: el, insertLeft: true, handleMouseEvents: false })
        : cm.markText(from, to, { replacedWith: el, handleMouseEvents: false });
      activeMarks.push(mark);
      if (setMark) setMark(mark);
    }
  }

  // ── Ghost widget ────────────────────────────────────────────────────────────
  let ghostMark = null;
  let ghostDebounce = null;

  function clearGhost() {
    if (ghostMark) { try { ghostMark.clear(); } catch (_) {} ghostMark = null; }
  }

  function updateGhost() {
    clearGhost();
    if (dragging) return;

    const cursor = cm.getCursor();
    const lineText = cm.getLine(cursor.line);
    if (!lineText) return;

    const before = lineText.slice(0, cursor.ch);
    const after = lineText.slice(cursor.ch);
    const m = before.match(/(\w+)\.color\(\s*$/);
    if (!m || !/^\s*\)/.test(after)) return;

    const insertIndex = cm.indexFromPos(cursor);
    let currentStr = "";

    const swatch = document.createElement("span");
    swatch.className = "ar-color-swatch ar-color-swatch-ghost";
    swatch.title = "Pick a color";

    swatch.addEventListener("mousedown", (e) => e.stopImmediatePropagation());
    swatch.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const popup = getColorPopup();
      if (popup.isOpen() && popup.currentAnchor() === swatch) {
        popup.hide();
        return;
      }
      popup.show(
        swatch,
        "#ff0000",
        (newHex) => {
          suppressDebounce(true);
          swatch.style.background = newHex;
          const newStr = `"${newHex}"`;
          const fromPos = cm.posFromIndex(insertIndex);
          const toPos = cm.posFromIndex(insertIndex + currentStr.length);
          cm.replaceRange(newStr, fromPos, toPos);
          currentStr = newStr;
        },
        () => {
          suppressDebounce(false);
        },
      );
    });

    ghostMark = cm.setBookmark(cursor, {
      widget: swatch,
      insertLeft: true,
      handleMouseEvents: false,
    });
  }

  cm.on("cursorActivity", () => {
    clearTimeout(ghostDebounce);
    ghostDebounce = setTimeout(updateGhost, 60);
  });

  cm.on("change", () => {
    if (dragging) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(placeWidgets, 700);
  });

  debounceTimer = setTimeout(placeWidgets, 300);

  return {
    refresh: () => { clearTimeout(debounceTimer); placeWidgets(); },
    clear: () => { clearMarks(); clearGhost(); },
    destroy: () => {
      clearTimeout(debounceTimer);
      clearTimeout(ghostDebounce);
      clearMarks();
      clearGhost();
    },
  };
}
