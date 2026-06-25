import { vision, stopVision, preloadVision } from "../api/vision.js";
import { TOOLKIT_CATEGORIES, addToolkitEntries } from "../editor/completions.js";
import { _registerBuiltin, registerAPI, _setToolkitApplier, _setBlocksApplier } from "./api-registry.js";
import { initCamera, Camera, cleanupCameras } from "../api/camera.js";
import { initMic } from "../api/mic.js";
import { audio, startAudio, cleanupAudio } from "../api/audio.js";
import { Shader, ShaderFX, cleanupShaders } from "../api/shader.js";
import { GLShader, GLSL_PRESETS } from "../api/glsl-shader.js";
import { initPixi, PIXI } from "../api/pixi.js";
import { AudioViz, SpectrogramCanvas, PianoRollViz, EQWidget, cleanupViz } from "../api/viz.js";
import { Media, cleanupMedia } from "../api/media.js";
import { VideoSignalAPI, cleanupVideoSignal } from "../api/video-signal.js";
import { SensorsAPI, cleanupSensors } from "../api/sensors.js";
import { DesktopAPI, initDesktop, cleanupDesktop, addFolderIcon } from "../api/desktop-files.js";
import { initDOMCaptures, captureWindow as _captureWindow, cleanupCaptures } from "../editor/editor-capture.js";
import { pipe, cleanupPipelines } from "../api/render-pipeline.js";
import { library, initLibrary, populateLibraryToolkit, populateLibraryBlocks } from "../api/library.js";
import { initWM } from "../api/wm.js";
import {
  initPaletteWorkspace, onPaletteClick, resizeBlockly,
  TOOLBOX_CATEGORY_META, finishBlockRenders, applyExternalBlocks,
  addBlockToCategoryMeta,
} from "../blocks/blocks.js";
import { editImage } from "../api/image-edit.js";
import { EditorInstance } from "../editor/editor-instance.js";
import { saveProject, loadProject } from "../api/project.js";

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
// All public APIs go through _registerBuiltin so the registry is the single source
// of truth. Users call registerAPI() to override or extend any built-in.
_registerBuiltin('vision',   vision);
_registerBuiltin('video',    VideoSignalAPI);
_registerBuiltin('sensors',  SensorsAPI);
_registerBuiltin('desktop',  DesktopAPI);
_registerBuiltin('audio',    audio);
_registerBuiltin('Shader',   Shader);
_registerBuiltin('ShaderFX', ShaderFX);
_registerBuiltin('GLShader', GLShader);
_registerBuiltin('GLSL_PRESETS', GLSL_PRESETS);
_registerBuiltin('pipe',    pipe);
_registerBuiltin('PIXI',     PIXI);
// Vector constructor stubs — used as type hints in Shader JS function params.
// In the JS function body these are real values; the transpiler maps them to WGSL vec types.
_registerBuiltin('vec2', (x = 0, y = 0)             => ({ x, y, _wgsl: 'vec2f' }));
_registerBuiltin('vec3', (x = 0, y = 0, z = 0)      => ({ x, y, z, _wgsl: 'vec3f' }));
_registerBuiltin('vec4', (x = 0, y = 0, z = 0, w=1) => ({ x, y, z, w, _wgsl: 'vec4f' }));
_registerBuiltin('Camera',   Camera);
_registerBuiltin('AudioViz',          AudioViz);
_registerBuiltin('SpectrogramCanvas', SpectrogramCanvas);
_registerBuiltin('PianoRollViz',      PianoRollViz);
_registerBuiltin('EQWidget',          EQWidget);
_registerBuiltin('Media',    Media);
_registerBuiltin('pat',   (str, inst, opts) => audio.pat(str, inst, opts));
_registerBuiltin('stack', (...pats) => audio.stack(...pats));

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
_registerBuiltin('Color', Color);
_registerBuiltin('onKey', (key, fn) => document.addEventListener("keydown", (e) => {
  const el = document.activeElement;
  if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) return;
  if (window.__ar_paused) return;
  if (key === "any" || e.key === key) fn(e);
}));
_registerBuiltin('randUni', (lo, hi) => Math.random() * (hi - lo) + lo);
// Expose registerAPI to user code so plugins and snippets can extend the platform.
_registerBuiltin('registerAPI', registerAPI);
_registerBuiltin('editImage',  editImage);

