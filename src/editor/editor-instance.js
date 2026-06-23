import { addInfiniteLoopProtection, friendlyError } from './live-patch.js';
import { initInlineWidgets } from './inline-widgets.js';
import { getDraw } from '../api/draw.js';
import { Layer } from '../api/layer.js';
import { startAudio, cleanupAudio } from '../api/audio.js';
import { cleanupShaders } from '../api/shader.js';
import { cleanupViz } from '../api/viz.js';
import { cleanupMedia } from '../api/media.js';
import { cleanupCameras } from '../api/camera.js';
import { cleanupCaptures } from './editor-capture.js';
import { stopVision } from '../api/vision.js';
import { freezeTimers, restoreTimers } from '../runtime/timer-manager.js';
import {
  initBlockly, getWorkspaceCode, resizeBlockly, workspaceIsEmpty,
  loadWorkspaceJSON, registerSidebarDeleteZone,
} from '../blocks/blocks.js';
import { jsToBlocks } from '../blocks/js-to-blocks.js';

const STORAGE_PREFIX = 'vl-ide-code-';
const LEGACY_KEY = 'vl-ide-code';

const ICONS = {
  play:  '<i class="fa-solid fa-play"></i>',
  pause: '<i class="fa-solid fa-pause"></i>',
  reset: '<i class="fa-solid fa-rotate-left"></i>',
};

// Which editor instance receives palette clicks (set when editor opens blocks mode)
export let activeBlocksEditor = null;

export class EditorInstance {
  constructor(id, { nativeTimers, wm, toolkitWinId, defaultCode = '' }) {
    this.id = id;
    this.title = id === 1 ? 'Editor' : `Editor ${id}`;
    this._native = nativeTimers;
    this._wm = wm;
    this._toolkitWinId = toolkitWinId;
    this._defaultCode = defaultCode;

    this.btnState = 'idle';
    this.currentScript = null;
    this.idleWatcher = null;
    this._intervals = new Map();
    this._timeouts = new Map();
    this._listeners = [];
    this._keepAlive = new Set();
    this._pausedState = null;

    this._layers = new Map();
    this._layerObjects = new Map();
    this._drawTargets = new Map();

    this.blocklyWorkspace = null;
    this.blocksMode = false;

    this.editorWinId = `win-editor-${id}`;
    this.canvasWinId = `win-canvas-${id}`;

    this._buildDOM();
    this._setupGlobals();
    this._buildWindows();

    // Restore blocks mode pref
    if (localStorage.getItem(`vl-blocks-open-${id}`) === '1') {
      requestAnimationFrame(() => this._openBlocks());
    } else {
      requestAnimationFrame(() => this._positionThumb(false));
    }
  }

  // ── Canvas / layer ─────────────────────────────────────────────────────────

  _makeGetLayerCanvas() {
    return (z) => {
      if (this._layers.has(z)) return this._layers.get(z);
      const c = document.createElement('canvas');
      c.width = this.mainCanvas.width;
      c.height = this.mainCanvas.height;
      c.className = 'ar-layer';
      Object.assign(c.style, {
        position: 'absolute', top: '0', left: '0',
        width: '100%', height: '100%',
        zIndex: String(z < 0 ? z : 20 + z),
        pointerEvents: 'none',
      });
      this.canvasWrapper.appendChild(c);
      this._layers.set(z, c);
      return c;
    };
  }

  _getDraw(z) {
    if (this._drawTargets.has(z)) return this._drawTargets.get(z);
    const t = getDraw(z, this._getLayerCanvas);
    this._drawTargets.set(z, t);
    return t;
  }

  _getLayerObj(z) {
    if (this._layerObjects.has(z)) return this._layerObjects.get(z);
    const canvas = this._getLayerCanvas(z);
    const layer = new Layer(canvas);
    this._layerObjects.set(z, layer);
    return layer;
  }

  // ── DOM construction ───────────────────────────────────────────────────────

  _buildDOM() {
    // Canvas stack
    this.mainCanvas = document.createElement('canvas');
    this.mainCanvas.width = 1600;
    this.mainCanvas.height = 900;
    Object.assign(this.mainCanvas.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%', zIndex: '20',
    });

