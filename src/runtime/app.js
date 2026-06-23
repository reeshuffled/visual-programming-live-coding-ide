import { vision, stopVision, preloadVision } from "../api/vision.js";
import { TOOLKIT_CATEGORIES } from "../editor/completions.js";
import { initCamera, Camera, cleanupCameras } from "../api/camera.js";
import { initMic } from "../api/mic.js";
import { audio, startAudio, cleanupAudio } from "../api/audio.js";
import { Shader, ShaderFX, cleanupShaders } from "../api/shader.js";
import { AudioViz, cleanupViz } from "../api/viz.js";
import { Media, cleanupMedia } from "../api/media.js";
import { initDOMCaptures, captureWindow as _captureWindow, cleanupCaptures } from "../editor/editor-capture.js";
import { initWM } from "../api/wm.js";
import {
  initPaletteWorkspace, onPaletteClick, resizeBlockly,
  TOOLBOX_CATEGORY_META, finishBlockRenders,
} from "../blocks/blocks.js";
import { EditorInstance } from "../editor/editor-instance.js";

// ── Capture native timer/event functions before any user-code patching ────────
const _nativeSetInterval  = window.setInterval.bind(window);
const _nativeClearInterval = window.clearInterval.bind(window);
const _nativeSetTimeout   = window.setTimeout.bind(window);
const _nativeClearTimeout = window.clearTimeout.bind(window);
const _nativeELAdd = EventTarget.prototype.addEventListener;

const nativeTimers = {
  setInterval:   _nativeSetInterval,
  clearInterval: _nativeClearInterval,
  setTimeout:    _nativeSetTimeout,
  clearTimeout:  _nativeClearTimeout,
};

// ── Shared globals exposed to all user code ───────────────────────────────────
window.vision   = vision;
window.audio    = audio;
window.Shader   = Shader;
window.ShaderFX = ShaderFX;
window.Camera   = Camera;
window.AudioViz = AudioViz;
window.Media    = Media;
window.pat   = (str, inst, opts) => audio.pat(str, inst, opts);
window.stack = (...pats) => audio.stack(...pats);

class Color {
  static random() {
    return `hsl(${Math.floor(Math.random() * 360)},${50 + Math.floor(Math.random() * 50)}%,${40 + Math.floor(Math.random() * 30)}%)`;
  }
  static invert(color) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
  }
}
window.Color = Color;
window.onKey = (key, fn) => document.addEventListener("keydown", (e) => { if (key === "any" || e.key === key) fn(e); });
window.randUni = (lo, hi) => Math.random() * (hi - lo) + lo;

// ── Global addEventListener patch — routes listeners to active editor ──────────
EventTarget.prototype.addEventListener = function(type, handler, options) {
  const edId = window.__ar_active_editor_id;
  if (edId != null) {
    const inst = window.__ar_instances?.get(edId);
    if (inst) inst._listeners.push({ target: this, type, handler, options });
  }
  return _nativeELAdd.call(this, type, handler, options);
};

preloadVision();