// Wire up extensibility appliers so registerAPI(name, impl, { blocks, toolkit }) works.
_setBlocksApplier(applyExternalBlocks);
_setToolkitApplier(addToolkitEntries);

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
  _registerBuiltin('captureWindow', (target, fps) => _captureWindow(target, fps));

  // ── Window manager ─────────────────────────────────────────────────────────
  const _wm = initWM(() => {
    window.__ar_instances?.forEach(inst => {
      inst.cm.requestMeasure();
      inst.inlineWidgets.refresh();
    });
  });
  _registerBuiltin('wm', _wm);
  initDesktop(window.wm);

  // PIXI.js — init once at startup (synchronous in v7). Sets window.pixi + window.Stage.
  initPixi();
  // Register pixi/Stage through the registry after initPixi() assigns them to window.
  if (window.pixi)  _registerBuiltin('pixi',  window.pixi);
  if (window.Stage) _registerBuiltin('Stage', window.Stage);

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

  function _makeToolkitBtn(cmd, catName) {
    const btn = document.createElement('div');
    btn.className = 'toolkit-btn';
    btn.draggable = true;
    btn.dataset.search = `${cmd.label} ${cmd.hint ?? ''} ${(cmd.tags ?? []).join(' ')}`.toLowerCase();
    btn.dataset.cat = catName.toLowerCase();
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
    return btn;
  }

  function _populateTextPanel(panel) {
    for (const cat of TOOLKIT_CATEGORIES) {
      const catEl = document.createElement('div');
      catEl.className = 'toolkit-category';
      catEl.dataset.catName = cat.name.toLowerCase();
      catEl.textContent = cat.name;
      panel.appendChild(catEl);
      for (const cmd of cat.commands) {
        panel.appendChild(_makeToolkitBtn(cmd, cat.name));
      }
    }
  }

  // Live toolkit entry insertion — called by pipe.register() and any runtime registerAPI() use.
  // Updates all currently-open toolkit text panels without requiring a re-open.
  window.__ar_addToolkitEntry = (catName, cmd) => {
    addToolkitEntries(catName, [cmd]);
    document.querySelectorAll('.ar-toolkit-text').forEach(panel => {
      let header = panel.querySelector(`.toolkit-category[data-cat-name="${catName.toLowerCase()}"]`);
      if (!header) {
        header = document.createElement('div');
        header.className = 'toolkit-category';
        header.dataset.catName = catName.toLowerCase();
        header.textContent = catName;
        panel.appendChild(header);
      }
      panel.appendChild(_makeToolkitBtn(cmd, catName));
    });
  };

  // Boot user library — loads localStorage entries into memory, injects into toolkit + palette
  initLibrary();
  _registerBuiltin('library', library);
  // wire block applier before populating so stored blocks register immediately
  window.__ar_applyLibraryBlock = (definition, generator) => {
    applyExternalBlocks(definition.type, [{ definition, generator }]);
    addBlockToCategoryMeta('My Library', definition.type);
  };
  populateLibraryToolkit();
  populateLibraryBlocks();

  function _filterTextPanel(panel, q) {
    const query = q.trim().toLowerCase();
    const cats = panel.querySelectorAll('.toolkit-category');
    const btns = panel.querySelectorAll('.toolkit-btn');
    if (!query) {
      cats.forEach(c => { c.style.display = ''; });
      btns.forEach(b => { b.style.display = ''; });
      return;
    }
    cats.forEach(c => { c.style.display = 'none'; });
    btns.forEach(b => {
      const match = b.dataset.search?.includes(query);
      b.style.display = match ? '' : 'none';
      if (match) {
        const catEl = panel.querySelector(`.toolkit-category[data-cat-name="${b.dataset.cat}"]`);
        if (catEl) catEl.style.display = '';
      }
    });
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

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Filter…';
    searchInput.className = 'ar-toolkit-search';
    searchInput.addEventListener('mousedown', e => e.stopPropagation());

    modeBar.appendChild(textModeBtn);
    modeBar.appendChild(blocksModeBtn);
    modeBar.appendChild(searchInput);
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

    searchInput.addEventListener('input', () => {
      if (!inBlocksMode) _filterTextPanel(textPanel, searchInput.value);
    });
    textModeBtn.addEventListener('click', () => { if (inBlocksMode) { openText(); searchInput.style.display = ''; } });
    blocksModeBtn.addEventListener('click', () => { if (!inBlocksMode) { openBlocks(); searchInput.style.display = 'none'; } });

    new ResizeObserver(() => {
      if (inBlocksMode && paletteWorkspace) resizeBlockly(paletteWorkspace);
    }).observe(body);
  }

  let toolkitIdCounter = 1;

  function createToolkit(id) {
    toolkitIdCounter = Math.max(toolkitIdCounter, id);
    const winId = id === 1 ? 'win-toolkit' : `win-toolkit-${id}`;
    const title = id === 1 ? 'API Toolbox' : `API Toolbox ${id}`;
    window.wm.spawn(title, { id: winId, type: 'html', html: '', audio: false });
    const win = document.getElementById(winId);
    _buildToolkitContent(win);
    win.querySelector('.wm-dup')?.remove();
    return win;
  }

  // ── Editor instances ───────────────────────────────────────────────────────
  window.__ar_instances = new Map();
  const defaultCode = document.getElementById("code_text")?.textContent.trim() ?? '';
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
  window.__ar_createEditor = createEditor;
  window.__ar_newEditorWithCode = (code) => {
    const id = ++editorIdCounter;
    try { localStorage.setItem(`vl-ide-code-${id}`, code); } catch (_) {}
    const m = EditorInstance.loadManifest();
    if (!m.includes(id)) EditorInstance.saveManifest([...m, id]);
    return createEditor(id);
  };

  // Restore from manifest (fall back to editor 1 on first load)
  let manifest = EditorInstance.loadManifest();
  if (manifest.length === 0) {
    manifest = [1];
    EditorInstance.saveManifest(manifest);
  }
  for (const id of manifest) createEditor(id);

  window.wm.restoreState();

  // Auto-execute editors that were running/paused before refresh
  for (const id of manifest) {
    const state = localStorage.getItem(`vl-ide-exec-${id}`);
    if (state === 'running' || state === 'paused') {
      const inst = window.__ar_instances.get(id);
      if (inst) {
        inst.execute();
        if (state === 'paused') setTimeout(() => inst.pauseRunning(), 200);
      }
    }
  }

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

  // ── Desktop right-click context menu ──────────────────────────────────────
  (() => {
    let menu = null;

    function closeMenu() {
      menu?.remove();
      menu = null;
    }

    document.getElementById('desktop').addEventListener('contextmenu', (e) => {
      if (e.target.closest('.wm-win') || e.target.closest('#taskbar')) return;
      e.preventDefault();
      closeMenu();

      const cx = e.clientX, cy = e.clientY;
      menu = document.createElement('div');
      menu.className = 'desktop-ctx-menu';

      const items = [
        { icon: 'fa-file-code', label: 'New Code File', action() {
          const id = ++editorIdCounter;
          const m = EditorInstance.loadManifest();
          m.push(id);
          EditorInstance.saveManifest(m);
          const inst = createEditor(id);
          const desk = document.getElementById('desktop');
          const dw = desk.offsetWidth, dh = desk.offsetHeight;
          const w = Math.round(dw * 0.42), h = Math.round(dh * 0.6);
          const x = Math.min(cx, dw - w - 10);
          const y = Math.min(cy, dh - h - 44);
          const edWin = document.getElementById(inst.editorWinId);
          if (edWin) edWin.style.cssText += `;left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:flex;`;
        }},
        { icon: 'fa-folder-open', label: 'Grant Folder Access…', async action() {
          const folderData = await window.wm.pickFolder();
          if (!folderData) return;
          const desk = document.getElementById('desktop');
          const rect = desk.getBoundingClientRect();
          const iconId = addFolderIcon(folderData, cx - rect.left, cy - rect.top);
          if (folderData.handle) window.wm.registerFolder(iconId, folderData.handle);
          else if (folderData.fallback) window.wm.registerFolderFallback(iconId, folderData.fallback);
          window.wm.browse(iconId, null, { x: cx, y: cy }).catch(() => {});
        }},
      ];

      items.forEach(({ icon, label, action }) => {
        const item = document.createElement('div');
        item.className = 'desktop-ctx-item';
        item.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
        item.addEventListener('click', () => { closeMenu(); action(); });
        menu.appendChild(item);
      });

      document.body.appendChild(menu);

      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      menu.style.left = `${Math.min(cx, window.innerWidth  - mw - 4)}px`;
      menu.style.top  = `${Math.min(cy, window.innerHeight - mh - 4)}px`;
    });

    document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown',   (e) => { if (e.key === 'Escape') closeMenu(); });
  })();

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

  // Track system-spawned viz window IDs so they can be closed when the source is toggled off.
  let _sysMicVizId = null;
  let _sysCamWinId = null;

  const _spawnMicViz = () => {
    const desk = document.getElementById('desktop');
    const dw = desk.offsetWidth, dh = desk.offsetHeight;
    const offset = (_vizCount++ % 8) * 24;
    _sysMicVizId = window.wm.spawn('Mic Visualizer', {
      type: 'viz', source: 'mic', style: 'bars',
      w: 400, h: 180,
      x: Math.round((dw - 400) / 2) + offset,
      y: Math.round((dh - 180) / 2) + offset,
    });
  };

  const _spawnCamWin = () => {
    const desk = document.getElementById('desktop');
    const dw = desk.offsetWidth, dh = desk.offsetHeight;
    const offset = (_vizCount++ % 8) * 24;
    _sysCamWinId = window.wm.spawn('Camera', {
      type: 'camera',
      w: 320, h: 240,
      x: Math.round((dw - 320) / 2) + offset,
      y: Math.round((dh - 240) / 2) + offset,
    });
  };

  // Show/hide mic viz button with mic state; auto-spawn on first enable.
  // On toggle-off, close the system-spawned viz; warn if user-spawned viz windows remain.
  const micVizBtn = document.getElementById('newMicVizBtn');
  document.getElementById('micToggle')?.addEventListener('click', () => {
    const on = window.__ar_mic_on;
    if (micVizBtn) micVizBtn.style.display = on ? '' : 'none';
    if (on) {
      _spawnMicViz();
    } else {
      if (_sysMicVizId) { window.wm.close(_sysMicVizId); _sysMicVizId = null; }
    }
  });
  document.getElementById('newMicVizBtn')?.addEventListener('click', _spawnMicViz);

  // Show/hide camera viz button with camera state; auto-spawn on first enable.
  // On toggle-off, close the system-spawned camera window; warn if user-spawned cam windows remain.
  const camVizBtn = document.getElementById('newCamVizBtn');
  document.getElementById('cameraToggle')?.addEventListener('click', () => {
    const on = window.__ar_camera_on;
    if (camVizBtn) camVizBtn.style.display = on ? '' : 'none';
    if (on) {
      _spawnCamWin();
    } else {
      if (_sysCamWinId) { window.wm.close(_sysCamWinId); _sysCamWinId = null; }
      // Warn about user-spawned camera windows that remain open
      const remaining = [...document.querySelectorAll('.wm-win')]
        .filter(w => w.style.display !== 'none' && w._wmSpawnOpts?.type === 'camera' && w.id !== _sysCamWinId);
      if (remaining.length) console.warn('Camera turned off — user-spawned camera window(s) still open.');
    }
  });
  document.getElementById('newCamVizBtn')?.addEventListener('click', _spawnCamWin);

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

  // ── Project save / load ───────────────────────────────────────────────────
  const appAPI = {
    createEditor,
    createToolkit,
    nextToolkitId: () => ++toolkitIdCounter,
    updateManifest: (ids) => EditorInstance.saveManifest(ids),
  };

  document.getElementById('saveProjectBtn')?.addEventListener('click', () =>
    saveProject(window.wm, window.__ar_instances));

  document.getElementById('loadProjectBtn')?.addEventListener('click', () =>
    loadProject(window.wm, window.__ar_instances, appAPI));

  // ── Fullscreen ───────────────────────────────────────────────────────────
  document.getElementById('undoWinBtn')?.addEventListener('click', () => window.wm.undo());
  document.getElementById('redoWinBtn')?.addEventListener('click', () => window.wm.redo());

  document.getElementById('closeAllWinsBtn')?.addEventListener('click', () => window.wm.closeAll());

  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const _updateFsIcon = () => {
    const fs = !!document.fullscreenElement;
    fullscreenBtn?.querySelector('i')?.setAttribute('class', fs ? 'fa-solid fa-compress' : 'fa-solid fa-expand');
    fullscreenBtn?.classList.toggle('active', fs);
  };
  fullscreenBtn?.addEventListener('click', () => {
    document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  });
  document.addEventListener('fullscreenchange', _updateFsIcon);
  document.addEventListener('keydown', e => {
    if (e.key === 'F11') { e.preventDefault(); document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
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