    this.canvasWrapper = document.createElement('div');
    this.canvasWrapper.className = 'ar-canvas-wrapper';
    this.canvasWrapper.appendChild(this.mainCanvas);

    this.fsContainer = document.createElement('div');
    this.fsContainer.className = 'ar-fs-container';
    this.fsContainer.appendChild(this.canvasWrapper);

    new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const w = Math.min(width, (height * 16) / 9);
      this.canvasWrapper.style.width = `${w}px`;
      this.canvasWrapper.style.height = `${(w * 9) / 16}px`;
    }).observe(this.fsContainer);

    this._layers.set(0, this.mainCanvas);
    this._getLayerCanvas = this._makeGetLayerCanvas();
    this.draw = this._getDraw(0);

    // Console panel
    this.consoleEl = document.createElement('div');
    this.consoleEl.className = 'ar-console-output';

    const consoleLabelRow = document.createElement('div');
    consoleLabelRow.className = 'ar-console-label';
    const consoleLabelText = document.createElement('span');
    consoleLabelText.textContent = 'Console';
    const consoleClearLink = document.createElement('a');
    consoleClearLink.href = '#';
    consoleClearLink.textContent = 'Clear';
    consoleClearLink.addEventListener('click', (e) => { e.preventDefault(); this.clearConsole(); });
    const consolePopLink = document.createElement('a');
    consolePopLink.href = '#';
    consolePopLink.textContent = '↗';
    consolePopLink.title = 'Pop out to window';
    consolePopLink.addEventListener('click', (e) => { e.preventDefault(); this._popoutConsole(); });
    consoleLabelRow.appendChild(consoleLabelText);
    consoleLabelRow.appendChild(consoleClearLink);
    consoleLabelRow.appendChild(consolePopLink);

    this.consolePanel = document.createElement('div');
    this.consolePanel.className = 'ar-console-panel';
    this.consolePanel.style.display = 'none';
    this.consolePanel.appendChild(consoleLabelRow);
    this.consolePanel.appendChild(this.consoleEl);

    // Blocks area
    this.blocksArea = document.createElement('div');
    this.blocksArea.className = 'ar-blocks-area';
    this.blocksArea.style.display = 'none';
    this.blocksDiv = document.createElement('div');
    this.blocksDiv.style.flex = '1';
    this.blocksArea.appendChild(this.blocksDiv);

    // Editor wrap + CodeMirror
    this.editorWrap = document.createElement('div');
    this.editorWrap.className = 'ar-editor-wrap';
    const editorDiv = document.createElement('div');
    editorDiv.style.cssText = 'flex:1;min-height:0;';
    this.editorWrap.appendChild(editorDiv);

    // Toolbar
    const toolbar = this._buildToolbar();

    // Editor column
    this.editorColumn = document.createElement('div');
    this.editorColumn.className = 'ar-editor-column';
    this.editorColumn.appendChild(toolbar);
    this.editorColumn.appendChild(this.editorWrap);
    this.editorColumn.appendChild(this.blocksArea);
    this.editorColumn.appendChild(this.consolePanel);

    // CodeMirror init
    const storageKey = STORAGE_PREFIX + this.id;
    // Migrate legacy key for editor 1
    if (this.id === 1 && !localStorage.getItem(storageKey) && localStorage.getItem(LEGACY_KEY)) {
      localStorage.setItem(storageKey, localStorage.getItem(LEGACY_KEY));
    }
    const initialCode = localStorage.getItem(storageKey) ?? this._defaultCode;

    this.cm = CodeMirror(editorDiv, {
      mode: 'javascript',
      lineNumbers: true,
      value: initialCode,
      extraKeys: { 'Ctrl-Space': 'autocomplete', 'Ctrl-Q': (cm) => cm.foldCode(cm.getCursor()) },
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      hintOptions: { completeSingle: false },
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
    });

    this.inlineWidgets = initInlineWidgets(this.cm);

    let saveTimer;
    this.cm.on('change', () => {
      clearTimeout(saveTimer);
      saveTimer = this._native.setTimeout(
        () => localStorage.setItem(storageKey, this.cm.getValue()), 500
      );
    });
    this.cm.setOption('lint', true);

    // Drag-drop from toolkit into CM (text mode)
    const cmWrapper = this.cm.getWrapperElement();
    cmWrapper.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/x-ar-toolkit')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    cmWrapper.addEventListener('drop', (e) => {
      const code = e.dataTransfer.getData('application/x-ar-toolkit');
      if (!code) return;
      e.preventDefault(); e.stopPropagation();
      const pos = this.cm.coordsChar({ left: e.clientX, top: e.clientY });
      this.cm.focus();
      this.cm.replaceRange(code + '\n', pos);
      this.cm.setCursor({ line: pos.line + code.split('\n').length, ch: 0 });
    });

    // Drag-drop from toolkit into blocks area
    this.blocksArea.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/x-ar-block-type')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    this.blocksArea.addEventListener('drop', (e) => {
      const type = e.dataTransfer.getData('application/x-ar-block-type');
      if (!type || !this.blocklyWorkspace) return;
      e.preventDefault(); e.stopPropagation();
      this._addBlockToWorkspace(type, e.clientX, e.clientY);
    });

    new ResizeObserver(() => {
      if (this.blocklyWorkspace && this.blocksArea.style.display !== 'none')
        resizeBlockly(this.blocklyWorkspace);
    }).observe(this.blocksArea);
  }

  _buildToolbar() {
    const bar = document.createElement('div');
    bar.className = 'ar-editor-toolbar';

    // Mode toggle
    const modeToggle = document.createElement('div');
    modeToggle.className = 'ar-mode-toggle';
    this._modeThumb = document.createElement('div');
    this._modeThumb.className = 'ar-mode-thumb';
    this._textBtn = document.createElement('div');
    this._textBtn.className = 'ar-toggle-opt ar-toggle-active';
    this._textBtn.innerHTML = '<i class="fa-solid fa-code"></i>';
    this._blocksBtn = document.createElement('div');
    this._blocksBtn.className = 'ar-toggle-opt';
    this._blocksBtn.innerHTML = '<i class="fa-solid fa-puzzle-piece"></i>';
    modeToggle.appendChild(this._modeThumb);
    modeToggle.appendChild(this._textBtn);
    modeToggle.appendChild(this._blocksBtn);

    this._textBtn.addEventListener('click', () => {
      if (this.blocksMode) { this._closeBlocks(); localStorage.setItem(`vl-blocks-open-${this.id}`, '0'); }
    });
    this._blocksBtn.addEventListener('click', () => {
      if (!this.blocksMode) { this._openBlocks(); localStorage.setItem(`vl-blocks-open-${this.id}`, '1'); }
    });

    // Execute button
    this.executeBtn = document.createElement('button');
    this.executeBtn.className = 'ar-btn ar-btn-green';
    this.executeBtn.title = 'Run';
    this.executeBtn.innerHTML = ICONS.play;
    this.executeBtn.addEventListener('click', () => {
      if (this.btnState === 'idle') this.execute();
      else if (this.btnState === 'running') this.pauseRunning();
      else if (this.btnState === 'paused') this.resumeRunning();
      else this.reset();
    });

    // Stop button
    this.stopBtn = document.createElement('button');
    this.stopBtn.className = 'ar-btn ar-btn-red';
    this.stopBtn.title = 'Stop';
    this.stopBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
    this.stopBtn.style.display = 'none';
    this.stopBtn.addEventListener('click', () => {
      if (this.btnState === 'running' || this.btnState === 'paused') this.stopRunning();
    });

    // Clear canvas button
    this.clearCanvasBtn = document.createElement('button');
    this.clearCanvasBtn.className = 'ar-btn';
    this.clearCanvasBtn.title = 'Clear Canvas';
    this.clearCanvasBtn.innerHTML = '<i class="fa-solid fa-eraser"></i>';
    this.clearCanvasBtn.style.display = 'none';
    this.clearCanvasBtn.addEventListener('click', () => {
      for (const c of this._layers.values())
        c.getContext('2d').clearRect(0, 0, c.width, c.height);
    });

    // Console toggle
    this.consoleToggleBtn = document.createElement('button');
    this.consoleToggleBtn.className = 'ar-btn';
    this.consoleToggleBtn.title = 'Toggle Console';
    this.consoleToggleBtn.innerHTML = '<i class="fa-solid fa-terminal"></i>';
    this.consoleToggleBtn.addEventListener('click', () => {
      const open = this.consolePanel.style.display === 'flex';
      this.consolePanel.style.display = open ? 'none' : 'flex';
      this.consoleToggleBtn.classList.toggle('ar-btn-active', !open);
      this.cm.refresh();
      this.inlineWidgets.refresh();
    });

    bar.appendChild(modeToggle);
    bar.appendChild(this.executeBtn);
    bar.appendChild(this.stopBtn);
    bar.appendChild(this.clearCanvasBtn);
    bar.appendChild(this.consoleToggleBtn);
    return bar;
  }

  _positionThumb(toBlocks) {
    const opt = toBlocks ? this._blocksBtn : this._textBtn;
    const container = this._modeThumb.parentElement;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const or = opt.getBoundingClientRect();
    this._modeThumb.style.left = (or.left - cr.left) + 'px';
    this._modeThumb.style.width = or.width + 'px';
  }

  // ── Window manager integration ─────────────────────────────────────────────

  _buildWindows() {
    // Editor window
    this._wm.spawn(this.title, { id: this.editorWinId, type: 'html', html: '' });
    const editorWin = document.getElementById(this.editorWinId);
    const editorBody = editorWin.querySelector('.wm-body');
    editorBody.style.overflow = 'hidden';
    editorBody.appendChild(this.editorColumn);
    editorWin.querySelector('.wm-dup')?.remove();

    // Replace full audio controls with mute-only button for Blockly sounds
    editorWin.querySelector('.wm-audio-ctrl')?.remove();
    const muteCtrl = document.createElement('span');
    muteCtrl.className = 'wm-audio-ctrl';
    muteCtrl.style.display = 'none';
    const muteBtn = document.createElement('button');
    muteBtn.className = 'wm-mute';
    muteBtn.title = 'Mute blocks sounds';
    muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    let _blocksMuted = false;
    muteBtn.addEventListener('click', e => {
      e.stopPropagation();
      _blocksMuted = !_blocksMuted;
      muteBtn.innerHTML = _blocksMuted
        ? '<i class="fa-solid fa-volume-xmark"></i>'
        : '<i class="fa-solid fa-volume-high"></i>';
      muteBtn.classList.toggle('muted', _blocksMuted);
      if (this.blocklyWorkspace) this.blocklyWorkspace.getAudioManager().setMuted(_blocksMuted);
    });
    muteCtrl.appendChild(muteBtn);
    this._blocksMuteCtrl = muteCtrl;
    const firstBtn = editorWin.querySelector('.wm-titlebar .wm-btn');
    editorWin.querySelector('.wm-titlebar').insertBefore(muteCtrl, firstBtn);

    editorWin._wmOnClose = () => {
      const title = editorWin.querySelector('.wm-title')?.textContent ?? this.title;
      if (!confirm(`Close "${title}" and its output? Running code will be stopped.`)) return false;
      this.destroy();
      return true;
    };
    editorWin._wmIsEditor = true;

    new ResizeObserver(() => {
      this.cm.refresh();
      this.inlineWidgets.refresh();
      if (this.blocklyWorkspace && this.blocksArea.style.display !== 'none')
        resizeBlockly(this.blocklyWorkspace);
    }).observe(editorWin);

    // Output window
    this._wm.spawn(`Output ${this.id === 1 ? '' : this.id}`.trim(), {
      id: this.canvasWinId, type: 'html', html: '', w: 640, h: 400,
    });
    const canvasWin = document.getElementById(this.canvasWinId);
    const canvasBody = canvasWin.querySelector('.wm-body');
    canvasBody.style.flexDirection = 'column';
    canvasBody.appendChild(this.fsContainer);
    canvasWin._wmSpawnOpts = { title: `Output mirror`, type: 'canvas', z: 0 };
  }

  // ── Globals injected into IIFE ─────────────────────────────────────────────

  _setupGlobals() {
    const ns = `__ar_e${this.id}`;
    window[`${ns}_draw`] = this.draw;
    window[`${ns}_getCanvas`] = (z = 0) => this._getLayerCanvas(z);
    window[`${ns}_getLayer`] = (z) => this._getLayerObj(z);

    const self = this;
    window[`${ns}_setInterval`] = (cb, delay, ...args) => {
      const id = self._native.setInterval(cb, delay, ...args);
      self._intervals.set(id, { cb, delay, args });
      return id;
    };
    window[`${ns}_clearInterval`] = (id) => {
      self._intervals.delete(id);
      self._native.clearInterval(id);
    };
    window[`${ns}_setTimeout`] = (cb, delay = 0, ...args) => {
      let tid;
      const wrapped = (...a) => { self._timeouts.delete(tid); cb(...a); };
      tid = self._native.setTimeout(wrapped, delay, ...args);
      self._timeouts.set(tid, { cb, delay, createdAt: Date.now(), args });
      return tid;
    };
    window[`${ns}_clearTimeout`] = (tid) => {
      self._timeouts.delete(tid);
      self._native.clearTimeout(tid);
    };

    const _log = console.log.bind(console);
    const _error = console.error.bind(console);
    window[`${ns}_console`] = {
      log: (...args) => {
        _log(...args);
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
        if (!_isMediaPipeLog(msg)) self._appendConsole(msg);
      },
      error: (...args) => {
        _error(...args);
        const msg = args.map(a => a instanceof Error ? a.message : (typeof a === 'object' && a !== null ? JSON.stringify(a, null, 2) : String(a))).join(' ');
        if (!_isMediaPipeLog(msg)) self._appendConsole(`<span class="ar-console-err">${msg}</span>`);
      },
      warn: (...args) => {
        _log(...args);
        const msg = args.map(a => String(a)).join(' ');
        self._appendConsole(`<span class="ar-console-warn">${msg}</span>`);
      },
      clear: () => self.clearConsole(),
    };
  }

  _refreshDraw() {
    this._drawTargets.clear();
    this.draw = this._getDraw(0);
    window[`__ar_e${this.id}_draw`] = this.draw;
  }

  // ── Console ────────────────────────────────────────────────────────────────

  _appendConsole(html) {
    this.consoleEl.innerHTML += (this.consoleEl.innerHTML ? '<br>' : '') + html;
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
    // Only auto-show inline panel when console isn't popped out to a float window
    const isPopped = !!document.getElementById(`win-console-${this.id}`);
    if (!isPopped && this.consolePanel.style.display !== 'flex') {
      this.consolePanel.style.display = 'flex';
      this.consoleToggleBtn.classList.add('ar-btn-active');
      this.cm.refresh();
      this.inlineWidgets.refresh();
    }
  }

  clearConsole() {
    this.consoleEl.innerHTML = '';
    this.consolePanel.style.display = 'none';
    this.consoleToggleBtn.classList.remove('ar-btn-active');
    this.cm.refresh();
    this.inlineWidgets.refresh();
  }

  _popoutConsole() {
    const floatId = `win-console-${this.id}`;
    // Already popped out — focus it
    if (document.getElementById(floatId)) { this._wm.focus(floatId); return; }

    // Hide inline panel, move consoleEl into float window
    this.consolePanel.style.display = 'none';
    this.consoleToggleBtn.classList.remove('ar-btn-active');

    this._wm.spawn(`Console ${this.id}`, { id: floatId, type: 'html', html: '', w: 480, h: 240 });
    const floatWin = document.getElementById(floatId);
    const body = floatWin.querySelector('.wm-body');
    body.style.cssText += 'padding:0;overflow:hidden;';
    body.appendChild(this.consoleEl);

    // On float close → rescue consoleEl back into inline panel
    floatWin._wmOnClose = () => {
      this.consolePanel.appendChild(this.consoleEl);
      floatWin._wmOnClose = null;
      floatWin.remove();
    };

    this.cm.refresh();
    this.inlineWidgets.refresh();
  }

  // ── Blocks ─────────────────────────────────────────────────────────────────

  _addBlockToWorkspace(type, clientX, clientY) {
    if (!this.blocklyWorkspace) return;
    const ws = this.blocklyWorkspace;
    const block = ws.newBlock(type);
    block.initSvg(); block.render();
    const injectDiv = ws.getInjectionDiv();
    if (clientX != null) {
      const rect = injectDiv.getBoundingClientRect();
      block.moveTo({ x: (clientX - rect.left - ws.scrollX) / ws.scale, y: (clientY - rect.top - ws.scrollY) / ws.scale });
    } else {
      block.moveTo({ x: (-ws.scrollX + injectDiv.offsetWidth / 2) / ws.scale, y: (-ws.scrollY + injectDiv.offsetHeight / 2) / ws.scale });
    }
  }

  _openBlocks() {
    this.blocksMode = true;
    activeBlocksEditor = this;
    window.__ar_active_blocks_editor = this;
    this.editorWrap.style.display = 'none';
    this.blocksArea.style.display = 'flex';
    this._textBtn.classList.remove('ar-toggle-active');
    this._blocksBtn.classList.add('ar-toggle-active');
    this._positionThumb(true);

    if (!this.blocklyWorkspace) {
      this.blocklyWorkspace = initBlockly(this.blocksDiv);
      const toolkitWin = document.getElementById(this._toolkitWinId);
      if (toolkitWin) registerSidebarDeleteZone(this.blocklyWorkspace, toolkitWin);
      this.blocklyWorkspace.getAudioManager().setMuted(muteBtn.classList.contains('muted'));
    }

    if (this._blocksMuteCtrl) this._blocksMuteCtrl.style.display = '';

    if (workspaceIsEmpty(this.blocklyWorkspace)) {
      try {
        const json = jsToBlocks(this.cm.getValue());
        if (json) loadWorkspaceJSON(this.blocklyWorkspace, json);
      } catch (_) {}
    }
    resizeBlockly(this.blocklyWorkspace);
  }

  _closeBlocks() {
    if (this.blocklyWorkspace) {
      const code = workspaceIsEmpty(this.blocklyWorkspace) ? '' : getWorkspaceCode(this.blocklyWorkspace);
      this.cm.setValue(code);
      this.cm.setCursor(0);
    }
    if (this._blocksMuteCtrl) this._blocksMuteCtrl.style.display = 'none';
    this.blocksMode = false;
    if (activeBlocksEditor === this) activeBlocksEditor = null;
    if (window.__ar_active_blocks_editor === this) window.__ar_active_blocks_editor = null;
    this.blocksArea.style.display = 'none';
    this.editorWrap.style.display = '';
    this._textBtn.classList.add('ar-toggle-active');
    this._blocksBtn.classList.remove('ar-toggle-active');
    this._positionThumb(false);
    this.cm.refresh();
    this.inlineWidgets.refresh();
  }

  // ── Execution state machine ────────────────────────────────────────────────

  _setIdle() {
    this.btnState = 'idle';
    this.executeBtn.innerHTML = ICONS.play;
    this.executeBtn.title = 'Run';
    this.executeBtn.className = 'ar-btn ar-btn-green';
    this.stopBtn.style.display = 'none';
    this.clearCanvasBtn.style.display = 'none';
    this._updateTaskbarChip();
  }

  _setRunning() {
    this.btnState = 'running';
    this.executeBtn.innerHTML = ICONS.pause;
    this.executeBtn.title = 'Pause';
    this.executeBtn.className = 'ar-btn ar-btn-orange';
    this.stopBtn.style.display = '';
    this.clearCanvasBtn.style.display = '';
    this._updateTaskbarChip();
  }

  _setPaused() {
    this.btnState = 'paused';
    this.executeBtn.innerHTML = ICONS.play;
    this.executeBtn.title = 'Resume';
    this.executeBtn.className = 'ar-btn ar-btn-green';
    this.stopBtn.style.display = '';
    this.clearCanvasBtn.style.display = '';
    this._updateTaskbarChip();
  }

  _setStopped() {
    if (this.idleWatcher) { this._native.clearInterval(this.idleWatcher); this.idleWatcher = null; }
    this.btnState = 'stopped';
    this.executeBtn.innerHTML = ICONS.reset;
    this.executeBtn.title = 'Reset';
    this.executeBtn.className = 'ar-btn ar-btn-red';
    this.stopBtn.style.display = 'none';
    this.clearCanvasBtn.style.display = 'none';
    this._updateTaskbarChip();
  }

  _updateTaskbarChip() {
    const chip = document.querySelector(`.wm-taskbar-chip[data-win-id="${this.editorWinId}"]`);
    if (!chip) return;
    const dot = chip.querySelector('.wm-chip-dot');
    if (!dot) return;
    const colors = { idle: '#888', running: '#4caf50', paused: '#ff9800', stopped: '#f44336' };
    dot.style.background = colors[this.btnState] ?? '#888';
  }

  _startIdleWatcher() {
    this.idleWatcher = this._native.setInterval(() => {
      if (this.btnState !== 'running') { this._native.clearInterval(this.idleWatcher); this.idleWatcher = null; return; }
      if (this._intervals.size === 0 && this._listeners.length === 0 && (window.__ar_keepAlive?.size ?? 0) === 0)
        this._setStopped();
    }, 300);
  }

  stopRunning() {
    for (const id of this._intervals.keys()) this._native.clearInterval(id);
    for (const id of this._timeouts.keys()) this._native.clearTimeout(id);
    this._intervals.clear();
    this._timeouts.clear();
    this._listeners.forEach(({ target, type, handler, options }) =>
      target?.removeEventListener(type, handler, options));
    this._listeners = [];
    this._pausedState = null;
    this._setStopped();
  }

  pauseRunning() {
    if (this.idleWatcher) { this._native.clearInterval(this.idleWatcher); this.idleWatcher = null; }
    this._pausedState = freezeTimers(
      this._intervals, this._timeouts,
      this._native.clearInterval, this._native.clearTimeout,
    );
    this._setPaused();
  }

  resumeRunning() {
    const ns = `__ar_e${this.id}`;
    restoreTimers(this._pausedState, window[`${ns}_setInterval`], window[`${ns}_setTimeout`]);
    this._pausedState = null;
    this._setRunning();
    this._startIdleWatcher();
  }

  reset() {
    this._pausedState = null;
    this._listeners.forEach(({ target, type, handler, options }) =>
      target?.removeEventListener(type, handler, options));
    this._listeners = [];
    for (const id of this._intervals.keys()) this._native.clearInterval(id);
    for (const id of this._timeouts.keys()) this._native.clearTimeout(id);
    this._intervals.clear();
    this._timeouts.clear();
    stopVision();
    cleanupAudio();
    cleanupShaders();
    cleanupViz();
    cleanupMedia();
    cleanupCameras();
    cleanupCaptures();
    window.__ar_keepAlive = new Set();
    this._keepAlive = new Set();
    if (this.currentScript) { document.body.removeChild(this.currentScript); this.currentScript = null; }
    this._layerObjects.forEach(layer => layer.reset());
    this._layerObjects.clear();
    this._drawTargets.clear();
    for (const [z, c] of this._layers) {
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
      if (z !== 0) c.remove();
    }
    this._layers = new Map([[0, this.mainCanvas]]);
    this._getLayerCanvas = this._makeGetLayerCanvas();
    this._refreshDraw();
    this.idleWatcher = null;
    this._setIdle();
  }

  _showOutputWin() {
    const outputWin = document.getElementById(this.canvasWinId);
    const editorWin = document.getElementById(this.editorWinId);
    if (!outputWin || outputWin.style.display === 'flex') return;
    const desk = document.getElementById('desktop');
    const dw = desk.offsetWidth, dh = desk.offsetHeight;
    const editorLeft = editorWin?.offsetLeft ?? 0;
    const editorNewW = Math.round((dw - editorLeft) * 0.45);
    if (editorWin) editorWin.style.width = `${editorNewW}px`;
    outputWin.style.left   = `${editorLeft + editorNewW}px`;
    outputWin.style.top    = '0px';
    outputWin.style.width  = `${dw - editorLeft - editorNewW}px`;
    outputWin.style.height = `${dh}px`;
    outputWin.style.display = 'flex';
  }

  execute() {
    const blocksActive = this.blocksMode && this.blocklyWorkspace && !workspaceIsEmpty(this.blocklyWorkspace);
    const raw = blocksActive ? getWorkspaceCode(this.blocklyWorkspace) : this.cm.getValue();

    if (/\bvision\b|__ar_video|ShaderFX\.camera/.test(raw) && !window.__ar_camera_on) {
      this._appendConsole('<span class="ar-console-err">Cannot run: camera is off. Turn on your camera first.</span>');
      return;
    }
    if (/\b__ar_mic_stream\b/.test(raw) && !window.__ar_mic_on) {
      this._appendConsole('<span class="ar-console-err">Cannot run: mic is off. Turn on your mic first.</span>');
      return;
    }

    this.reset();
    this._showOutputWin();
    window.__ar_audioReady = startAudio();
    window.__ar_keepAlive = new Set();
    this._keepAlive = window.__ar_keepAlive;
    this.consoleEl.innerHTML = '';

    // Tag listeners to this editor during synchronous setup
    window.__ar_active_editor_id = this.id;
    // Expose per-editor containers so shared APIs (Shader) find the right DOM node
    window.__ar_fsContainer   = this.fsContainer;
    window.__ar_canvasWrapper = this.canvasWrapper;

    let protected_code;
    try { protected_code = addInfiniteLoopProtection(raw); }
    catch (_) { protected_code = raw; }

    const ns = `__ar_e${this.id}`;
    const preamble = [
      `const draw        = window.${ns}_draw;`,
      `const getCanvas   = window.${ns}_getCanvas;`,
      `const getLayer    = window.${ns}_getLayer;`,
      `const setInterval = window.${ns}_setInterval;`,
      `const clearInterval = window.${ns}_clearInterval;`,
      `const setTimeout  = window.${ns}_setTimeout;`,
      `const clearTimeout = window.${ns}_clearTimeout;`,
      `const console     = window.${ns}_console;`,
      `const stop        = () => window.__ar_instances?.get(${this.id})?.stopRunning();`,
      `const stopRunning = stop;`,
      `const pause       = () => window.__ar_instances?.get(${this.id})?.pauseRunning();`,
      `const resume      = () => window.__ar_instances?.get(${this.id})?.resumeRunning();`,
    ].join('\n');

    const code =
      `(async function(){\n${preamble}\nawait window.__ar_audioReady;\n${protected_code}\n})()` +
      `.catch(e => { const msg = window.__ar_friendlyError(e); window.${ns}_console.error('Error: ' + msg); window.__ar_instances?.get(${this.id})?._setStopped(); })` +
      `.then(() => { if(window.__ar_instances?.get(${this.id})?.btnState !== 'running') return; const inst = window.__ar_instances?.get(${this.id}); if(inst && inst._intervals.size===0 && inst._listeners.length===0 && (window.__ar_keepAlive?.size??0)===0) inst._setStopped(); });`;

    window.__ar_friendlyError = friendlyError;

    this._setRunning();
    const script = document.createElement('script');
    try { script.appendChild(document.createTextNode(code)); } catch (e) { script.text = code; }
    document.body.appendChild(script);
    this.currentScript = script;
    this._startIdleWatcher();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  destroy() {
    if (this.btnState === 'running' || this.btnState === 'paused') this.stopRunning();

    EditorInstance.removeFromManifest(this.id);

    const editorWin = document.getElementById(this.editorWinId);
    const canvasWin = document.getElementById(this.canvasWinId);
    if (editorWin) { editorWin._wmOnClose = null; editorWin.remove(); }
    if (canvasWin) { canvasWin._wmCleanup?.(); canvasWin.remove(); }

    const ns = `__ar_e${this.id}`;
    for (const key of Object.keys(window).filter(k => k.startsWith(ns + '_'))) {
      delete window[key];
    }
    window.__ar_instances?.delete(this.id);
  }

  // ── Manifest persistence ───────────────────────────────────────────────────

  static loadManifest() {
    try {
      const s = localStorage.getItem('vl-ide-editors');
      if (s) return JSON.parse(s);
    } catch (_) {}
    return [1];
  }

  static saveManifest(ids) {
    localStorage.setItem('vl-ide-editors', JSON.stringify(ids));
  }

  static removeFromManifest(id) {
    EditorInstance.saveManifest(EditorInstance.loadManifest().filter(i => i !== id));
  }
}

function _isMediaPipeLog(s) {
  return /^[IW]\d{4}|Graph successfully|TensorFlow Lite|gl_context|inference_feedback|gesture_recognizer_graph|face_landmarker_graph|landmark_projection|hand_gesture|Custom gesture/.test(s);
}