window.onload = () => {
  // ── Camera / Mic ───────────────────────────────────────────────────────────
  initCamera();
  initMic();

  // ── DOM captures ──────────────────────────────────────────────────────────
  initDOMCaptures(_nativeSetInterval, _nativeClearInterval);
  window.captureWindow = (target, fps) => _captureWindow(target, fps);

  // ── Window manager ─────────────────────────────────────────────────────────
  window.wm = initWM(() => {
    window.__ar_instances?.forEach(inst => {
      inst.cm.refresh();
      inst.inlineWidgets.refresh();
    });
  });

  const _stage = document.getElementById('wm-stage');

  // ── Shared tooltip for toolkit snippets ───────────────────────────────────
  const toolTipEl = document.createElement('div');
  toolTipEl.id = 'toolkit-tooltip';
  document.body.appendChild(toolTipEl);
  const showTooltip = (text, anchorEl) => {
    toolTipEl.textContent = text;
    toolTipEl.style.display = 'block';
    const rect = anchorEl.getBoundingClientRect();
    toolTipEl.style.left = `${rect.right + 8}px`;
    toolTipEl.style.top  = `${rect.top + rect.height / 2}px`;
    toolTipEl.style.transform = 'translateY(-50%)';
  };
  const hideTooltip = () => { toolTipEl.style.display = 'none'; };

  function _populateTextPanel(panel) {
    for (const cat of TOOLKIT_CATEGORIES) {
      const catEl = document.createElement('div');
      catEl.className = 'toolkit-category';
      catEl.textContent = cat.name;
      panel.appendChild(catEl);
      for (const cmd of cat.commands) {
        const btn = document.createElement('div');
        btn.className = 'toolkit-btn';
        btn.draggable = true;
        btn.innerHTML = `<span>${cmd.label}</span><span class="toolkit-info" title="">ℹ</span>`;
        btn.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('application/x-ar-toolkit', cmd.code);
          if (cmd.blockType) e.dataTransfer.setData('application/x-ar-block-type', cmd.blockType);
          e.dataTransfer.effectAllowed = 'copy';
          btn.classList.add('dragging');
          hideTooltip();
        });
        btn.addEventListener('dragend', () => btn.classList.remove('dragging'));
        if (cmd.hint) {
          const infoSpan = btn.querySelector('.toolkit-info');
          infoSpan.addEventListener('mouseenter', () => showTooltip(cmd.hint, infoSpan));
          infoSpan.addEventListener('mouseleave', hideTooltip);
          infoSpan.addEventListener('mousedown', (e) => e.stopPropagation());
        }
        panel.appendChild(btn);
      }
    }
  }

  function _buildToolkitContent(win) {
    const body = win.querySelector('.wm-body');
    body.style.overflow = 'hidden';
    body.style.flexDirection = 'column';
    body.style.padding = '0';
    body.style.background = '#f0f2f5';

    const modeBar = document.createElement('div');
    modeBar.className = 'ar-toolkit-modebar';

    const textModeBtn = document.createElement('button');
    textModeBtn.className = 'ar-toolkit-mode ar-toolkit-mode-active';
    textModeBtn.title = 'Text snippets';
    textModeBtn.innerHTML = '<i class="fa-solid fa-code"></i>';

    const blocksModeBtn = document.createElement('button');
    blocksModeBtn.className = 'ar-toolkit-mode';
    blocksModeBtn.title = 'Block palette';
    blocksModeBtn.innerHTML = '<i class="fa-solid fa-puzzle-piece"></i>';

    modeBar.appendChild(textModeBtn);
    modeBar.appendChild(blocksModeBtn);
    body.appendChild(modeBar);

    const textPanel = document.createElement('div');
    textPanel.className = 'ar-toolkit-text';
    _populateTextPanel(textPanel);
    body.appendChild(textPanel);

    const blocksPanel = document.createElement('div');
    blocksPanel.className = 'ar-toolkit-blocks';
    blocksPanel.style.display = 'none';

    const catPanel = document.createElement('div');
    catPanel.className = 'ar-toolkit-cats';

    const listPanel = document.createElement('div');
    listPanel.className = 'ar-toolkit-list';

    const backBtn = document.createElement('button');
    backBtn.className = 'blockly-back-btn';
    backBtn.textContent = '← Back';

    const paletteDiv = document.createElement('div');
    paletteDiv.className = 'ar-toolkit-palette';

    listPanel.appendChild(backBtn);
    listPanel.appendChild(paletteDiv);
    blocksPanel.appendChild(catPanel);
    blocksPanel.appendChild(listPanel);
    body.appendChild(blocksPanel);

    let paletteWorkspace = null;
    let inBlocksMode = false;

    function ensurePalette() {
      if (paletteWorkspace) return;
      paletteWorkspace = initPaletteWorkspace(paletteDiv);
      onPaletteClick(paletteWorkspace, (type) => {
        window.__ar_active_blocks_editor?._addBlockToWorkspace(type);
      });
      backBtn.addEventListener('click', () => {
        listPanel.style.display = 'none';
        catPanel.style.display = '';
      });
      for (const { name, hue, blocks } of TOOLBOX_CATEGORY_META) {
        const btn = document.createElement('button');
        btn.className = 'blockly-cat-btn';
        btn.textContent = name;
        btn.style.background = `hsl(${hue}, 50%, 42%)`;
        btn.addEventListener('click', async () => {
          catPanel.style.display = 'none';
          listPanel.style.display = 'flex';
          backBtn.textContent = '← ' + name;
          paletteWorkspace.clear();
          const addedBlocks = [];
          for (const { type } of blocks) {
            const block = paletteWorkspace.newBlock(type);
            block.initSvg(); block.render();
            addedBlocks.push(block);
          }
          await finishBlockRenders();
          let y = 10;
          for (const block of addedBlocks) {
            block.moveTo({ x: 10, y });
            y += block.getHeightWidth().height + 14;
          }
          resizeBlockly(paletteWorkspace);
          requestAnimationFrame(() => paletteWorkspace.scroll(0, 0));
        });
        catPanel.appendChild(btn);
      }
    }

    function openText() {
      textPanel.style.display = '';
      blocksPanel.style.display = 'none';
      textModeBtn.classList.add('ar-toolkit-mode-active');
      blocksModeBtn.classList.remove('ar-toolkit-mode-active');
      inBlocksMode = false;
    }

    function openBlocks() {
      ensurePalette();
      textPanel.style.display = 'none';
      blocksPanel.style.display = 'flex';
      textModeBtn.classList.remove('ar-toolkit-mode-active');
      blocksModeBtn.classList.add('ar-toolkit-mode-active');
      inBlocksMode = true;
      resizeBlockly(paletteWorkspace);
    }

    textModeBtn.addEventListener('click', () => { if (inBlocksMode) openText(); });
    blocksModeBtn.addEventListener('click', () => { if (!inBlocksMode) openBlocks(); });

    new ResizeObserver(() => {
      if (inBlocksMode && paletteWorkspace) resizeBlockly(paletteWorkspace);
    }).observe(body);
  }

  let toolkitIdCounter = 1;

  function createToolkit(id) {
    toolkitIdCounter = Math.max(toolkitIdCounter, id);
    const winId = id === 1 ? 'win-toolkit' : `win-toolkit-${id}`;
    const title = id === 1 ? 'API Toolbox' : `API Toolbox ${id}`;
    window.wm.spawn(title, { id: winId, type: 'html', html: '' });
    const win = document.getElementById(winId);
    _buildToolkitContent(win);
    win.querySelector('.wm-dup')?.remove();
    win.querySelector('.wm-audio-ctrl')?.remove();
    return win;
  }

  window.wm.registerBuiltin('win-toolkit', () => createToolkit(1));

  window.wm.registerBuiltin('win-camera', () => {
    window.wm.spawn('Camera', { id: 'win-camera', type: 'html', html: '' });
    const win = document.getElementById('win-camera');
    const body = win.querySelector('.wm-body');
    body.style.background = '#000';
    body.appendChild(document.getElementById('camera'));
    win._wmRescueContent = () => _stage.appendChild(document.getElementById('camera'));
    win._wmSpawnOpts = { title: 'Camera mirror', type: 'camera' };
    win.querySelector('.wm-audio-ctrl')?.remove();
    win.style.display = 'none';
  });

  window.wm.registerBuiltin('win-mic', () => {
    window.wm.spawn('Mic', { id: 'win-mic', type: 'html', html: '' });
    const win = document.getElementById('win-mic');
    const body = win.querySelector('.wm-body');
    body.style.background = '#111';
    body.appendChild(document.getElementById('mic-viz-wrap'));
    win._wmRescueContent = () => _stage.appendChild(document.getElementById('mic-viz-wrap'));
    win.querySelector('.wm-dup')?.remove();
    win.style.display = 'none';
  });

  ['win-toolkit', 'win-camera', 'win-mic'].forEach(id => window.wm.createBuiltin(id));

  // ── Editor instances ───────────────────────────────────────────────────────
  window.__ar_instances = new Map();
  const defaultCode = document.getElementById("code_text")?.innerHTML.trim() ?? '';
  let editorIdCounter = 0;

  function createEditor(id) {
    editorIdCounter = Math.max(editorIdCounter, id);
    const inst = new EditorInstance(id, {
      nativeTimers,
      wm: window.wm,
      toolkitWinId: 'win-toolkit',
      defaultCode: id === 1 ? defaultCode : '',
    });
    window.__ar_instances.set(id, inst);
    return inst;
  }

  // Restore from manifest
  const manifest = EditorInstance.loadManifest();
  for (const id of manifest) createEditor(id);

  // ── Initial layout ─────────────────────────────────────────────────────────
  // Use editor-1 in split layout
  window.wm.layout('split');

  // ── "New Editor" button ────────────────────────────────────────────────────
  document.getElementById('newEditorBtn')?.addEventListener('click', () => {
    const id = ++editorIdCounter;
    const m = EditorInstance.loadManifest();
    m.push(id);
    EditorInstance.saveManifest(m);
    const inst = createEditor(id);

    const desk = document.getElementById('desktop');
    const dw = desk.offsetWidth, dh = desk.offsetHeight;
    const offset = ((id - 1) % 6) * 28;
    const w = Math.round(dw * 0.42), h = Math.round(dh * 0.6);
    const x = Math.min(offset + 60, dw - w - 10);
    const y = Math.min(offset + 40, dh - h - 44);
    const edWin  = document.getElementById(inst.editorWinId);
    const outWin = document.getElementById(inst.canvasWinId);
    if (edWin)  { edWin.style.cssText  += `;left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:flex;`; }
    if (outWin) { outWin.style.cssText += `;left:${x + w + 6}px;top:${y}px;width:${Math.min(500, dw - x - w - 16)}px;height:${h}px;display:flex;`; }
  });

  // ── "New Toolkit" button ───────────────────────────────────────────────────
  document.getElementById('newToolkitBtn')?.addEventListener('click', () => {
    const id = ++toolkitIdCounter;
    const win = createToolkit(id);
    const desk = document.getElementById('desktop');
    const dw = desk.offsetWidth, dh = desk.offsetHeight;
    const offset = ((id - 1) % 6) * 28;
    const w = Math.round(dw * 0.13), h = Math.round(dh * 0.7);
    const x = Math.min(offset + 30, dw - w - 10);
    const y = Math.min(offset + 30, dh - h - 44);
    win.style.cssText += `;left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:flex;`;
  });

  // ── "New Visualizer" button ────────────────────────────────────────────────
  let _vizCount = 0;
  document.getElementById('newVizBtn')?.addEventListener('click', () => {
    const offset = (_vizCount++ % 8) * 24;
    const desk = document.getElementById('desktop');
    const dw = desk.offsetWidth, dh = desk.offsetHeight;
    window.wm.spawn('Visualizer', {
      type: 'viz', w: 400, h: 240,
      x: Math.round((dw - 400) / 2) + offset,
      y: Math.round((dh - 240) / 2) + offset,
    });
  });

  // ── Files button ──────────────────────────────────────────────────────────
  const filesBtn = document.getElementById('filesBtn');
  const imageExts = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico']);
  const videoExts = new Set(['mp4','webm','mov','avi','mkv']);
  const audioExts = new Set(['mp3','wav','ogg','flac','aac','m4a']);
  let _fileBrowseCount = 0;
  filesBtn?.addEventListener('click', async () => {
    const offset = (_fileBrowseCount++ % 8) * 24;
    const desk = document.getElementById('desktop');
    const x = 20 + offset, y = 20 + offset;
    try {
      await window.wm.browse('__nav_files__', (url, name) => {
        const ext = name.split('.').pop().toLowerCase();
        if (imageExts.has(ext)) window.wm.spawn(name, { type: 'image', src: url, w: 480, h: 360 });
        else if (videoExts.has(ext)) window.wm.spawn(name, { type: 'video', src: url, w: 640, h: 480 });
        else if (audioExts.has(ext)) {
          const a = new Audio(url); a.controls = true;
          const winId = window.wm.spawn(name, { type: 'html', html: '', w: 320, h: 60 });
          const body = document.getElementById(winId)?.querySelector('.wm-body');
          if (body) { body.style.cssText += 'align-items:center;padding:4px 8px;'; body.appendChild(a); a.play(); }
        }
      }, { x, y });
    } catch (_) {}
  });

  // ── Help modal ────────────────────────────────────────────────────────────
  const helpOverlay = document.getElementById("help-overlay");
  const helpBtn     = document.getElementById("helpBtn");
  const helpClose   = document.getElementById("help-close");
  const toggleHelp  = () => {
    const open = helpOverlay.style.display !== "none";
    helpOverlay.style.display = open ? "none" : "block";
    helpBtn?.classList.toggle("active", !open);
  };
  helpBtn?.addEventListener("click", toggleHelp);
  helpClose?.addEventListener("click", () => { helpOverlay.style.display = "none"; helpBtn?.classList.remove("active"); });
  helpOverlay?.addEventListener("click", (e) => { if (e.target === helpOverlay) { helpOverlay.style.display = "none"; helpBtn?.classList.remove("active"); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "?" && !e.ctrlKey && !e.metaKey && !["INPUT","TEXTAREA"].includes(document.activeElement?.tagName) && !document.activeElement?.classList.contains("CodeMirror-code")) toggleHelp();
    if (e.key === "Escape" && helpOverlay?.style.display !== "none") { helpOverlay.style.display = "none"; helpBtn?.classList.remove("active"); }
  });

  // ── Global error fallback ─────────────────────────────────────────────────
  window.onerror = () => {
    window.__ar_instances?.forEach(inst => {
      if (inst.btnState === 'running' || inst.btnState === 'paused') inst._setStopped();
    });
    return false;
  };
  window.onunhandledrejection = () => {
    window.__ar_instances?.forEach(inst => {
      if (inst.btnState === 'running' || inst.btnState === 'paused') inst._setStopped();
    });
  };
};
